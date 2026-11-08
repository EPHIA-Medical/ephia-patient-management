import { describe, expect, it } from "vitest";

process.env.SUPABASE_URL = "https://grfngjgjiipbgntsduom.supabase.co";
process.env.APP_URL = "https://invoicing.ephia.de/";

import {
  buildVerifyLink,
  hookUserFirstName,
  hookSecretBytes,
  parseHookPayload,
  planAuthMails,
  safeRedirectTo,
  signStandardWebhook,
  verifyStandardWebhookSignature,
} from "./auth-hook";

// 32 random bytes, base64, the way the Supabase dashboard generates it.
const RAW_SECRET = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const DASHBOARD_SECRET = `v1,whsec_${RAW_SECRET}`;

function headersFor(body: string, secret: string, ts = Math.floor(Date.now() / 1000)) {
  const id = "msg_test";
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(ts),
    "webhook-signature": signStandardWebhook(body, id, ts, secret),
  });
}

function payload(overrides: Partial<Record<string, unknown>> = {}, user: Record<string, unknown> = {}) {
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "aerztin@example.com",
      user_metadata: {},
      ...user,
    },
    email_data: {
      token: "123456",
      token_hash: "hash-current",
      redirect_to: "https://invoicing.ephia.de/",
      email_action_type: "signup",
      site_url: "https://invoicing.ephia.de",
      token_new: "",
      token_hash_new: "",
      ...overrides,
    },
  };
}

describe("hookSecretBytes", () => {
  it("accepts the dashboard format, the whsec_ form and bare base64", () => {
    const expected = Buffer.from(RAW_SECRET, "base64");
    expect(hookSecretBytes(DASHBOARD_SECRET)).toEqual(expected);
    expect(hookSecretBytes(`whsec_${RAW_SECRET}`)).toEqual(expected);
    expect(hookSecretBytes(RAW_SECRET)).toEqual(expected);
  });
  it("rejects empty secrets", () => {
    expect(hookSecretBytes("v1,whsec_")).toBeNull();
    expect(hookSecretBytes("")).toBeNull();
  });
});

