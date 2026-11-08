import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../src/lib/shareCrypto.js";

test("normalizes dates of birth", () => {
  assert.equal(S.normalizeDob("07.03.1988"), "1988-03-07");
  assert.equal(S.normalizeDob("7.3.1988"), "1988-03-07");
  assert.equal(S.normalizeDob("07031988"), "1988-03-07");
  assert.equal(S.normalizeDob("1988-03-07"), "1988-03-07");
  assert.equal(S.normalizeDob("31.02.1990"), "");
  assert.equal(S.normalizeDob("01.01.2999"), "");
});

test("codes are six digits", () => {
  for (let i = 0; i < 50; i++) assert.match(S.generateCode(), /^\d{6}$/);
  assert.equal(S.normalizeAnswer("code", "123 456"), "123456");
  assert.equal(S.normalizeAnswer("code", "12345"), "");
});

test("the key needs all three parts", async () => {
  const a = S.randomBytes(32), b = S.randomBytes(32), salt = S.randomBytes(16);
  const k = await S.deriveShareKey(a, b, "1988-03-07", salt);
  const enc = await S.encryptBytes(k, new TextEncoder().encode("pdf"));
  const same = await S.deriveShareKey(a, b, "1988-03-07", salt);
  assert.equal(new TextDecoder().decode(await S.decryptBytes(same, enc.iv, enc.data)), "pdf");
  for (const other of [
    await S.deriveShareKey(S.randomBytes(32), b, "1988-03-07", salt),
    await S.deriveShareKey(a, S.randomBytes(32), "1988-03-07", salt),
    await S.deriveShareKey(a, b, "1988-03-08", salt),
  ]) await assert.rejects(S.decryptBytes(other, enc.iv, enc.data));
});

test("the verifier differs from the key material and is stable", async () => {
  const salt = S.randomBytes(16);
  const v1 = await S.deriveVerifier("1988-03-07", salt);
  assert.equal(v1, await S.deriveVerifier("1988-03-07", salt));
  assert.notEqual(v1, await S.deriveVerifier("1988-03-08", salt));
  assert.match(v1, /^[A-Za-z0-9_-]{43}$/);
});
