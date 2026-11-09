import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "@/lib/auth-hook";
import { rest, restJson } from "@/lib/shares";
import {
  EmailExistsError, accountStatus, generateAuthLink, hashToken, inviteState, isInviteToken, landingPage, linkTypeFor,
  type InviteRow, type LandingKind,
} from "@/lib/invites";

// The link in the invite email. GET only shows a page with a button (mail
// scanners prefetch links); the POST behind the button creates the Supabase
// link and redirects there, so its one-hour lifetime starts at the click.

export const runtime = "nodejs";

const html = (kind: LandingKind, token = "", status = 200) =>
  new NextResponse(landingPage(kind, token), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" },
  });

async function load(token: string): Promise<InviteRow | null> {
  const rows = await restJson<InviteRow[]>(
    `pms_invites?token_hash=eq.${hashToken(token)}&select=id,email,first_name,created_at,expires_at,sent_by,clicked_at,accepted_at,revoked_at,user_id&limit=1`,
  );
  return rows[0] || null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isInviteToken(token)) return html("unknown", "", 404);
  try {
    const invite = await load(token);
    if (!invite) return html("unknown", "", 404);
    const state = inviteState(invite);
    if (state === "accepted") return html("active");
    if (state !== "ok") return html(state, "", 410);
    return html("ok", token);
  } catch (e) {
    console.error("[invites] landing failed:", e);
    return html("error", "", 503);
  }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isInviteToken(token)) return html("unknown", "", 404);
  try {
    const invite = await load(token);
    if (!invite) return html("unknown", "", 404);
    const state = inviteState(invite);
    if (state === "accepted") return NextResponse.redirect(appUrl(), 303);
    if (state !== "ok") return html(state, "", 410);

    const account = await accountStatus(invite.email);
    const type = linkTypeFor(account);
    const now = new Date().toISOString();
    if (!type) {
      await rest(`pms_invites?id=eq.${invite.id}`, { method: "PATCH", body: JSON.stringify({ clicked_at: now, accepted_at: now, user_id: account.userId }) });
      return NextResponse.redirect(appUrl(), 303);
    }
    let result;
    try {
      result = await generateAuthLink(type, invite.email);
    } catch (e) {
      // Confirmed in the meantime: recovery sets the password just as well
      if (!(e instanceof EmailExistsError) || type !== "invite") throw e;
      result = await generateAuthLink("recovery", invite.email);
    }
    await rest(`pms_invites?id=eq.${invite.id}`, { method: "PATCH", body: JSON.stringify({ clicked_at: now, user_id: result.userId || account.userId }) });
    return NextResponse.redirect(result.link, 303);
  } catch (e) {
    console.error("[invites] click failed:", e);
    return html("error", "", 503);
  }
}
