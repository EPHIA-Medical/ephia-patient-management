import { NextRequest, NextResponse } from "next/server";
import { MAX_ATTEMPTS, corsHeaders, restJson, shareState, type ShareRow } from "@/lib/shares";

// Public: what the patient's opening page needs before the factor check.
// No documents, no secrets.

export const runtime = "nodejs";

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const headers = { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" };
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return NextResponse.json({ state: "unknown" }, { status: 404, headers });
  try {
    const rows = await restJson<ShareRow[]>(`document_shares?id=eq.${id}&select=expires_at,revoked_at,locked_at,half_b_enc,factor_type,attempts,practice,key_salt`);
    const s = rows[0];
    if (!s) return NextResponse.json({ state: "unknown" }, { status: 404, headers });
    const state = shareState(s);
    return NextResponse.json({
      state,
      factor_type: s.factor_type,
      attempts_left: Math.max(0, MAX_ATTEMPTS - s.attempts),
      expires_at: s.expires_at,
      key_salt: state === "ok" ? s.key_salt : undefined,
      practice: { name: s.practice?.name || "", email: s.practice?.email || "", phone: s.practice?.phone || "" },
    }, { headers });
  } catch (e) {
    console.error("[shares] meta failed:", e);
    return NextResponse.json({ state: "error" }, { status: 503, headers });
  }
}
