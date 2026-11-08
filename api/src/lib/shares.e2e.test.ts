/**
 * End-to-end test of secure document sending in one process:
 * the app's sending code (src/lib/shareApi.js, real WebCrypto) → the real route
 * handlers of this service → the patient's decrypting code, with Supabase
 * (PostgREST + Storage + Auth) and Resend replaced by an in-memory fake.
 */
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const SUPA = "https://supa.test";
const API = "https://api.pms.ephia.de";
type Row = Record<string, unknown>;

const db: Record<string, Row[]> = {};
const storage = new Map<string, Buffer>();
const mails: { to: string[]; from: string; reply_to?: string; subject: string; html: string; text: string }[] = [];
const realFetch = globalThis.fetch;

// ── tiny PostgREST filter support: eq, lt, gt, ov, not.is.null ──
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, raw] of params) {
    if (["select", "order", "limit"].includes(k)) continue;
    const v = row[k];
    if (raw.startsWith("eq.")) { if (String(v) !== raw.slice(3)) return false; }
    else if (raw.startsWith("lt.")) { if (!(String(v) < raw.slice(3))) return false; }
    else if (raw.startsWith("gt.")) { if (!(String(v) > raw.slice(3))) return false; }
    else if (raw === "not.is.null") { if (v == null) return false; }
    else if (raw === "is.null") { if (v != null) return false; }
    else if (raw.startsWith("ov.")) {
      const want = raw.slice(3).replace(/^\{|\}$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
      if (!Array.isArray(v) || !v.some((x) => want.includes(String(x)))) return false;
    }
  }
  return true;
}

async function fakeSupabase(url: URL, init: RequestInit): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (url.pathname === "/auth/v1/user") {
    const auth = headers.get("authorization");
    if (auth === "Bearer practice-token") return Response.json({ id: "user-1", email_confirmed_at: "2026-01-01T00:00:00Z" });
    if (auth === "Bearer unconfirmed-token") return Response.json({ id: "user-2", email_confirmed_at: null });
    if (auth === "Bearer no-avv-token") return Response.json({ id: "user-3", email_confirmed_at: "2026-01-01T00:00:00Z" });
    return new Response("{}", { status: 401 });
  }
  if (url.pathname === "/rest/v1/rpc/share_claim_attempt") {
    // Same semantics as the SQL function: atomic claim, null when locked or used up
    const { p_id } = JSON.parse(String(init.body));
    const row = (db.document_shares || []).find((r) => r.id === p_id && r.locked_at == null && r.revoked_at == null && (r.attempts as number) < 5);
    if (!row) return Response.json(null);
    row.attempts = (row.attempts as number) + 1;
    return Response.json(row.attempts);
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.slice("/rest/v1/".length);
    const rows = (db[table] ||= []);
    const hit = rows.filter((r) => matches(r, url.searchParams));
    if (method === "HEAD") return new Response(null, { headers: { "content-range": `0-0/${hit.length}` } });
    if (method === "GET") return Response.json(hit);
    if (method === "POST") {
      const body = JSON.parse(String(init.body));
      const row = { id: body.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), attempts: 0, open_count: 0, opened_at: null, revoked_at: null, locked_at: null, delivery_status: "sent", ...body };
      rows.push(row);
      return new Response(null, { status: 201 });
    }
    if (method === "PATCH") { const patch = JSON.parse(String(init.body)); hit.forEach((r) => Object.assign(r, patch)); return new Response(null, { status: 204 }); }
    if (method === "DELETE") { db[table] = rows.filter((r) => !hit.includes(r)); return new Response(null, { status: 204 }); }
  }
  if (url.pathname.startsWith("/storage/v1/object/sign/")) {
    const path = url.pathname.slice("/storage/v1/object/sign/document-shares/".length);
    if (method === "POST") return Response.json({ signedURL: `/object/sign/document-shares/${path}?token=t` });
    const bytes = storage.get(path);
    return bytes ? new Response(new Uint8Array(bytes)) : new Response("missing", { status: 404 });
  }
  if (url.pathname === "/storage/v1/object/document-shares" && method === "DELETE") {
    for (const p of JSON.parse(String(init.body)).prefixes) storage.delete(p);
    return Response.json([]);
  }
  if (url.pathname.startsWith("/storage/v1/object/document-shares/") && method === "POST") {
    storage.set(url.pathname.slice("/storage/v1/object/document-shares/".length), Buffer.from(init.body as Uint8Array));
    return Response.json({ Key: "ok" });
  }
  return new Response(`unhandled ${method} ${url}`, { status: 500 });
}

