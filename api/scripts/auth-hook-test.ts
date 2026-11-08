/**
 * Fire a signed Supabase "Send Email" hook request at the auth mail route,
 * the way Supabase Auth would, and send a real mail.
 *
 *   AUTH_EMAIL_HOOK_SECRET=v1,whsec_... \
 *     npx tsx scripts/auth-hook-test.ts http://localhost:3010/api/auth/email-hook you@ephia.de [action]
 *
 * `action` defaults to recovery; signup, magiclink, invite, email_change and
 * reauthentication work too. The link carries a dummy token hash, so
 * clicking it fails at Supabase; this tests delivery and rendering only.
 */
import { signStandardWebhook } from "../src/lib/auth-hook";

const [url, to, action = "recovery"] = process.argv.slice(2);
const secret = process.env.AUTH_EMAIL_HOOK_SECRET ?? "";
if (!url || !to || !secret) {
  console.error("usage: AUTH_EMAIL_HOOK_SECRET=... npx tsx scripts/auth-hook-test.ts <url> <to> [action]");
  process.exit(1);
}

const body = JSON.stringify({
  user: {
    id: "00000000-0000-0000-0000-000000000000",
    aud: "authenticated",
    role: "authenticated",
    email: to,
    new_email: action === "email_change" ? to : undefined,
    user_metadata: {},
    app_metadata: { provider: "email", providers: ["email"] },
  },
  email_data: {
    token: "482913",
    token_hash: "test-token-hash",
    token_new: "",
    token_hash_new: "",
    redirect_to: "https://invoicing.ephia.de/",
    email_action_type: action,
    site_url: "https://invoicing.ephia.de",
  },
});

async function main() {
  const id = `msg_test_${Date.now()}`;
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(ts),
      "webhook-signature": signStandardWebhook(body, id, ts, secret),
    },
    body,
  });
  console.log(res.status, await res.text());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
