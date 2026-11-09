/**
 * Secure document sending ("Sicherer Dokumentenversand", version A).
 *
 * The practice's browser encrypts each PDF with K = HKDF(halfA ‖ halfB ‖ F)
 * (see src/lib/shareCrypto.js in the app). This service only ever sees:
 *   - the ciphertext and halfB (stored; halfB encrypted with SHARE_KEY_SECRET),
 *   - a PBKDF2 verifier of the date of birth or code (stored as an scrypt hash;
 *     the date of birth itself never reaches the server),
 *   - halfA and the recipient address during the send call only, to put the link
 *     into the email (neither is stored; only a masked address is kept).
 * The patient's browser later sends nothing but the verifier; halfA stays after
 * '#' in the link. Nothing stored here can be decrypted on its own.
 */
import crypto from "node:crypto";
import { appUrl, supabaseUrl } from "@/lib/auth-hook";
import { escapeHtml, greeting, layout, paragraph, button, infoBox } from "@/lib/email-layout";

export const BUCKET = "document-shares";
export const MAX_ATTEMPTS = 5;
export const MAX_FILES = 5;
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
export const DAILY_LIMIT_PER_PRACTICE = 50;
export const IP_ATTEMPTS_PER_HOUR = 20;
export const DEFAULT_EXPIRY_DAYS = 30;
export const STATUS_RETENTION_DAYS = 365;
export const DOC_KINDS = ["rechnung", "behandlung", "hv", "aufklaerung"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

// ── encoding ──

export const b64url = (buf: Buffer | Uint8Array) => Buffer.from(buf).toString("base64url");
export const fromB64url = (s: string) => Buffer.from(String(s || ""), "base64url");

export function newShareId(): string {
  return b64url(crypto.randomBytes(16));
}

// ── validation ──

export const isB64url = (s: unknown, minBytes = 1, maxBytes = Infinity): s is string => {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s)) return false;
  const n = Math.floor((s.length * 3) / 4);
  return n >= minBytes && n <= maxBytes;
};

export function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && v.length <= 254 && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/.test(v.trim());
}

/** "anna.muster@gmail.com" → "a•••@gmail.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split("@");
  return `${(local || "").slice(0, 1)}•••@${domain || ""}`;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

export interface PracticeInfo { name: string; email: string; phone: string }

export function cleanPractice(raw: unknown): PracticeInfo | null {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = clean(p.name, 120);
  if (!name) return null;
  const email = isValidEmail(p.email) ? String(p.email).trim() : "";
  return { name, email, phone: clean(p.phone, 40) };
}

export function cleanMessage(v: unknown): string {
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500) : "";
}

// ── secrets ──

function shareSecret(): Buffer {
  const raw = process.env.SHARE_KEY_SECRET || "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("SHARE_KEY_SECRET must be 32 bytes, base64");
  return key;
}

export function sealHalfB(halfB: Buffer): { enc: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", shareSecret(), iv);
  const enc = Buffer.concat([c.update(halfB), c.final(), c.getAuthTag()]);
  return { enc: b64url(enc), iv: b64url(iv) };
}

export function openHalfB(enc: string, iv: string): Buffer {
  const data = fromB64url(enc);
  const d = crypto.createDecipheriv("aes-256-gcm", shareSecret(), fromB64url(iv));
  d.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
}

// The verifier is already a 600k-round PBKDF2 output; scrypt on top keeps a database copy useless for replay
const SCRYPT = { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashAnswer(answer: string, salt: Buffer): string {
  return b64url(crypto.scryptSync(answer, salt, 32, SCRYPT));
}

export function answerMatches(answer: string, saltB64: string, hashB64: string): boolean {
  const expected = fromB64url(hashB64);
  const got = crypto.scryptSync(answer, fromB64url(saltB64), 32, SCRYPT);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

export function ipHash(ip: string): string {
  return crypto.createHmac("sha256", shareSecret()).update(ip).digest("base64url").slice(0, 22);
}

// ── simple per-process rate limit for unlock attempts by IP ──

const ipHits = new Map<string, number[]>();
export function ipAllowed(key: string, nowMs = Date.now()): boolean {
  const since = nowMs - 3600_000;
  const list = (ipHits.get(key) || []).filter((t) => t > since);
  if (list.length >= IP_ATTEMPTS_PER_HOUR) { ipHits.set(key, list); return false; }
  list.push(nowMs);
  ipHits.set(key, list);
  if (ipHits.size > 5000) for (const [k, v] of ipHits) if (!v.some((t) => t > since)) ipHits.delete(k);
  return true;
}

// ── Supabase (service role) ──

function serviceKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return k;
}

export function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const k = serviceKey();
  // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys only in apikey.
  return { apikey: k, ...(k.startsWith("eyJ") ? { Authorization: `Bearer ${k}` } : {}), ...extra };
}

export async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
  const headers = serviceHeaders({ "Content-Type": "application/json", ...(init.prefer ? { Prefer: init.prefer } : {}) });
  return fetch(`${supabaseUrl()}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> || {}) } });
}

export async function restJson<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const res = await rest(path, init);
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path.split("?")[0]} failed (${res.status}): ${await res.text().catch(() => "")}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** The practice behind a request: verified by Supabase Auth itself. */
export async function userFromToken(authHeader: string | null): Promise<{ id: string; emailConfirmed: boolean } | null> {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { apikey: serviceKey(), Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string; email_confirmed_at?: string | null; confirmed_at?: string | null };
  return user?.id ? { id: user.id, emailConfirmed: !!(user.email_confirmed_at || user.confirmed_at) } : null;
}