describe("verifyStandardWebhookSignature", () => {
  const body = JSON.stringify(payload());

  it("accepts a request signed with the dashboard secret", () => {
    expect(verifyStandardWebhookSignature(body, headersFor(body, DASHBOARD_SECRET), DASHBOARD_SECRET)).toBe(true);
  });

  it("accepts a rotated header with several signatures", () => {
    const h = headersFor(body, DASHBOARD_SECRET);
    h.set("webhook-signature", `v1,bogus ${h.get("webhook-signature")}`);
    expect(verifyStandardWebhookSignature(body, h, DASHBOARD_SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const h = headersFor(body, DASHBOARD_SECRET);
    expect(verifyStandardWebhookSignature(body + " ", h, DASHBOARD_SECRET)).toBe(false);
  });

  it("rejects a different secret", () => {
    const other = `v1,whsec_${Buffer.from("fedcba9876543210fedcba9876543210").toString("base64")}`;
    expect(verifyStandardWebhookSignature(body, headersFor(body, other), DASHBOARD_SECRET)).toBe(false);
  });

  it("rejects stale timestamps and missing headers", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(verifyStandardWebhookSignature(body, headersFor(body, DASHBOARD_SECRET, old), DASHBOARD_SECRET)).toBe(false);
    expect(verifyStandardWebhookSignature(body, new Headers(), DASHBOARD_SECRET)).toBe(false);
  });
});

describe("parseHookPayload", () => {
  it("normalises a valid payload", () => {
    const p = parseHookPayload(payload({}, { new_email: "neu@example.com" }));
    expect(p?.user.email).toBe("aerztin@example.com");
    expect(p?.user.new_email).toBe("neu@example.com");
    expect(p?.email_data.email_action_type).toBe("signup");
  });
  it("returns null for garbage", () => {
    expect(parseHookPayload(null)).toBeNull();
    expect(parseHookPayload({ user: {} })).toBeNull();
    expect(parseHookPayload({ user: { id: "x" }, email_data: {} })).toBeNull();
  });
});

describe("links", () => {
  it("builds the GoTrue verify URL with the token hash", () => {
    const link = new URL(buildVerifyLink("abc", "recovery", "https://invoicing.ephia.de/"));
    expect(link.origin).toBe("https://grfngjgjiipbgntsduom.supabase.co");
    expect(link.pathname).toBe("/auth/v1/verify");
    expect(link.searchParams.get("token")).toBe("abc");
    expect(link.searchParams.get("type")).toBe("recovery");
    expect(link.searchParams.get("redirect_to")).toBe("https://invoicing.ephia.de/");
  });
  it("falls back to the app root for unusable redirects", () => {
    expect(safeRedirectTo("")).toBe("https://invoicing.ephia.de/");
    expect(safeRedirectTo("javascript:alert(1)")).toBe("https://invoicing.ephia.de/");
    expect(safeRedirectTo("https://invoicing.ephia.de/abc")).toBe("https://invoicing.ephia.de/abc");
  });
});

describe("planAuthMails", () => {
  it("plans one link mail for signup, recovery, magiclink and invite", () => {
    for (const type of ["signup", "recovery", "magiclink", "invite"] as const) {
      const p = parseHookPayload(payload({ email_action_type: type }))!;
      const plan = planAuthMails(p);
      expect(plan).toHaveLength(1);
      expect(plan[0].kind).toBe(type);
      expect(plan[0].to).toBe("aerztin@example.com");
      expect(plan[0].link).toContain(`type=${type}`);
      expect(plan[0].link).toContain("token=hash-current");
      expect(plan[0].code).toBeNull();
    }
  });

  it("sends a code, not a link, for reauthentication", () => {
    const plan = planAuthMails(parseHookPayload(payload({ email_action_type: "reauthentication" }))!);
    expect(plan).toEqual([
      { kind: "reauthentication", to: "aerztin@example.com", link: null, code: "123456", newEmail: null },
    ]);
  });

  it("pairs the email-change token hashes the way GoTrue does (secure change)", () => {
    const p = parseHookPayload(
      payload(
        { email_action_type: "email_change", token_hash: "hash-for-new", token_hash_new: "hash-for-current", token_new: "654321" },
        { new_email: "neu@example.com" },
      ),
    )!;
    const plan = planAuthMails(p);
    expect(plan.map((m) => m.kind)).toEqual(["email_change_current", "email_change_new"]);
    expect(plan[0].to).toBe("aerztin@example.com");
    expect(plan[0].link).toContain("token=hash-for-current");
    expect(plan[1].to).toBe("neu@example.com");
    expect(plan[1].link).toContain("token=hash-for-new");
    expect(plan[1].newEmail).toBe("neu@example.com");
  });

  it("mails only the new address when secure email change is off", () => {
    const p = parseHookPayload(
      payload({ email_action_type: "email_change", token_hash: "hash-for-new" }, { new_email: "neu@example.com" }),
    )!;
    const plan = planAuthMails(p);
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe("email_change_new");
    expect(plan[0].to).toBe("neu@example.com");
  });

  it("acknowledges notifications and unknown types without a mail", () => {
    expect(planAuthMails(parseHookPayload(payload({ email_action_type: "password_changed_notification" }))!)).toEqual([]);
    expect(planAuthMails(parseHookPayload(payload({ email_action_type: "something_else" }))!)).toEqual([]);
  });

  it("plans nothing without a recipient or token hash", () => {
    expect(planAuthMails(parseHookPayload(payload({ token_hash: "" }))!)).toEqual([]);
    expect(planAuthMails(parseHookPayload(payload({}, { email: null }))!)).toEqual([]);
  });
});

describe("hookUserFirstName", () => {
  const user = (first_name: unknown) => ({ id: "u", email: "a@example.com", user_metadata: { first_name } });
  it("keeps plausible names", () => {
    expect(hookUserFirstName(user("Anna"))).toBe("Anna");
    expect(hookUserFirstName(user(" Marie-Luise "))).toBe("Marie-Luise");
    expect(hookUserFirstName(user("Zoë O'Neil"))).toBe("Zoë O'Neil");
  });
  it("drops anything that could carry a message", () => {
    expect(hookUserFirstName(user("Bitte hier klicken: https://evil.example"))).toBe("");
    expect(hookUserFirstName(user("Anna, Dein Konto wurde gesperrt. Ruf 0800 an"))).toBe("");
    expect(hookUserFirstName(user("A".repeat(41)))).toBe("");
    expect(hookUserFirstName(user(42))).toBe("");
    expect(hookUserFirstName({ id: "u", email: "a@example.com" })).toBe("");
  });
});
