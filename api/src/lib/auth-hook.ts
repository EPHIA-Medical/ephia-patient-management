import crypto from "crypto";

/**
 * Pure helpers for the Supabase Auth "Send Email" hook.
 *
 * The Patient Management System frontend is a static SPA; Supabase Auth
 * posts every auth email it would otherwise send via its built-in SMTP to
 * src/app/api/auth/email-hook/route.ts, which builds the EPHIA mail and
 * sends it through Resend.
 *
 * Hook payload (Supabase docs, "Send Email Hook"):
 *   { user: { id, email, new_email?, user_metadata, ... },
 *     email_data: { token, token_hash, redirect_to, email_action_type,
 *                   site_url, token_new, token_hash_new, old_email?, ... } }
 *
 * No server-only imports so vitest covers it (auth-hook.test.ts).
 */

/** API URL of the Supabase project; required in production. */
export function supabaseUrl(): string {
  const v = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  if (!v) throw new Error("SUPABASE_URL is not set");
  return v;
}

/** Where a verified link lands when the payload carries no redirect_to. */
export function appUrl(): string {
  return process.env.APP_URL || "https://invoicing.ephia.de/";
}

/** Standard Webhooks headers Supabase signs the request with. */
const HEADER_ID = "webhook-id";
const HEADER_TIMESTAMP = "webhook-timestamp";
const HEADER_SIGNATURE = "webhook-signature";

/** Replay window. */
const MAX_AGE_SECONDS = 300;

export interface SendEmailHookUser {
  id: string;
  email?: string | null;
  /** Pending address of an email change (GoTrue serialises EmailChange as new_email). */
  new_email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface SendEmailHookEmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
  old_email?: string;
}

export interface SendEmailHookPayload {
  user: SendEmailHookUser;
  email_data: SendEmailHookEmailData;
}

/** The mails the route knows how to build. One hook call may need two
 *  (secure email change: one to the current, one to the new address). */
export type AuthMailKind =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change_new"
  | "email_change_current"
  | "reauthentication";

export interface PlannedAuthMail {
  kind: AuthMailKind;
  to: string;
  /** Verification link, null for code-only mails. */
  link: string | null;
  /** Six-digit OTP, only used by code mails. */
  code: string | null;
  /** Pending address, set on both email-change mails. */
  newEmail: string | null;
}

/** Notification types GoTrue can emit when enabled. They carry no token;
 *  the route acknowledges them without sending (none are enabled). */
const NOTIFICATION_SUFFIX = "_notification";

// ── Signature ───────────────────────────────────────────────────────────

/** Raw HMAC key bytes out of the dashboard secret (`v1,whsec_<base64>`,
 *  `whsec_<base64>` or bare base64). Null when it does not decode. */
export function hookSecretBytes(secret: string): Buffer | null {
  let s = secret.trim();
  if (s.startsWith("v1,")) s = s.slice(3);
  if (s.startsWith("whsec_")) s = s.slice(6);
  if (!s) return null;
  const bytes = Buffer.from(s, "base64");
  return bytes.length > 0 ? bytes : null;
}

/** Signature header value for `${id}.${timestamp}.${body}`. Used by the
 *  tests and the manual test script to produce a request Supabase would. */
