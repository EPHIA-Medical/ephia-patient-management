import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signStandardWebhook } from "@/lib/auth-hook";

// End-to-end check of the hook route with a signed request and a mocked
// Resend.

const SECRET = `v1,whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;

function signedRequest(body: string, secret = SECRET): NextRequest {
  const id = "msg_route_test";
  const ts = Math.floor(Date.now() / 1000);
  return new NextRequest("https://api.example.test/api/auth/email-hook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(ts),
      "webhook-signature": signStandardWebhook(body, id, ts, secret),
    },
    body,
  });
}

const recoveryPayload = JSON.stringify({
  user: { id: "u1", email: "aerztin@example.com", user_metadata: { first_name: "Anna" } },
  email_data: {
    token: "123456",
    token_hash: "hash-1",
    redirect_to: "https://invoicing.ephia.de/",
    email_action_type: "recovery",
    site_url: "https://invoicing.ephia.de",
    token_new: "",
    token_hash_new: "",
  },
});

describe("POST /api/auth/email-hook", () => {
  const sent: Array<Record<string, unknown>> = [];
  let resendStatus = 200;

  beforeEach(() => {
    sent.length = 0;
    resendStatus = 200;
    vi.resetModules();
    process.env.SUPABASE_URL = "https://grfngjgjiipbgntsduom.supabase.co";
    process.env.AUTH_EMAIL_HOOK_SECRET = SECRET;
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.EMAIL_FROM;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://api.resend.com/emails") {
        sent.push(JSON.parse(String(init?.body)));
        return new Response(resendStatus === 200 ? '{"id":"email_1"}' : "boom", { status: resendStatus });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function post(req: NextRequest) {
    const { POST } = await import("./route");
    return POST(req);
  }

  it("sends the branded recovery mail for a signed request", async () => {
    const res = await post(signedRequest(recoveryPayload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(sent).toHaveLength(1);
    const mail = sent[0] as { to: string[]; subject: string; html: string; from: string; tags: unknown };
    expect(mail.to).toEqual(["aerztin@example.com"]);
    expect(mail.from).toBe("EPHIA <noreply@ephia.de>");
    expect(mail.subject).toBe("Passwort zurücksetzen");
    expect(mail.html).toContain("Hallo Anna,");
    expect(mail.html).toContain(
      "https://grfngjgjiipbgntsduom.supabase.co/auth/v1/verify?token=hash-1&amp;type=recovery&amp;redirect_to=https%3A%2F%2Finvoicing.ephia.de%2F",
    );
    expect(mail.html).toContain("Impressum");
    expect(mail.tags).toEqual([{ name: "ephia-purpose", value: "pms-auth-recovery" }]);
  });

  it("marks the new address in email-change mails", async () => {
    const body = JSON.stringify({
      user: { id: "u1", email: "aerztin@example.com", new_email: "neu@example.com" },
      email_data: {
        token: "1",
        token_hash: "hash-new",
        token_new: "2",
        token_hash_new: "hash-current",
        redirect_to: "https://invoicing.ephia.de/",
        email_action_type: "email_change",
        site_url: "https://invoicing.ephia.de",
      },
    });
    const res = await post(signedRequest(body));
    expect(res.status).toBe(200);
    expect(sent.map((m) => (m.to as string[])[0])).toEqual(["aerztin@example.com", "neu@example.com"]);
    expect(String(sent[0].html)).toContain("<strong>neu@example.com</strong>");
    expect(String(sent[0].html)).toContain("token=hash-current");
    expect(String(sent[1].html)).toContain("token=hash-new");
  });

  it("rejects a bad signature without sending", async () => {
    const other = `v1,whsec_${Buffer.from("fedcba9876543210fedcba9876543210").toString("base64")}`;
    const res = await post(signedRequest(recoveryPayload, other));
    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("acknowledges notification types without a mail", async () => {
    const body = recoveryPayload.replace('"recovery"', '"password_changed_notification"');
    const res = await post(signedRequest(body));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it("surfaces a Resend failure to Supabase as 500", async () => {
    resendStatus = 500;
    const res = await post(signedRequest(recoveryPayload));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { http_code: number } };
    expect(json.error.http_code).toBe(500);
  });

  it("refuses to run without the hook secret", async () => {
    delete process.env.AUTH_EMAIL_HOOK_SECRET;
    const res = await post(signedRequest(recoveryPayload));
    expect(res.status).toBe(500);
    expect(sent).toHaveLength(0);
  });
});

describe("EMAIL_FROM handling", () => {
  it("sends from the unquoted sender when the variable carries quotes", async () => {
    vi.resetModules();
    process.env.SUPABASE_URL = "https://grfngjgjiipbgntsduom.supabase.co";
    process.env.AUTH_EMAIL_HOOK_SECRET = SECRET;
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = '"EPHIA <noreply@ephia.de>"';
    const bodies: Array<{ from: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response('{"id":"email_1"}', { status: 200 });
    });
    const { POST } = await import("./route");
    const res = await POST(signedRequest(recoveryPayload));
    expect(res.status).toBe(200);
    expect(bodies[0].from).toBe("EPHIA <noreply@ephia.de>");
    delete process.env.EMAIL_FROM;
    vi.restoreAllMocks();
  });
});
