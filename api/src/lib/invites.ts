/**
 * Invitations to the EPHIA Patient Management System.
 *
 * admin.ephia.de calls POST /api/invites (shared secret PMS_INVITE_SECRET).
 * This service stores the invite (migration 0006, only a SHA-256 of the link
 * token) and emails a link to /i/<token> on this service, valid 14 days.
 *
 * /i/<token> answers GET with a page holding one button, and only the POST
 * behind that button asks Supabase for an auth link. So mail scanners that
 * prefetch links cannot use up the one-hour Supabase link, and that hour
 * starts at the doctor's click, not at sending.
 *
 * E2EE: nothing here touches key material. The doctor's browser creates the
 * MEK at the first password login, exactly as after a normal signup.
 */
import crypto from "node:crypto";
import { appUrl, buildVerifyLink, resolveSender, supabaseUrl } from "@/lib/auth-hook";
import { escapeHtml, greeting, infoBox, layout, paragraph, button, teamSignature, EMAIL_TOKENS } from "@/lib/email-layout";
import { PRODUCT_NAME } from "@/lib/auth-emails";
import { b64url, serviceHeaders } from "@/lib/shares";

export const INVITE_EXPIRY_DAYS = 14;

// ── tokens and the shared secret ──

export function hashToken(token: string): string {
  return b64url(crypto.createHash("sha256").update(token).digest());
}

export function newInviteToken(): { token: string; hash: string } {
  const token = b64url(crypto.randomBytes(32));
  return { token, hash: hashToken(token) };
}

export const isInviteToken = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);

/** Bearer PMS_INVITE_SECRET from admin.ephia.de. Compared in constant time. */
export function inviteSecretOk(authHeader: string | null): boolean {
  const secret = process.env.PMS_INVITE_SECRET || "";
  if (secret.length < 32) return false;
  const given = (authHeader || "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

export function cleanFirstName(v: unknown): string {
  if (typeof v !== "string") return "";
  const name = v.trim();
  return /^\p{L}[\p{L} '\-.]{0,39}$/u.test(name) ? name : "";
}

// ── links ──

/** Public base URL of this service, where /i/<token> lives. */
export function apiBaseUrl(): string {
  return (process.env.API_URL || "https://api.pms.ephia.de").replace(/\/+$/, "");
}

export function inviteLink(token: string): string {
  return `${apiBaseUrl()}/i/${token}`;
}

/** Where Supabase lands after verifying; ?einladung=1 shows the welcome wording in the app. */
export function inviteRedirectTo(): string {
  const u = new URL(appUrl());
  u.searchParams.set("einladung", "1");
  return u.toString();
}

// ── state ──

export interface InviteRow {
  id: string;
  email: string;
  first_name: string;
  created_at: string;
  expires_at: string;
  sent_by: string;
  clicked_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  user_id: string | null;
}

export type InviteState = "ok" | "expired" | "revoked" | "accepted";

export function inviteState(r: Pick<InviteRow, "expires_at" | "revoked_at" | "accepted_at">, nowMs = Date.now()): InviteState {
  if (r.accepted_at) return "accepted";
  if (r.revoked_at) return "revoked";
  if (new Date(r.expires_at).getTime() <= nowMs) return "expired";
  return "ok";
}

export interface AccountStatus { userId: string | null; confirmed: boolean; hasKeys: boolean }

export async function accountStatus(email: string): Promise<AccountStatus> {
  const res = await fetch(`${supabaseUrl()}/rest/v1/rpc/pms_account_status`, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ p_email: email }),
  });
  if (!res.ok) throw new Error(`pms_account_status failed (${res.status}): ${await res.text().catch(() => "")}`);
  const rows = (await res.json()) as { user_id: string; confirmed: boolean; has_keys: boolean }[];
  const r = rows[0];
  return r ? { userId: r.user_id, confirmed: !!r.confirmed, hasKeys: !!r.has_keys } : { userId: null, confirmed: false, hasKeys: false };
}

/**
 * Which Supabase link the click needs:
 *   no account or an unconfirmed one → invite (creates or confirms it)
 *   confirmed but never logged in with a password (e.g. a mail scanner
 *   already used an earlier invite link) → recovery, which sets the password
 *   keys exist → none; the doctor just logs in
 */
export function linkTypeFor(a: AccountStatus): "invite" | "recovery" | null {
  if (a.hasKeys) return null;
  return a.userId && a.confirmed ? "recovery" : "invite";
}

export class EmailExistsError extends Error {}

