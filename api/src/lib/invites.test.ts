import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildInviteMail, cleanFirstName, hashToken, inviteRedirectTo, inviteSecretOk, inviteState, isInviteToken, landingPage,
  linkTypeFor, newInviteToken,
} from "@/lib/invites";

const SECRET = "s".repeat(40);
const SUPA = "https://supa.test";

beforeAll(() => {
  process.env.PMS_INVITE_SECRET = SECRET;
  process.env.SUPABASE_URL = SUPA;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  process.env.RESEND_API_KEY = "re_test";
  process.env.APP_URL = "https://invoicing.ephia.de/";
  process.env.API_URL = "https://api.pms.ephia.de";
});

describe("invite helpers", () => {
  it("makes 43-character tokens and stores only their hash", () => {
    const { token, hash } = newInviteToken();
    expect(isInviteToken(token)).toBe(true);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
    expect(isInviteToken("abc")).toBe(false);
  });

  it("checks the shared secret", () => {
    expect(inviteSecretOk(`Bearer ${SECRET}`)).toBe(true);
    expect(inviteSecretOk("Bearer nope")).toBe(false);
    expect(inviteSecretOk(null)).toBe(false);
    const old = process.env.PMS_INVITE_SECRET;
    process.env.PMS_INVITE_SECRET = "short";
    expect(inviteSecretOk("Bearer short")).toBe(false);
    process.env.PMS_INVITE_SECRET = old;
  });

  it("derives the invite state", () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    expect(inviteState({ expires_at: future, revoked_at: null, accepted_at: null })).toBe("ok");
    expect(inviteState({ expires_at: past, revoked_at: null, accepted_at: null })).toBe("expired");
    expect(inviteState({ expires_at: future, revoked_at: past, accepted_at: null })).toBe("revoked");
    expect(inviteState({ expires_at: past, revoked_at: past, accepted_at: past })).toBe("accepted");
  });

  it("picks invite, recovery or nothing", () => {
    expect(linkTypeFor({ userId: null, confirmed: false, hasKeys: false })).toBe("invite");
    expect(linkTypeFor({ userId: "u", confirmed: false, hasKeys: false })).toBe("invite");
    expect(linkTypeFor({ userId: "u", confirmed: true, hasKeys: false })).toBe("recovery");
    expect(linkTypeFor({ userId: "u", confirmed: true, hasKeys: true })).toBeNull();
  });

  it("cleans first names", () => {
    expect(cleanFirstName(" Anna ")).toBe("Anna");
    expect(cleanFirstName("<b>x</b>")).toBe("");
    expect(cleanFirstName(42)).toBe("");
  });

  it("builds the mail in Du form without exclamation marks", () => {
    const m = buildInviteMail({ firstName: "Anna", link: "https://api.pms.ephia.de/i/x", expiresAt: "2026-11-23T10:00:00Z" });
    expect(m.subject).toBe("Deine Einladung zum EPHIA Patient Management System");
    expect(m.html).toContain("Hallo Anna,");
    expect(m.html).toContain("https://api.pms.ephia.de/i/x");
    expect(m.html).toContain("23.11.2026");
    expect(m.text).toContain("Einladung annehmen: https://api.pms.ephia.de/i/x");
    expect(m.html).toContain("Alpha-Testphase.");
    expect(m.text).toContain("Datenverluste sind nicht ausgeschlossen");
    expect(m.html.indexOf("Alpha-Testphase")).toBeLessThan(m.html.indexOf("Einladung annehmen"));
    expect(m.text).not.toMatch(/!/);
    expect(m.text).not.toMatch(/\bSie\b/);
  });

  it("redirects into the app with the welcome flag", () => {
    expect(inviteRedirectTo()).toBe("https://invoicing.ephia.de/?einladung=1");
  });

  it("only offers the button for a valid token", () => {
    const { token } = newInviteToken();
    expect(landingPage("ok", token)).toContain(`action="/i/${token}"`);
    expect(landingPage("ok", "bad\"><script>")).not.toContain("<form");
    expect(landingPage("expired")).toContain("abgelaufen");
  });
});

// ── routes against an in-memory Supabase and Resend ──

type Row = Record<string, unknown>;
const invites: Row[] = [];
const users: { id: string; email: string; confirmed: boolean; hasKeys: boolean }[] = [];
const mails: Row[] = [];
const generated: Row[] = [];
const realFetch = globalThis.fetch;

function filterRows(rows: Row[], params: URLSearchParams): Row[] {
  return rows.filter((r) => {
    for (const [k, v] of params) {
      if (["select", "order", "limit"].includes(k)) continue;
      if (v.startsWith("eq.") && String(r[k]) !== v.slice(3)) return false;
      if (v === "is.null" && r[k] != null) return false;
    }
    return true;
  });
}

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (url.origin === "https://api.resend.com") { mails.push(body); return json({ id: `re_${mails.length}` }); }
    if (url.pathname === "/rest/v1/rpc/pms_account_status") {
      const u = users.find((x) => x.email === body.p_email);
      return json(u ? [{ user_id: u.id, confirmed: u.confirmed, has_keys: u.hasKeys }] : []);
    }
    if (url.pathname === "/auth/v1/admin/generate_link") {
      generated.push(body);
      let u = users.find((x) => x.email === body.email);
      if (body.type === "invite" && u?.confirmed) return json({ error_code: "email_exists", msg: "exists" }, 422);
      if (!u) { u = { id: `user-${users.length + 1}`, email: body.email, confirmed: false, hasKeys: false }; users.push(u); }
      return json({ id: u.id, hashed_token: `hash-${generated.length}` });
    }
    if (url.pathname === "/rest/v1/pms_invites") {
      const matched = filterRows(invites, url.searchParams);
      if (method === "GET") {
        const sorted = [...matched].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return json(url.searchParams.get("limit") ? sorted.slice(0, Number(url.searchParams.get("limit"))) : sorted);
      }
      if (method === "POST") {
        const row = { id: `inv-${invites.length + 1}`, created_at: new Date(Date.now() + invites.length).toISOString(), clicked_at: null, accepted_at: null, revoked_at: null, resend_id: null, ...body };
        invites.push(row);
        return json([row], 201);
      }
      if (method === "PATCH") { for (const r of matched) Object.assign(r, body); return new Response(null, { status: 204 }); }
      if (method === "DELETE") { for (const r of matched) invites.splice(invites.indexOf(r), 1); return new Response(null, { status: 204 }); }
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as typeof fetch;
});

