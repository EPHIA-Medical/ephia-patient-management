import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { run } from "../scripts/escrow-migrate.mjs";
import { generateMEK, generateRecoveryKey, wrapMEK, bufToBase64 } from "../src/lib/crypto.js";
import { importEscrowPrivateKey, unwrapMEKFromEscrow, verifyMekCheck, exportMEKRawBase64 } from "../src/lib/escrow.js";

async function keyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["encrypt", "decrypt"],
  );
  return {
    spki: bufToBase64(await crypto.subtle.exportKey("spki", kp.publicKey)),
    pkcs8: bufToBase64(await crypto.subtle.exportKey("pkcs8", kp.privateKey)),
  };
}

// A profile row as it exists today: MEK wrapped under a plaintext recovery key.
async function legacyRow(id) {
  const mek = await generateMEK();
  const rk = await generateRecoveryKey();
  const { encrypted, iv } = await wrapMEK(mek, rk);
  return {
    row: { id, encrypted_mek: "x", recovery_wrapped_mek: encrypted, recovery_iv: iv, recovery_key: bufToBase64(await crypto.subtle.exportKey("raw", rk)), escrow_wrapped_mek: null },
    mek,
  };
}

// Minimal PostgREST stand-in: serves rows, records PATCHes, applies them.
function fakePostgrest(rows) {
  const patches = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(rows.filter((r) => r.encrypted_mek)));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const id = url.searchParams.get("id").replace("eq.", "");
      const fields = JSON.parse(body);
      const row = rows.find((r) => r.id === id && !r.escrow_wrapped_mek);
      patches.push({ id, fields });
      if (row) Object.assign(row, fields);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(row ? [row] : []));
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ baseUrl: `http://127.0.0.1:${server.address().port}`, patches, close: () => server.close() })));
}

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const quiet = () => {};

test("dry run touches nothing", async () => {
  const { spki, pkcs8 } = await keyPair();
  const a = await legacyRow(A);
  const srv = await fakePostgrest([a.row]);
  try {
    const s = await run({ mode: "dry", serviceKey: "k", pkcs8, spki, baseUrl: srv.baseUrl, log: quiet });
    assert.equal(s.migrated, 1);
    assert.equal(srv.patches.length, 0);
    assert.equal(a.row.escrow_wrapped_mek, null);
  } finally { srv.close(); }
});

test("write run migrates legacy rows with blobs that unwrap to the original MEK, then verify passes", async () => {
  const { spki, pkcs8 } = await keyPair();
  const a = await legacyRow(A);
  const b = await legacyRow(B);
  b.row.escrow_wrapped_mek = "already"; // must be left alone
  const srv = await fakePostgrest([a.row, b.row]);
  try {
    const s = await run({ mode: "write", serviceKey: "k", pkcs8, spki, baseUrl: srv.baseUrl, log: quiet });
    assert.deepEqual([s.migrated, s.already, s.skipped.length, s.failed.length], [1, 1, 0, 0]);
    assert.equal(srv.patches.length, 1);
    assert.deepEqual(Object.keys(srv.patches[0].fields).sort(), ["escrow_key_id", "escrow_wrapped_mek", "mek_check", "mek_check_iv"]);
    assert.equal(a.row.recovery_key.length > 0, true, "recovery columns untouched");
    const priv = await importEscrowPrivateKey(pkcs8);
    const back = await unwrapMEKFromEscrow(a.row.escrow_wrapped_mek, A, priv);
    assert.equal(await exportMEKRawBase64(back), await exportMEKRawBase64(a.mek));
    assert.equal(await verifyMekCheck(back, a.row), true);
  } finally { srv.close(); }
});

test("write run aborts before any PATCH when the private key does not match the public key", async () => {
  const { spki } = await keyPair();
  const { pkcs8: wrongPriv } = await keyPair();
  const a = await legacyRow(A);
  const srv = await fakePostgrest([a.row]);
  try {
    const s = await run({ mode: "write", serviceKey: "k", pkcs8: wrongPriv, spki, baseUrl: srv.baseUrl, log: quiet });
    assert.equal(s.failed.length, 1);
    assert.equal(srv.patches.length, 0);
    assert.equal(a.row.escrow_wrapped_mek, null);
  } finally { srv.close(); }
});

test("verify run reports rows whose escrow blob does not match", async () => {
  const { spki, pkcs8 } = await keyPair();
  const a = await legacyRow(A);
  const srv = await fakePostgrest([a.row]);
  try {
    await run({ mode: "write", serviceKey: "k", pkcs8, spki, baseUrl: srv.baseUrl, log: quiet });
    let s = await run({ mode: "verify", serviceKey: "k", pkcs8, spki, baseUrl: srv.baseUrl, log: quiet });
    assert.deepEqual([s.verified, s.failed.length], [1, 0]);
    a.row.mek_check_iv = a.row.mek_check_iv.slice(0, -2) + "AA"; // corrupt
    s = await run({ mode: "verify", serviceKey: "k", pkcs8, spki, baseUrl: srv.baseUrl, log: quiet });
    assert.deepEqual([s.verified, s.failed.length], [0, 1]);
  } finally { srv.close(); }
});
