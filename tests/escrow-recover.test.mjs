import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { wrapMEKForEscrow, makeMekCheck, importEscrowPublicKey, exportMEKRawBase64 } from "../src/lib/escrow.js";
import { generateMEK, bufToBase64, derivePDK, unwrapMEK } from "../src/lib/crypto.js";

const USER = "11111111-2222-3333-4444-555555555555";

async function setup() {
  const kp = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["encrypt", "decrypt"],
  );
  const spki = bufToBase64(await crypto.subtle.exportKey("spki", kp.publicKey));
  const pkcs8 = bufToBase64(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const mek = await generateMEK();
  const blob = await wrapMEKForEscrow(mek, USER, await importEscrowPublicKey(spki));
  const check = await makeMekCheck(mek);
  return { pkcs8, mek, blob, check };
}

function run(args, stdin) {
  return spawnSync("node", ["scripts/escrow-recover.mjs", ...args], { input: stdin, encoding: "utf8" });
}

test("verify mode reports OK for a matching blob and FAIL for a wrong user", async () => {
  const { pkcs8, blob, check } = await setup();
  const ok = run(["verify", USER, blob, check.mek_check, check.mek_check_iv], pkcs8);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^OK:/);
  const bad = run(["verify", "99999999-0000-0000-0000-000000000000", blob, check.mek_check, check.mek_check_iv], pkcs8);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /FAIL/);
});

test("release mode output unwraps to the same MEK with the printed code", async () => {
  const { pkcs8, mek, blob, check } = await setup();
  const r = run(["release", USER, blob, check.mek_check, check.mek_check_iv], pkcs8);
  assert.equal(r.status, 0, r.stderr);
  const json = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"), r.stdout.indexOf("}") + 1));
  const code = r.stdout.match(/\n  ([a-z]+(?:-[a-z]+){7})\n/)[1];
  assert.equal(code.split("-").length, 8);
  const key = await derivePDK(code, json.escrow_release_salt, 300000);
  const back = await unwrapMEK(json.escrow_release, json.escrow_release_iv, key);
  assert.equal(await exportMEKRawBase64(back), await exportMEKRawBase64(mek));
  assert.ok(new Date(json.escrow_release_expires_at) > new Date());
  assert.ok(!r.stdout.includes(await exportMEKRawBase64(mek)), "MEK must not be printed");
});
