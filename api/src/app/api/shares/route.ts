import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  DAILY_LIMIT_PER_PRACTICE, DOC_KINDS, MAX_FILES, MAX_TOTAL_BYTES, DEFAULT_EXPIRY_DAYS,
  b64url, buildShareMail, cleanMessage, cleanPractice, cleanupExpired, corsHeaders, fromB64url, hashAnswer, isB64url,
  isValidEmail, maskEmail, newShareId, rest, restJson, sealHalfB, sendShareMail, shareLink, storageRemove,
  storageUpload, userFromToken, wipeShare,
} from "@/lib/shares";

// POST: a practice sends documents (already encrypted in its browser) to a patient.
// GET ?docs=a,b: status of the shares of these documents, for the app.

export const runtime = "nodejs";

const json = (req: NextRequest, body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: corsHeaders(req.headers.get("origin")) });

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

interface InFile { kind: string; ref: string; iv: string; data: string; label_iv: string; label_enc: string }

export async function POST(req: NextRequest) {
  let user: { id: string } | null;
  try { user = await userFromToken(req.headers.get("authorization")); } catch (e) {
    console.error("[shares] not configured:", e);
    return json(req, { error: "Der Versand ist noch nicht eingerichtet." }, 503);
  }
  if (!user) return json(req, { error: "Bitte melde Dich erneut an." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Ungültige Anfrage." }, 400); }

  const files = Array.isArray(body.files) ? (body.files as InFile[]) : [];
  const factor = (body.factor || {}) as { type?: string; verifier?: unknown };
  const recipient = (body.recipient || {}) as { email?: unknown; first_name?: unknown };
  const practice = cleanPractice(body.practice);
  const message = cleanMessage(body.message);
  const factorType = factor.type === "code" ? "code" : factor.type === "dob" ? "dob" : "";

  if (!files.length || files.length > MAX_FILES) return json(req, { error: `Bitte 1 bis ${MAX_FILES} Dokumente auswählen.` }, 400);
  if (!practice) return json(req, { error: "Bitte trage den Praxisnamen in den Praxiseinstellungen ein." }, 400);
  if (!isValidEmail(recipient.email)) return json(req, { error: "Die E-Mail-Adresse ist ungültig." }, 400);
  // The browser sends a PBKDF2 verifier of the date of birth or code, never the value itself
  if (!factorType || !isB64url(factor.verifier, 32, 32)) return json(req, { error: factorType === "code" ? "Der Code ist ungültig." : "Das Geburtsdatum ist ungültig." }, 400);
  // half_a only passes through to build the link in the email; it is never stored
  if (!isB64url(body.half_b, 32, 32) || !isB64url(body.key_salt, 16, 16) || !isB64url(body.half_a, 32, 32)) return json(req, { error: "Ungültige Anfrage." }, 400);
  let total = 0;
  for (const f of files) {
    if (!DOC_KINDS.includes(f.kind as (typeof DOC_KINDS)[number]) || typeof f.ref !== "string" || f.ref.length > 80
      || !isB64url(f.iv, 12, 12) || !isB64url(f.label_iv, 12, 12) || !isB64url(f.label_enc, 1, 400) || !isB64url(f.data, 17, MAX_TOTAL_BYTES)) {
      return json(req, { error: "Ungültige Datei." }, 400);
    }
    total += Math.floor((f.data.length * 3) / 4);
  }
  if (total > MAX_TOTAL_BYTES) return json(req, { error: "Die Dokumente sind zusammen größer als 15 MB. Bitte einzeln senden." }, 413);

  // Per-practice daily limit protects the sending domain if an account is misused
  const since = new Date(Date.now() - 86400_000).toISOString();
  const countRes = await rest(`document_shares?user_id=eq.${user.id}&created_at=gt.${since}&select=id`, { method: "HEAD", prefer: "count=exact" });
  const sentToday = Number((countRes.headers.get("content-range") || "*/0").split("/")[1]) || 0;
  if (sentToday >= DAILY_LIMIT_PER_PRACTICE) return json(req, { error: "Heute wurden schon sehr viele Unterlagen versendet. Bitte versuche es morgen wieder." }, 429);

  void cleanupExpired();

  const id = newShareId();
  const expiryDays = Math.min(90, Math.max(1, Number(body.expires_days) || DEFAULT_EXPIRY_DAYS));
  const expiresAt = new Date(Date.now() + expiryDays * 86400_000).toISOString();
  const factorSalt = crypto.randomBytes(16);
  const sealed = sealHalfB(fromB64url(body.half_b as string));
  const paths: string[] = [];

  try {
    await restJson("document_shares", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({
        id,
        user_id: user.id,
        doc_refs: [...new Set(files.map((f) => f.ref))],
        doc_kinds: [...new Set(files.map((f) => f.kind))],
        expires_at: expiresAt,
        factor_type: factorType,
        factor_hash: hashAnswer(factor.verifier as string, factorSalt),
        factor_salt: b64url(factorSalt),
        key_salt: body.key_salt,
        half_b_enc: sealed.enc,
        half_b_iv: sealed.iv,
        recipient_masked: maskEmail(recipient.email as string),
        practice,
      }),
    });
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = `${id}/${i}`;
      const bytes = fromB64url(f.data);
      await storageUpload(path, bytes);
      paths.push(path);
      await restJson("document_share_files", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify({ share_id: id, position: i, storage_path: path, iv: f.iv, label_iv: f.label_iv, label_enc: f.label_enc, size_bytes: bytes.length }),
      });
    }
  } catch (e) {
    console.error("[shares] storing failed:", e);
    await storageRemove(paths);
    await rest(`document_shares?id=eq.${id}`, { method: "DELETE" });
    return json(req, { error: "Die Unterlagen konnten nicht gespeichert werden. Bitte versuche es noch einmal." }, 502);
  }

  const link = `${shareLink(id)}#${body.half_a as string}`;

  try {
    const mail = buildShareMail({
      firstName: typeof recipient.first_name === "string" ? recipient.first_name.trim().slice(0, 60) : "",
      practice,
      link,
      factorType,
      expiresAt,
      message,
    });
    const resendId = await sendShareMail({ to: (recipient.email as string).trim(), replyTo: practice.email, mail, practiceName: practice.name });
    if (resendId) await rest(`document_shares?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ resend_id: resendId }) });
  } catch (e) {
    console.error("[shares] sending failed:", e);
    await wipeShare(id, { revoked_at: new Date().toISOString(), delivery_status: "failed" });
    return json(req, { error: "Die E-Mail konnte nicht gesendet werden. Bitte versuche es später noch einmal." }, 502);
  }

  return json(req, { id, expires_at: expiresAt, recipient_masked: maskEmail(recipient.email as string), factor_type: factorType });
}

export async function GET(req: NextRequest) {
  let user: { id: string } | null;
  try { user = await userFromToken(req.headers.get("authorization")); } catch { return json(req, { error: "Der Versand ist noch nicht eingerichtet." }, 503); }
  if (!user) return json(req, { error: "Bitte melde Dich erneut an." }, 401);
  const refs = (req.nextUrl.searchParams.get("docs") || "").split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_.:-]{1,80}$/.test(s)).slice(0, 50);
  // No refs: still query once, so the app learns whether sending is set up
  if (!refs.length) refs.push("-");
  const list = `{${refs.map((r) => `"${r}"`).join(",")}}`;
  let shares: unknown[];
  try {
    shares = await restJson<unknown[]>(
    `document_shares?user_id=eq.${user.id}&doc_refs=ov.${encodeURIComponent(list)}&select=id,doc_refs,doc_kinds,created_at,expires_at,revoked_at,locked_at,opened_at,open_count,factor_type,recipient_masked,delivery_status,half_b_enc&order=created_at.desc&limit=100`,
    );
  } catch (e) {
    // e.g. migration not applied yet; the app then hides email sending
    console.error("[shares] list failed:", e);
    return json(req, { error: "Der Versand ist noch nicht eingerichtet." }, 503);
  }
  // Do not hand out secrets, only whether the link is still usable
  const out = (shares as Record<string, unknown>[]).map(({ half_b_enc, ...s }) => ({ ...s, active: !!half_b_enc }));
  return json(req, { shares: out });
}