export function signStandardWebhook(
  rawBody: string,
  id: string,
  timestampSeconds: number,
  secret: string,
): string {
  const key = hookSecretBytes(secret);
  if (!key) throw new Error("invalid webhook secret");
  const sig = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestampSeconds}.${rawBody}`)
    .digest("base64");
  return `v1,${sig}`;
}

/**
 * Standard Webhooks verification (the scheme Svix and Supabase Auth use):
 * HMAC-SHA256 over `${id}.${timestamp}.${body}`, base64, any of the
 * space-separated `v1,<sig>` entries may match (key rotation).
 */
export function verifyStandardWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  const id = headers.get(HEADER_ID);
  const timestamp = headers.get(HEADER_TIMESTAMP);
  const signatureHeader = headers.get(HEADER_SIGNATURE);
  if (!id || !timestamp || !signatureHeader) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  if (Math.abs(nowMs / 1000 - sentAt) > MAX_AGE_SECONDS) return false;

  const key = hookSecretBytes(secret);
  if (!key) return false;

  const expected = Buffer.from(
    crypto
      .createHmac("sha256", key)
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest("base64"),
  );

  return signatureHeader
    .split(" ")
    .map((part) => {
      const idx = part.indexOf(",");
      return idx >= 0 ? part.slice(idx + 1) : "";
    })
    .filter((s) => s.length > 0)
    .some((sig) => {
      const buf = Buffer.from(sig);
      return buf.length === expected.length && crypto.timingSafeEqual(buf, expected);
    });
}

// ── Payload ─────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Shape check with defaults; null when user or email_data is missing. */
export function parseHookPayload(raw: unknown): SendEmailHookPayload | null {
  if (!isRecord(raw) || !isRecord(raw.user) || !isRecord(raw.email_data)) return null;
  const u = raw.user;
  const d = raw.email_data;
  if (!str(u.id) || !str(d.email_action_type)) return null;
  return {
    user: {
      id: str(u.id),
      email: str(u.email) || null,
      new_email: str(u.new_email) || null,
      user_metadata: isRecord(u.user_metadata) ? u.user_metadata : null,
    },
    email_data: {
      token: str(d.token),
      token_hash: str(d.token_hash),
      redirect_to: str(d.redirect_to),
      email_action_type: str(d.email_action_type),
      site_url: str(d.site_url),
      token_new: str(d.token_new),
      token_hash_new: str(d.token_hash_new),
      old_email: str(d.old_email),
    },
  };
}

/**
 * First name for the greeting, if the account carries a plausible one.
 * user_metadata is written by the signup call itself, so anyone can put
 * arbitrary text there (a phishing line, a URL). Only letters, spaces,
 * hyphens and apostrophes up to 40 characters pass; anything else greets
 * with "Hallo,".
 */
export function hookUserFirstName(user: SendEmailHookUser): string {
  const v = user.user_metadata?.first_name;
  if (typeof v !== "string") return "";
  const name = v.trim();
  return /^\p{L}[\p{L} '\-]{0,39}$/u.test(name) ? name : "";
}

// ── Links ───────────────────────────────────────────────────────────────

/** http(s) only; anything else falls back to the app root. Supabase has
 *  already checked redirect_to against the project's allow list. */
export function safeRedirectTo(value: string): string {
  try {
    const u = new URL(value);
    if (u.protocol === "https:" || u.protocol === "http:") return u.href;
  } catch {
    // fall through
  }
  return appUrl();
}

/**
 * The link Supabase's default templates build as {{ .ConfirmationURL }}:
 * GoTrue verifies the token hash and redirects to redirect_to with the
 * session in the URL hash (implicit flow, handled by the SPA's
 * checkSession) or with ?code= for PKCE token hashes.
 */
export function buildVerifyLink(
  tokenHash: string,
  type: "signup" | "invite" | "magiclink" | "recovery" | "email_change",
  redirectTo: string,
): string {
  const url = new URL("/auth/v1/verify", supabaseUrl());
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("redirect_to", safeRedirectTo(redirectTo));
  return url.toString();
}

// ── Planning ────────────────────────────────────────────────────────────

/**
 * Which mails one hook call needs. Empty for notification types and for
 * action types the route does not know; the route logs those.
 *
 * Email change pairing (GoTrue internal/api/mail.go, counter-intuitive on
 * purpose for backwards compatibility): with Secure Email Change the current
 * address verifies `token_hash_new`, the new address verifies `token_hash`.
 * Without it only the new address gets a mail, with `token_hash`.
 */
export function planAuthMails(payload: SendEmailHookPayload): PlannedAuthMail[] {
  const { user, email_data: d } = payload;
  const type = d.email_action_type;
  const current = user.email ?? "";
  const pending = user.new_email ?? "";

  if (type.endsWith(NOTIFICATION_SUFFIX)) return [];

  const linkMail = (
    kind: Exclude<AuthMailKind, "reauthentication">,
    to: string,
    tokenHash: string,
    verifyType: Parameters<typeof buildVerifyLink>[1],
  ): PlannedAuthMail | null =>
    to && tokenHash
      ? {
          kind,
          to,
          link: buildVerifyLink(tokenHash, verifyType, d.redirect_to),
          code: null,
          newEmail: pending || null,
        }
      : null;

  switch (type) {
    case "signup":
    case "invite":
    case "magiclink":
    case "recovery": {
      const m = linkMail(type, current, d.token_hash, type);
      return m ? [m] : [];
    }
    case "email_change": {
      const out: PlannedAuthMail[] = [];
      if (d.token_hash_new && current) {
        // Secure Email Change: both addresses confirm.
        const cur = linkMail("email_change_current", current, d.token_hash_new, "email_change");
        if (cur) out.push(cur);
        const nxt = linkMail("email_change_new", pending, d.token_hash, "email_change");
        if (nxt) out.push(nxt);
      } else {
        const nxt = linkMail("email_change_new", pending || current, d.token_hash, "email_change");
        if (nxt) out.push(nxt);
      }
      return out;
    }
    case "reauthentication": {
      if (!current || !d.token) return [];
      return [{ kind: "reauthentication", to: current, link: null, code: d.token, newEmail: null }];
    }
    default:
      return [];
  }
}

// ── Sender ──────────────────────────────────────────────────────────────

export const DEFAULT_FROM = "EPHIA <noreply@ephia.de>";

const BARE_ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const NAMED_ADDRESS = /^[^<>"]+ <[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+>$/;

/**
 * Sender for Resend out of EMAIL_FROM. Dashboards keep quotes typed around
 * a value as part of it, which Resend rejects with a 422 ("Invalid `from`
 * field"), so wrapping quotes are stripped. Anything still not in the
 * `a@b.c` or `Name <a@b.c>` shape falls back to the default sender.
 */
export function resolveSender(raw: string | undefined): { from: string; valid: boolean } {
  const v = (raw ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!v) return { from: DEFAULT_FROM, valid: true };
  if (BARE_ADDRESS.test(v) || NAMED_ADDRESS.test(v)) return { from: v, valid: true };
  return { from: DEFAULT_FROM, valid: false };
}
