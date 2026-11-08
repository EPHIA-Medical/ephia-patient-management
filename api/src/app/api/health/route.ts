import { NextResponse } from "next/server";
import { resolveSender } from "@/lib/auth-hook";

// Railway health check (railway.json) and a quick "is it up" for humans.
// Reports which variables are present, never their values.
export function GET() {
  return NextResponse.json({
    ok: true,
    service: "ephia-patient-management-api",
    configured: {
      supabaseUrl: Boolean(process.env.SUPABASE_URL),
      authEmailHookSecret: Boolean(process.env.AUTH_EMAIL_HOOK_SECRET),
      resendApiKey: Boolean(process.env.RESEND_API_KEY),
      // false = EMAIL_FROM is set but malformed; mails go out from the default sender.
      emailFromValid: resolveSender(process.env.EMAIL_FROM).valid,
    },
  });
}