// The app and the patient page call API; route those calls into the real handlers
async function callRoute(url: URL, init: RequestInit): Promise<Response> {
  const req = new NextRequest(url, { method: init.method || "GET", headers: { origin: "https://invoicing.ephia.de", "x-forwarded-for": "203.0.113.7", ...(init.headers as Record<string, string>) }, body: init.body as string | undefined });
  const p = url.pathname;
  const id = p.split("/")[3];
  const ctx = { params: Promise.resolve({ id }) };
  if (p === "/api/shares") return (await import("@/app/api/shares/route"))[req.method as "POST" | "GET"](req);
  if (/^\/api\/shares\/[^/]+$/.test(p)) return (await import("@/app/api/shares/[id]/route")).GET(req, ctx);
  if (p.endsWith("/unlock")) return (await import("@/app/api/shares/[id]/unlock/route")).POST(req, ctx);
  if (p.endsWith("/revoke")) return (await import("@/app/api/shares/[id]/revoke/route")).POST(req, ctx);
  return new Response("no route", { status: 404 });
}

let app: {
  sendSecureShare: (a: unknown) => Promise<{ id: string; recipient_masked: string }>;
  fetchShareMeta: (id: string) => Promise<{ state: string; factor_type: string; key_salt: string; attempts_left: number }>;
  unlockShare: (a: unknown) => Promise<{ label: string; blob: Blob }[]>;
  listShares: (token: string, refs: string[]) => Promise<{ shares: Row[] }>;
  revokeShare: (token: string, id: string) => Promise<unknown>;
};

beforeAll(async () => {
  Object.assign(process.env, {
    SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: "eyJ.test", SHARE_KEY_SECRET: crypto.randomBytes(32).toString("base64"),
    RESEND_API_KEY: "re_test", APP_URL: "https://invoicing.ephia.de/",
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin === SUPA) return fakeSupabase(url, init);
    if (url.origin === API) return callRoute(url, init);
    if (url.href === "https://api.resend.com/emails") { mails.push(JSON.parse(String(init.body))); return Response.json({ id: `re_${mails.length}` }); }
    return realFetch(input, init);
  }) as typeof fetch;
  const path = new URL("../../../src/lib/shareApi.js", import.meta.url).href;
  app = await import(/* @vite-ignore */ path);
});

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  storage.clear(); mails.length = 0;
  db.profiles = [
    { id: "user-1", practice_data: { name: "Praxis Test", email: "praxis@example.de", phone: "030 123", iban: "not sent" } },
    { id: "user-3", practice_data: { name: "Praxis Drei" } },
  ];
  db.avv_acceptances = [{ user_id: "user-1", version: "1.0" }, { user_id: "user-2", version: "1.0" }];
});

const pdf = new TextEncoder().encode("%PDF-1.4 Rechnung RE-0004 Botulinum 20 SE");