afterAll(() => { globalThis.fetch = realFetch; });

beforeEach(() => { invites.length = 0; users.length = 0; mails.length = 0; generated.length = 0; });

const apiReq = (method: string, body?: unknown, query = "", auth = `Bearer ${SECRET}`) =>
  new NextRequest(`https://api.pms.ephia.de/api/invites${query}`, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe("invite routes", () => {
  it("sends an invite, then the click redirects to a fresh Supabase invite link", async () => {
    const { POST, GET } = await import("@/app/api/invites/route");
    const link = await import("@/app/i/[token]/route");

    expect((await POST(apiReq("POST", { email: "dr@example.de" }, "", "Bearer wrong"))).status).toBe(401);

    const res = await POST(apiReq("POST", { email: " Dr@Example.de ", first_name: "Anna", sent_by: "josy@ephia.de" }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("invited");
    expect(mails).toHaveLength(1);
    expect(generated).toHaveLength(0); // nothing from Supabase until the click
    expect(invites[0].email).toBe("dr@example.de");
    const token = String((mails[0].text as string).match(/\/i\/([A-Za-z0-9_-]{43})/)![1]);
    expect(invites[0].token_hash).toBe(hashToken(token));
    expect(JSON.stringify(invites[0])).not.toContain(token);

    const ctx = { params: Promise.resolve({ token }) };
    const page = await link.GET(new NextRequest(`https://api.pms.ephia.de/i/${token}`), ctx);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<form");
    expect(generated).toHaveLength(0); // a prefetch does not use anything up

    const click = await link.POST(new NextRequest(`https://api.pms.ephia.de/i/${token}`, { method: "POST" }), ctx);
    expect(click.status).toBe(303);
    const loc = new URL(click.headers.get("location")!);
    expect(loc.origin).toBe(SUPA);
    expect(loc.searchParams.get("type")).toBe("invite");
    expect(loc.searchParams.get("redirect_to")).toBe("https://invoicing.ephia.de/?einladung=1");
    expect(invites[0].clicked_at).toBeTruthy();

    const st = await GET(apiReq("GET", undefined, "?email=dr@example.de"));
    expect((await st.json()).status).toBe("invited");

    // First password login creates the keys: the invite counts as accepted
    users[0].confirmed = true;
    users[0].hasKeys = true;
    const st2 = await GET(apiReq("GET", undefined, "?email=dr@example.de"));
    expect((await st2.json()).status).toBe("active");
    expect(invites[0].accepted_at).toBeTruthy();
    const again = await link.POST(new NextRequest(`https://api.pms.ephia.de/i/${token}`, { method: "POST" }), ctx);
    expect(again.headers.get("location")).toBe("https://invoicing.ephia.de/");
  });

  it("uses recovery when the account was confirmed but never got a password login", async () => {
    const { POST } = await import("@/app/api/invites/route");
    const link = await import("@/app/i/[token]/route");
    users.push({ id: "u1", email: "dr@example.de", confirmed: true, hasKeys: false });
    await POST(apiReq("POST", { email: "dr@example.de" }));
    const token = String((mails[0].text as string).match(/\/i\/([A-Za-z0-9_-]{43})/)![1]);
    const click = await link.POST(new NextRequest(`https://api.pms.ephia.de/i/${token}`, { method: "POST" }), { params: Promise.resolve({ token }) });
    expect(new URL(click.headers.get("location")!).searchParams.get("type")).toBe("recovery");
  });

  it("sends nothing to an account already in use and revokes older invites", async () => {
    const { POST } = await import("@/app/api/invites/route");
    const link = await import("@/app/i/[token]/route");
    await POST(apiReq("POST", { email: "dr@example.de" }));
    const first = String((mails[0].text as string).match(/\/i\/([A-Za-z0-9_-]{43})/)![1]);
    await POST(apiReq("POST", { email: "dr@example.de" }));
    expect(mails).toHaveLength(2);
    const old = await link.GET(new NextRequest(`https://api.pms.ephia.de/i/${first}`), { params: Promise.resolve({ token: first }) });
    expect(old.status).toBe(410);
    expect(await old.text()).toContain("neuere Einladung");

    users.push({ id: "u2", email: "active@example.de", confirmed: true, hasKeys: true });
    const res = await POST(apiReq("POST", { email: "active@example.de" }));
    expect((await res.json()).status).toBe("active");
    expect(mails).toHaveLength(2);
  });
});
