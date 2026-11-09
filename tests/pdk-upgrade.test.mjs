import { test } from "node:test";
import assert from "node:assert/strict";
import {
  derivePDK, generateMEK, generateSalt, wrapMEK, unwrapMEK, exportMEKToBase64,
  wrapMEKWithPassword, needsPdkUpgrade, storedPdkIterations,
  PDK_ITERATIONS, LEGACY_PDK_ITERATIONS,
} from "../src/lib/crypto.js";

const PW = "placeholder-password";

// A profile as the app wrote it before 2026-11-09 (100k iterations).
async function legacyProfile(mek, { withParams = true } = {}) {
  const mek_salt = generateSalt();
  const pdk = await derivePDK(PW, mek_salt, LEGACY_PDK_ITERATIONS);
  const { encrypted, iv } = await wrapMEK(mek, pdk);
  const p = { encrypted_mek: encrypted, mek_iv: iv, mek_salt };
  if (withParams) p.mek_params = { iterations: 100000, hash: "SHA-256" };
  return p;
}

async function unlock(profile, password = PW) {
  const pdk = await derivePDK(password, profile.mek_salt, storedPdkIterations(profile));
  return unwrapMEK(profile.encrypted_mek, profile.mek_iv, pdk);
}

test("new wraps use 600k and round-trip", async () => {
  const mek = await generateMEK();
  const fields = await wrapMEKWithPassword(mek, PW);
  assert.deepEqual(fields.mek_params, { iterations: 600000, hash: "SHA-256" });
  assert.equal(PDK_ITERATIONS, 600000);
  assert.equal(await exportMEKToBase64(await unlock(fields)), await exportMEKToBase64(mek));
  assert.equal(needsPdkUpgrade(fields), false);
});

for (const withParams of [true, false]) {
  test(`legacy 100k profile (mek_params ${withParams ? "set" : "missing"}) unlocks, upgrades, unlocks again with the same MEK`, async () => {
    const mek = await generateMEK();
    const legacy = await legacyProfile(mek, { withParams });
    assert.equal(storedPdkIterations(legacy), 100000);
    assert.equal(needsPdkUpgrade(legacy), true);
    const unlocked = await unlock(legacy);
    const upgraded = { ...legacy, ...(await wrapMEKWithPassword(unlocked, PW)) };
    assert.equal(needsPdkUpgrade(upgraded), false);
    assert.notEqual(upgraded.mek_salt, legacy.mek_salt);
    assert.equal(await exportMEKToBase64(await unlock(upgraded)), await exportMEKToBase64(mek));
    await assert.rejects(unlock(upgraded, "wrong-password"));
  });
}

test("a 600k wrap does not unlock with the legacy count", async () => {
  const mek = await generateMEK();
  const fields = await wrapMEKWithPassword(mek, PW);
  const pdk = await derivePDK(PW, fields.mek_salt, LEGACY_PDK_ITERATIONS);
  await assert.rejects(unwrapMEK(fields.encrypted_mek, fields.mek_iv, pdk));
});

test("derivePDK refuses to run without an iteration count", async () => {
  await assert.rejects(derivePDK(PW, generateSalt()), /iterations required/);
});

test("profiles without a wrap never ask for an upgrade", () => {
  assert.equal(needsPdkUpgrade(null), false);
  assert.equal(needsPdkUpgrade({}), false);
});
