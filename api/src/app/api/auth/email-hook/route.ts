import { NextRequest, NextResponse } from "next/server";
import {
  hookUserFirstName,
  parseHookPayload,
  planAuthMails,
  verifyStandardWebhookSignature,
} from "@/lib/auth-hook";
import { buildAuthMail } from "@/lib/auth-emails";

// Supabase Auth "Send Email" hook.
//
// Once the hook is enabled in the Supabase project, Supabase Auth no longer
// sends any auth mail itself: every signup confirmation, password reset,
// magic link, invite, email change and reauthentication code is POSTed
// here and we send the EPHIA mail via Resend. Setup: README.md.
//
// Contract (Supabase docs, "Send Email Hook"):
//   - request signed per Standard Webhooks with the secret the dashboard
//     generated (`v1,whsec_…`), stored here as AUTH_EMAIL_HOOK_SECRET;
//   - 200 with an empty JSON object means "sent";
//   - any other status surfaces as an error to the signup / reset call in
//     the app, so a failed Resend send returns 500 instead of a silent 200.
//     Supabase retries on timeouts, so a slow Resend may produce a second
//     mail; harmless for these one-time links.
//
// This route needs no Supabase client: it only trusts the signed payload.

export const runtime = "nodejs";

const DEFAULT_FROM = "EPHIA <noreply@ephia.de>";

function hookError(status: number, message: string) {
  // Error shape Supabase shows to the caller of the auth endpoint.
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

export async function POST(req: NextRequest) {
  const hookSecret = process.env.AUTH_EMAIL_HOOK_SECRET;
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  if (!hookSecret || !resendApiKey || !process.env.SUPABASE_URL) {
    console.error("[email-hook] AUTH_EMAIL_HOOK_SECRET, RESEND_API_KEY or SUPABASE_URL not set");
    return hookError(500, "E-Mail-Versand ist nicht konfiguriert.");
  }

  const rawBody = await req.text();
  if (!verifyStandardWebhookSignature(rawBody, req.headers, hookSecret)) {
    return hookError(401, "Ungültige Signatur.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return hookError(400, "Ungültiger Payload.");
  }
  const payload = parseHookPayload(parsed);
  if (!payload) return hookError(400, "Ungültiger Payload.");

  const plan = planAuthMails(payload);
  if (plan.length === 0) {
    // Notification types carry no token and none are enabled; an unknown
    // action type would mean a new GoTrue release. Log so it is visible,
    // acknowledge so the auth call itself succeeds.
    console.warn(`[email-hook] nothing to send for action type "${payload.email_data.email_action_type}"`);
    return NextResponse.json({});
  }

  const firstName = hookUserFirstName(payload.user);

  for (const mail of plan) {
    const { subject, html } = buildAuthMail(mail, firstName);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject,
        html,
        tags: [{ name: "ephia-purpose", value: `pms-auth-${mail.kind.replace(/_/g, "-")}` }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email-hook] Resend failed (${res.status}) for ${mail.kind}: ${detail}`);
      return hookError(500, "Die E-Mail konnte nicht gesendet werden. Bitte versuche es später noch einmal.");
    }
  }

  return NextResponse.json({});
}
