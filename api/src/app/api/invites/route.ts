import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, rest, restJson } from "@/lib/shares";
import {
  INVITE_EXPIRY_DAYS, accountStatus, buildInviteMail, cleanFirstName, inviteLink, inviteSecretOk, inviteState,
  newInviteToken, sendInviteMail, type InviteRow,
} from "@/lib/invites";

// Server to server only: admin.ephia.de sends invitations and reads their status.
// POST { email, first_name?, sent_by? } → { status: "invited", expires_at } | { status: "active" }
// GET ?email=…                            → { status: "none" | "invited" | "expired" | "active", ... }

export const runtime = "nodejs";

const SELECT = "id,email,first_name,created_at,expires_at,sent_by,clicked_at,accepted_at,revoked_at,user_id";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

async function latestInvite(email: string): Promise<InviteRow | null> {
  const rows = await restJson<InviteRow[]>(`pms_invites?email=eq.${encodeURIComponent(email)}&select=${SELECT}&order=created_at.desc&limit=1`);
  return rows[0] || null;
}

export async function POST(req: NextRequest) {
  if (!inviteSecretOk(req.headers.get("authorization"))) return unauthorized();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 }); }
  if (!isValidEmail(body.email)) return NextResponse.json({ error: "Die E-Mail-Adresse ist ungültig." }, { status: 400 });
  const email = (body.email as string).trim().toLowerCase();
  const firstName = cleanFirstName(body.first_name);
  const sentBy = typeof body.sent_by === "string" ? body.sent_by.trim().slice(0, 254) : "";

  try {
    const account = await accountStatus(email);
    if (account.hasKeys) return NextResponse.json({ status: "active" });

    // One open invite per address: older links stop working
    await rest(`pms_invites?email=eq.${encodeURIComponent(email)}&revoked_at=is.null&accepted_at=is.null`, {
      method: "PATCH",
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });

    const { token, hash } = newInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 86400_000).toISOString();
    const [row] = await restJson<{ id: string }[]>("pms_invites", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify({ email, first_name: firstName, token_hash: hash, expires_at: expiresAt, sent_by: sentBy, user_id: account.userId }),
    });

    try {
      const resendId = await sendInviteMail(email, buildInviteMail({ firstName, link: inviteLink(token), expiresAt }));
      if (resendId) await rest(`pms_invites?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ resend_id: resendId }) });
    } catch (e) {
      console.error("[invites] sending failed:", e);
      await rest(`pms_invites?id=eq.${row.id}`, { method: "DELETE" });
      return NextResponse.json({ error: "Die E-Mail konnte nicht gesendet werden." }, { status: 502 });
    }
    return NextResponse.json({ status: "invited", expires_at: expiresAt });
  } catch (e) {
    console.error("[invites] failed:", e);
    return NextResponse.json({ error: "Die Einladung ist noch nicht eingerichtet." }, { status: 503 });
  }
}

export async function GET(req: NextRequest) {
  if (!inviteSecretOk(req.headers.get("authorization"))) return unauthorized();
  const raw = req.nextUrl.searchParams.get("email");
  if (!isValidEmail(raw)) return NextResponse.json({ error: "Die E-Mail-Adresse ist ungültig." }, { status: 400 });
  const email = raw.trim().toLowerCase();
  try {
    const [account, invite] = await Promise.all([accountStatus(email), latestInvite(email)]);
    if (account.hasKeys && invite && !invite.accepted_at) {
      invite.accepted_at = new Date().toISOString();
      await rest(`pms_invites?id=eq.${invite.id}`, { method: "PATCH", body: JSON.stringify({ accepted_at: invite.accepted_at, user_id: account.userId }) });
    }
    const status = account.hasKeys ? "active" : !invite ? "none" : inviteState(invite) === "ok" ? "invited" : "expired";
    return NextResponse.json({
      status,
      invite: invite
        ? { created_at: invite.created_at, expires_at: invite.expires_at, sent_by: invite.sent_by, clicked_at: invite.clicked_at, accepted_at: invite.accepted_at }
        : null,
    });
  } catch (e) {
    console.error("[invites] status failed:", e);
    return NextResponse.json({ error: "Die Einladung ist noch nicht eingerichtet." }, { status: 503 });
  }
}