/**
 * Sender details come from the practice's own stored settings (profiles.practice_data,
 * plaintext business data), never from the request: a misused account must not be
 * able to send "Deine Unterlagen von <any name>" from our domain.
 */
export async function practiceOf(userId: string): Promise<PracticeInfo | null> {
  const rows = await restJson<{ practice_data: unknown }[]>(`profiles?id=eq.${encodeURIComponent(userId)}&select=practice_data`);
  const data = rows[0]?.practice_data;
  return data && typeof data === "object" ? cleanPractice(data) : null;
}

/** Only accounts that accepted the AVV (professional use) may send. */
export async function hasAcceptedAvv(userId: string): Promise<boolean> {
  const rows = await restJson<unknown[]>(`avv_acceptances?user_id=eq.${encodeURIComponent(userId)}&select=version&limit=1`);
  return rows.length > 0;
}

export async function storageUpload(path: string, bytes: Buffer): Promise<void> {
  const res = await fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/octet-stream", "x-upsert": "false" }),
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${await res.text().catch(() => "")}`);
}

export async function storageSignedUrl(path: string, expiresIn = 300): Promise<string> {
  const res = await fetch(`${supabaseUrl()}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(`Storage sign failed (${res.status})`);
  const { signedURL } = (await res.json()) as { signedURL: string };
  return `${supabaseUrl()}/storage/v1${signedURL}`;
}

export async function storageRemove(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const res = await fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) console.error(`[shares] storage remove failed (${res.status})`);
}

/** Removes the ciphertext and secrets of one share; the status row stays. */
export async function wipeShare(id: string, fields: Record<string, unknown> = {}): Promise<void> {
  const files = await restJson<{ storage_path: string }[]>(`document_share_files?share_id=eq.${encodeURIComponent(id)}&select=storage_path`);
  await storageRemove(files.map((f) => f.storage_path));
  await restJson(`document_share_files?share_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  await restJson(`document_shares?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ half_b_enc: null, half_b_iv: null, factor_hash: null, factor_salt: null, ...fields }),
  });
}

/**
 * Housekeeping, run lazily on send calls (at most every 10 minutes per process):
 * expired links lose their files and secrets, IP hashes go after 7 days,
 * status rows after a year.
 */
let lastCleanup = 0;
export async function cleanupExpired(nowMs = Date.now()): Promise<void> {
  if (nowMs - lastCleanup < 10 * 60_000) return;
  lastCleanup = nowMs;
  try {
    const now = new Date(nowMs).toISOString();
    const expired = await restJson<{ id: string }[]>(`document_shares?expires_at=lt.${now}&half_b_enc=not.is.null&select=id&limit=200`);
    for (const s of expired) await wipeShare(s.id);
    const weekAgo = new Date(nowMs - 7 * 86400_000).toISOString();
    await rest(`document_share_attempts?at=lt.${weekAgo}&ip_hash=not.is.null`, { method: "PATCH", body: JSON.stringify({ ip_hash: null }) });
    const yearAgo = new Date(nowMs - STATUS_RETENTION_DAYS * 86400_000).toISOString();
    await rest(`document_shares?created_at=lt.${yearAgo}`, { method: "DELETE" });
  } catch (e) {
    console.error("[shares] cleanup failed:", e);
  }
}

// ── status shown to the patient's page ──

export interface ShareRow {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
  locked_at: string | null;
  opened_at: string | null;
  open_count: number;
  factor_type: "dob" | "code";
  factor_hash: string | null;
  factor_salt: string | null;
  key_salt: string;
  half_b_enc: string | null;
  half_b_iv: string | null;
  attempts: number;
  practice: PracticeInfo;
}

export type ShareState = "ok" | "expired" | "revoked" | "locked";

