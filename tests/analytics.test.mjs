import { register } from "node:module";
register("./_resolve-hooks.mjs", import.meta.url);
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const calls = [];
const store = new Map();
globalThis.fetch = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }); };
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const { trackEvent } = await import("../src/lib/analytics.js");

beforeEach(() => { calls.length = 0; store.clear(); });

test("sends name and metadata only, with the given token", () => {
  trackEvent("pdf_downloaded", { type: "rechnung" }, "explicit-token");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/analytics_events$/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer explicit-token");
  assert.deepEqual(JSON.parse(calls[0].init.body), { event_name: "pdf_downloaded", metadata: { type: "rechnung" } });
});

test("falls back to the stored session token", () => {
  store.set("ephia_session", JSON.stringify({ access_token: "stored-token" }));
  trackEvent("face_photo_uploaded");
  assert.equal(calls[0].init.headers.Authorization, "Bearer stored-token");
});

test("skips the event without any session", () => {
  trackEvent("account_created");
  store.set("ephia_session", "not json");
  trackEvent("account_created");
  assert.equal(calls.length, 0);
});
