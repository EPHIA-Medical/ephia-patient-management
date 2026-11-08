import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wrapMEKForEscrow, unwrapMEKFromEscrow, makeMekCheck, verifyMekCheck,
  importEscrowPublicKey, importEscrowPrivateKey, exportMEKRawBase64,
} from "../src/lib/escrow.js";
import { generateMEK, bufToBase64 } from "../src/lib/crypto.js";

async function throwawayKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const spki = bufToBase64(await crypto.subtle.exportKey("spki", kp.publicKey));
  const pkcs8 = bufToBase64(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  return { pub: await importEscrowPublicKey(spki), priv: await importEscrowPrivateKey(pkcs8) };
}

const USER = "11111111-2222-3333-4444-555555555555";

test("escrow blob round-trips to the same MEK", async () => {
  const { pub, priv } = await throwawayKeyPair();
  const mek = await generateMEK();
  const blob = await wrapMEKForEscrow(mek, USER, pub);
  const back = await unwrapMEKFromEscrow(blob, USER, priv);
  assert.equal(await exportMEKRawBase64(back), await exportMEKRawBase64(mek));
});

test("a blob does not unwrap under another user id", async () => {
  const { pub, priv } = await throwawayKeyPair();
  const mek = await generateMEK();
  const blob = await wrapMEKForEscrow(mek, USER, pub);
  await assert.rejects(unwrapMEKFromEscrow(blob, "99999999-0000-0000-0000-000000000000", priv));
});

test("a blob does not unwrap with another private key", async () => {
  const { pub } = await throwawayKeyPair();
  const { priv: other } = await throwawayKeyPair();
  const mek = await generateMEK();
  const blob = await wrapMEKForEscrow(mek, USER, pub);
  await assert.rejects(unwrapMEKFromEscrow(blob, USER, other));
});

test("mek_check verifies the right key and rejects a wrong one", async () => {
  const mek = await generateMEK();
  const other = await generateMEK();
  const profile = await makeMekCheck(mek);
  assert.equal(await verifyMekCheck(mek, profile), true);
  assert.equal(await verifyMekCheck(other, profile), false);
  assert.equal(await verifyMekCheck(mek, {}), false);
});