async function send(type: "dob" | "code", value: string) {
  const res = await app.sendSecureShare({
    token: "practice-token",
    files: [{ kind: "rechnung", ref: "inv-1", label: "Rechnung RE-0004", file: new Blob([pdf]) }],
    factor: { type, value },
    recipient: { email: "anna.muster@example.de", first_name: "Anna" },
    // Ignored by the server: sender details come from the stored practice settings
    practice: { name: "Sparkasse Kundenservice", email: "phish@example.com" },
    message: "",
  });
  const link = mails.at(-1)!.text.match(/https:\/\/invoicing\.ephia\.de\/d\/\?s=([A-Za-z0-9_-]+)#([A-Za-z0-9_-]+)/)!;
  return { res, id: link[1], halfA: link[2] };
}

describe("secure document sending, end to end", () => {
  it("sends, stores nothing readable, and opens only with the right date of birth", async () => {
    const { res, id, halfA } = await send("dob", "07.03.1988");
    expect(res.recipient_masked).toBe("a•••@example.de");

    // The email: from the practice via EPHIA, reply to the practice, no health data
    const mail = mails[0];
    expect(mail.to).toEqual(["anna.muster@example.de"]);
    expect(mail.from).toBe('"Praxis Test über EPHIA" <noreply@ephia.de>');
    expect(mail.reply_to).toBe("praxis@example.de");
    expect(mail.subject).toBe("Deine Unterlagen von Praxis Test");
    expect(mail.text).not.toContain("RE-0004");
    expect(mail.text).not.toContain("1988");

    // Nothing stored contains halfA, the date of birth, the address or the plaintext
    const stored = JSON.stringify(db) + [...storage.values()].map((b) => b.toString("latin1")).join("");
    for (const secret of [halfA, "1988-03-07", "07.03.1988", "anna.muster", "Rechnung RE-0004", "Botulinum"]) expect(stored).not.toContain(secret);

    const meta = await app.fetchShareMeta(id);
    expect(meta.state).toBe("ok");
    expect(meta.factor_type).toBe("dob");

    // Wrong date: one attempt less
    await expect(app.unlockShare({ id, halfAB64: halfA, factorType: "dob", value: "08.03.1988", keySaltB64: meta.key_salt }))
      .rejects.toMatchObject({ status: 401, data: { attempts_left: 4 } });

    // Right date in another notation: decrypted locally, byte for byte
    const docs = await app.unlockShare({ id, halfAB64: halfA, factorType: "dob", value: "7.3.1988", keySaltB64: meta.key_salt });
    expect(docs).toHaveLength(1);
    expect(docs[0].label).toBe("Rechnung RE-0004");
    expect(new Uint8Array(await docs[0].blob.arrayBuffer())).toEqual(pdf);

    // The practice sees "opened"
    const list = await app.listShares("practice-token", ["inv-1"]);
    expect(list.shares[0].opened_at).toBeTruthy();
    expect(list.shares[0]).not.toHaveProperty("half_b_enc");
  });

  it("fails without halfA even with the right date of birth", async () => {
    const { id } = await send("dob", "07.03.1988");
    const meta = await app.fetchShareMeta(id);
    const wrongHalfA = crypto.randomBytes(32).toString("base64url");
    await expect(app.unlockShare({ id, halfAB64: wrongHalfA, factorType: "dob", value: "07.03.1988", keySaltB64: meta.key_salt })).rejects.toThrow();
  });

  it("locks the link after five wrong codes", async () => {
    const { id, halfA } = await send("code", "123456");
    const meta = await app.fetchShareMeta(id);
    for (let i = 0; i < 5; i++) {
      await expect(app.unlockShare({ id, halfAB64: halfA, factorType: "code", value: "654321", keySaltB64: meta.key_salt })).rejects.toMatchObject({ status: 401 });
    }
    expect((await app.fetchShareMeta(id)).state).toBe("locked");
    await expect(app.unlockShare({ id, halfAB64: halfA, factorType: "code", value: "123456", keySaltB64: meta.key_salt })).rejects.toMatchObject({ status: 410 });
  });

  it("revoking deletes files and secrets", async () => {
    const { id, halfA } = await send("dob", "01.01.1990");
    const meta = await app.fetchShareMeta(id);
    expect(storage.size).toBe(1);
    await app.revokeShare("practice-token", id);
    expect(storage.size).toBe(0);
    expect((await app.fetchShareMeta(id)).state).toBe("revoked");
    await expect(app.unlockShare({ id, halfAB64: halfA, factorType: "dob", value: "01.01.1990", keySaltB64: meta.key_salt })).rejects.toMatchObject({ status: 410 });
    await expect(app.revokeShare("someone-else", id)).rejects.toMatchObject({ status: 401 });
  });

  it("never lets the request choose the sender name", async () => {
    await send("dob", "07.03.1988");
    expect(mails[0].from).toBe('"Praxis Test über EPHIA" <noreply@ephia.de>');
    expect(mails[0].html).not.toContain("Sparkasse");
    expect(mails[0].reply_to).toBe("praxis@example.de");
  });

  it("refuses accounts without a confirmed email or without the AVV", async () => {
    const file = [{ kind: "rechnung", ref: "x", label: "R", file: new Blob([pdf]) }];
    const args = { files: file, factor: { type: "dob", value: "07.03.1988" }, recipient: { email: "a@example.de" } };
    await expect(app.sendSecureShare({ ...args, token: "unconfirmed-token" })).rejects.toMatchObject({ status: 403 });
    await expect(app.sendSecureShare({ ...args, token: "no-avv-token" })).rejects.toMatchObject({ status: 403 });
    expect(mails).toHaveLength(0);
  });

  it("gives at most five guesses even when they arrive in parallel", async () => {
    const { id, halfA } = await send("code", "123456");
    const meta = await app.fetchShareMeta(id);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () =>
      app.unlockShare({ id, halfAB64: halfA, factorType: "code", value: "000000", keySaltB64: meta.key_salt })));
    const counted = results.filter((r) => r.status === "rejected" && (r.reason as { status: number }).status === 401).length;
    expect(counted).toBe(5);
    expect(db.document_share_attempts.length).toBe(5);
    expect((await app.fetchShareMeta(id)).state).toBe("locked");
  });

  it("rejects sending without a valid practice login", async () => {
    await expect(app.sendSecureShare({
      token: "stolen", files: [{ kind: "rechnung", ref: "x", label: "R", file: new Blob([pdf]) }],
      factor: { type: "dob", value: "07.03.1988" }, recipient: { email: "a@example.de" }, practice: { name: "P" },
    })).rejects.toMatchObject({ status: 401 });
    expect(mails).toHaveLength(0);
  });
});
