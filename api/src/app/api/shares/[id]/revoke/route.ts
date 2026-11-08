import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, restJson, userFromToken, wipeShare } from "@/lib/shares";

// The practice withdraws a link: files and secrets are deleted, the status row stays.

export const runtime = "nodejs";

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const headers = corsHeaders(req.headers.get("origin"));
  const { id } = await ctx.params;
  let user: { id: string } | null = null;
  try { user = await userFromToken(req.headers.get("authorization")); } catch { /* not configured */ }
  if (!user) return NextResponse.json({ error: "Bitte melde Dich erneut an." }, { status: 401, headers });
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return NextResponse.json({ error: "Unbekannter Link." }, { status: 404, headers });
  const rows = await restJson<{ id: string }[]>(`document_shares?id=eq.${id}&user_id=eq.${user.id}&select=id`);
  if (!rows.length) return NextResponse.json({ error: "Unbekannter Link." }, { status: 404, headers });
  await wipeShare(id, { revoked_at: new Date().toISOString() });
  return NextResponse.json({ ok: true }, { headers });
}