/** Admin generate_link: no mail is sent by Supabase, we get the token hash. */
export async function generateAuthLink(type: "invite" | "recovery", email: string): Promise<{ link: string; userId: string | null }> {
  const redirectTo = inviteRedirectTo();
  const res = await fetch(`${supabaseUrl()}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ type, email, redirect_to: redirectTo }),
  });
  const data = (await res.json().catch(() => ({}))) as { hashed_token?: string; id?: string; error_code?: string; code?: string | number; msg?: string };
  if (!res.ok) {
    if (data.error_code === "email_exists" || res.status === 422) throw new EmailExistsError(data.msg || "email exists");
    throw new Error(`generate_link ${type} failed (${res.status}): ${data.msg || ""}`);
  }
  if (!data.hashed_token) throw new Error("generate_link returned no hashed_token");
  return { link: buildVerifyLink(data.hashed_token, type, redirectTo), userId: data.id || null };
}

// ── the email ──

const fmtDateDe = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};

export function buildInviteMail(a: { firstName: string; link: string; expiresAt: string }): { subject: string; html: string; text: string } {
  const subject = `Deine Einladung zum ${PRODUCT_NAME}`;
  const intro = `wir haben Dir einen Zugang zum ${PRODUCT_NAME} eingerichtet. Damit dokumentierst Du Deine Behandlungen und schreibst Rechnungen für Deine Patient:innen an einem Ort.`;
  const keys = "Beim ersten Öffnen wählst Du Dein Passwort. Deine Patient:innendaten werden damit in Deinem Browser verschlüsselt, bevor sie gespeichert werden.";
  const help = "Fragen beantworten wir Dir gern unter customerlove@ephia.de.";
  const body = [
    greeting(a.firstName),
    paragraph(escapeHtml(intro)),
    button(a.link, "Einladung annehmen"),
    infoBox("Einladung gültig bis", fmtDateDe(a.expiresAt)),
    paragraph(escapeHtml(keys)),
    paragraph(escapeHtml(help)),
    teamSignature(),
  ].join("\n");
  const html = layout(`Dein Zugang zum ${PRODUCT_NAME} ist bereit.`, body, subject);
  const text = [
    `Hallo${a.firstName ? ` ${a.firstName}` : ""},`,
    "",
    intro,
    "",
    `Einladung annehmen: ${a.link}`,
    `Einladung gültig bis: ${fmtDateDe(a.expiresAt)}`,
    "",
    keys,
    "",
    help,
    "",
    "Liebe Grüße",
    "Dein EPHIA-Team",
  ].join("\n");
  return { subject, html, text };
}

export async function sendInviteMail(to: string, mail: { subject: string; html: string; text: string }): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: resolveSender(process.env.EMAIL_FROM).from,
      to: [to],
      reply_to: "customerlove@ephia.de",
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: [{ name: "ephia-purpose", value: "pms-invite" }],
    }),
  });
  if (!res.ok) throw new Error(`Resend failed (${res.status}): ${await res.text().catch(() => "")}`);
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return json.id || "";
}

// ── the landing page behind the link ──

export type LandingKind = "ok" | "expired" | "revoked" | "unknown" | "active" | "error";

const LANDING: Record<LandingKind, { title: string; text: string; cta?: "form" | "login" }> = {
  ok: { title: `Willkommen beim ${PRODUCT_NAME}`, text: "Klicke auf den Button, um Dein Passwort festzulegen. Danach meldest Du Dich mit Deiner E-Mail-Adresse an.", cta: "form" },
  active: { title: "Dein Konto ist schon eingerichtet", text: "Du kannst Dich mit Deiner E-Mail-Adresse und Deinem Passwort anmelden.", cta: "login" },
  expired: { title: "Diese Einladung ist abgelaufen", text: "Schreib uns an customerlove@ephia.de, dann schicken wir Dir eine neue Einladung." },
  revoked: { title: "Es gibt eine neuere Einladung", text: "Bitte nutze den Link aus der neuesten E-Mail von uns. Falls Du sie nicht findest, schreib uns an customerlove@ephia.de." },
  unknown: { title: "Diese Einladung kennen wir nicht", text: "Bitte prüfe, ob Du den Link vollständig geöffnet hast, oder schreib uns an customerlove@ephia.de." },
  error: { title: "Gerade hat etwas nicht geklappt", text: "Bitte versuche es in ein paar Minuten noch einmal. Wenn es weiter nicht geht, schreib uns an customerlove@ephia.de." },
};

export function landingPage(kind: LandingKind, token = ""): string {
  const c = LANDING[kind];
  const T = EMAIL_TOKENS;
  const cta = c.cta === "form" && isInviteToken(token)
    ? `<form method="post" action="/i/${token}"><button type="submit">Passwort festlegen</button></form>`
    : c.cta === "login"
      ? `<a class="btn" href="${escapeHtml(appUrl())}">Zur Anmeldung</a>`
      : "";
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(c.title)}</title>
<style>
body{margin:0;background:#FAEBE1;font-family:${T.fontStack};color:${T.text};display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
main{background:#fff;border-radius:10px;padding:32px 28px;max-width:420px;width:100%;box-sizing:border-box}
img{display:block;width:96px;height:24px;margin:0 0 24px}
h1{font-size:21px;line-height:1.3;margin:0 0 12px}
p{font-size:15px;line-height:1.6;margin:0 0 24px;color:${T.muted}}
button,.btn{display:inline-block;background:${T.primary};color:#fff;border:0;border-radius:10px;padding:13px 24px;font:600 15px ${T.fontStack};text-decoration:none;cursor:pointer}
</style></head>
<body><main><img src="${T.logoUrl}" alt="EPHIA"><h1>${escapeHtml(c.title)}</h1><p>${escapeHtml(c.text)}</p>${cta}</main></body></html>`;
}