export function shareState(s: Pick<ShareRow, "expires_at" | "revoked_at" | "locked_at" | "half_b_enc">, nowMs = Date.now()): ShareState {
  if (s.revoked_at) return "revoked";
  if (s.locked_at) return "locked";
  if (!s.half_b_enc || Date.parse(s.expires_at) <= nowMs) return "expired";
  return "ok";
}

// ── the email ──

export function shareLink(id: string): string {
  return `${appUrl().replace(/\/+$/, "")}/d/?s=${encodeURIComponent(id)}`;
}

const fmtDateDe = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};

export interface ShareMailArgs {
  firstName: string;
  practice: PracticeInfo;
  link: string; // full link including #halfA
  factorType: "dob" | "code";
  expiresAt: string;
  message: string;
}

export function buildShareMail(a: ShareMailArgs): { subject: string; html: string; text: string } {
  const practice = escapeHtml(a.practice.name);
  const subject = `Deine Unterlagen von ${a.practice.name}`;
  const how = a.factorType === "code"
    ? "Zum Öffnen brauchst Du den sechsstelligen Code, den Du von der Praxis bekommen hast."
    : "Zum Öffnen brauchst Du Dein Geburtsdatum.";
  const messageHtml = a.message
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="border-left:3px solid #e3ddd8;padding:4px 0 4px 14px;font-family:Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#14151f;">${escapeHtml(a.message).replace(/\n/g, "<br>")}</td></tr></table>`
    : "";
  const contact = [a.practice.phone, a.practice.email].filter(Boolean).map(escapeHtml).join(" · ");
  const body = [
    greeting(a.firstName),
    paragraph(`${practice} hat Dir Deine Unterlagen bereitgestellt. ${escapeHtml(how)}`),
    messageHtml,
    button(a.link, "Unterlagen öffnen"),
    infoBox("Gültig bis", fmtDateDe(a.expiresAt)),
    paragraph(`Die Unterlagen liegen verschlüsselt vor. Nur Du kannst sie mit diesem Link und ${a.factorType === "code" ? "dem Code" : "Deinem Geburtsdatum"} öffnen. Antworten auf diese E-Mail gehen direkt an ${practice}.`),
    `<p style="margin:28px 0 0;font-family:Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#14151f;">Liebe Grüße</p><p style="margin:6px 0 0;font-family:Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#14151f;"><strong>${practice}</strong>${contact ? `<br><span style="color:#61626f;">${contact}</span>` : ""}</p>`,
    `<p style="margin:24px 0 0;font-family:Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#61626f;">Versendet über das EPHIA Patient Management System im Auftrag von ${practice}.</p>`,
  ].filter(Boolean).join("\n");
  const html = layout(`${a.practice.name} hat Dir Deine Unterlagen bereitgestellt.`, body, subject);
  const text = [
    `Hallo${a.firstName ? ` ${a.firstName}` : ""},`,
    "",
    `${a.practice.name} hat Dir Deine Unterlagen bereitgestellt. ${how}`,
    a.message ? `\n${a.message}\n` : "",
    `Unterlagen öffnen: ${a.link}`,
    `Gültig bis: ${fmtDateDe(a.expiresAt)}`,
    "",
    `Antworten auf diese E-Mail gehen direkt an ${a.practice.name}.`,
    "",
    "Liebe Grüße",
    a.practice.name,
    [a.practice.phone, a.practice.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== undefined).join("\n");
  return { subject, html, text };
}

export async function sendShareMail(args: { to: string; replyTo: string; mail: { subject: string; html: string; text: string }; practiceName: string }): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  const sender = (process.env.SHARE_EMAIL_FROM_ADDRESS || "noreply@ephia.de").trim();
  // Display name: "{Praxis} über EPHIA"; quotes and angle brackets would break the header.
  const display = `${args.practiceName} über EPHIA`.replace(/["<>\\]/g, "").slice(0, 100);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `"${display}" <${sender}>`,
      to: [args.to],
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      subject: args.mail.subject,
      html: args.mail.html,
      text: args.mail.text,
      tags: [{ name: "ephia-purpose", value: "pms-document-share" }],
    }),
  });
  if (!res.ok) throw new Error(`Resend failed (${res.status}): ${await res.text().catch(() => "")}`);
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return json.id || "";
}

// ── CORS: the app (GitHub Pages) and local dev call this service ──

export function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  const app = (() => { try { return new URL(appUrl()).origin; } catch { return ""; } })();
  const allowed = [app, "http://localhost:5173", "http://localhost:4173"];
  return allowed.includes(origin) ? origin : null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const o = allowedOrigin(origin);
  return o
    ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" }
    : { Vary: "Origin" };
}
