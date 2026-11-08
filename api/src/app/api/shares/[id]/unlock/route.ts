import { NextRequest, NextResponse } from "next/server";
import {
  MAX_ATTEMPTS, answerMatches, b64url, corsHeaders, ipAllowed, ipHash, isB64url, openHalfB, rest, restJson,
  shareState, storageSignedUrl, type ShareRow,
} from "@/lib/shares";

// Public: the patient's browser sends the verifier of the date of birth or code.
// Right → halfB and short-lived download URLs of the encrypted files.
// Wrong → one attempt less; after 5 the link is locked for good.

export const runtime = "nodejs";

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

// Railway's proxy sets X-Real-IP; in X-Forwarded-For the client can prepend anything,
// only the last entry (added by the proxy) is trustworthy.
function clientIp(req: NextRequest): string {
  const xff = (req.headers.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return req.headers.get("x-real-ip") || xff.at(-1) || "unknown";
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const headers = { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return reply({ state: "unknown" }, 404);

  let ipKey = "";
  try { ipKey = ipHash(clientIp(req)); } catch { return reply({ error: "Der Abruf ist gerade nicht möglich." }, 503); }
  if (!ipAllowed(ipKey)) return reply({ error: "Zu viele Versuche. Bitte warte eine Stunde." }, 429);

  let body: { verifier?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "Ungültige Anfrage." }, 400); }
  if (!isB64url(body.verifier, 32, 32)) return reply({ error: "Ungültige Anfrage." }, 400);

  const rows = await restJson<ShareRow[]>(`document_shares?id=eq.${id}&select=*`);
  const s = rows[0];
  if (!s) return reply({ state: "unknown" }, 404);
  const state = shareState(s);
  if (state !== "ok" || !s.factor_hash || !s.factor_salt) return reply({ state }, 410);

  // Claim the attempt in the database first (atomic), then check: parallel requests
  // cannot get past the limit
  const claimed = await restJson<number | null>("rpc/share_claim_attempt", { method: "POST", body: JSON.stringify({ p_id: id }) });
  if (claimed == null) return reply({ state: "locked" }, 410);

  const ok = answerMatches(body.verifier as string, s.factor_salt, s.factor_hash);
  await rest("document_share_attempts", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ share_id: id, ok, ip_hash: ipKey }) });

  if (!ok) {
    const lock = claimed >= MAX_ATTEMPTS;
    if (lock) await rest(`document_shares?id=eq.${id}&locked_at=is.null`, { method: "PATCH", body: JSON.stringify({ locked_at: new Date().toISOString() }) });
    return reply({ state: lock ? "locked" : "ok", attempts_left: Math.max(0, MAX_ATTEMPTS - claimed) }, 401);
  }

  const files = await restJson<{ position: number; storage_path: string; iv: string; label_iv: string; label_enc: string; size_bytes: number }[]>(
    `document_share_files?share_id=eq.${id}&select=position,storage_path,iv,label_iv,label_enc,size_bytes&order=position.asc`,
  );
  const signed = await Promise.all(files.map(async (f) => ({
    url: await storageSignedUrl(f.storage_path, 300),
    iv: f.iv,
    label_iv: f.label_iv,
    label_enc: f.label_enc,
    size: f.size_bytes,
  })));
  await rest(`document_shares?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ attempts: 0, open_count: s.open_count + 1, ...(s.opened_at ? {} : { opened_at: new Date().toISOString() }) }),
  });
  return reply({ half_b: b64url(openHalfB(s.half_b_enc as string, s.half_b_iv as string)), key_salt: s.key_salt, files: signed });
}
