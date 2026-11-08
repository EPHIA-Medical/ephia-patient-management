#!/usr/bin/env node
// One-off migration of existing accounts to key escrow
// (docs/escrow-recovery-plan.md, step 3). Runs once, on a laptop.
//
//   node scripts/escrow-migrate.mjs            dry run: reports what would change
//   node scripts/escrow-migrate.mjs --write    writes escrow fields
//   node scripts/escrow-migrate.mjs --verify   verifies every existing escrow blob
//
// Asks for the Supabase service role key and the escrow private key; both are
// pasted invisibly and kept in memory only. Piped use: SUPABASE_SERVICE_KEY and
// ESCROW_PRIVATE_KEY env vars.
//
// For every profile with encrypted_mek and no escrow_wrapped_mek:
//   1. unwrap recovery_wrapped_mek with recovery_key  -> MEK
//   2. wrap MEK for escrow (label = user id), build mek_check
//   3. unwrap the new blob with the private key and compare byte for byte,
//      verify mek_check                                -> abort the run on mismatch
//   4. PATCH escrow_wrapped_mek, escrow_key_id, mek_check, mek_check_iv
// No other column is touched. recovery_* stay as they are (step 5 nulls them).

import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import {
  ESCROW_KEY_ID, importEscrowPublicKey, importEscrowPrivateKey,
  wrapMEKForEscrow, unwrapMEKFromEscrow, makeMekCheck, verifyMekCheck, exportMEKRawBase64,
} from "../src/lib/escrow.js";
import { unwrapMEK } from "../src/lib/crypto.js";
import { SUPABASE_URL } from "../src/lib/supabase/client.js";

globalThis.crypto ??= webcrypto;

const KEY_COLUMNS = "id,encrypted_mek,recovery_wrapped_mek,recovery_iv,recovery_key,escrow_wrapped_mek,escrow_key_id,mek_check,mek_check_iv";

export function headers(serviceKey, extra = {}) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...extra };
}

export async function unwrapWithRecoveryKey(row) {
  const rk = await crypto.subtle.importKey("raw", Buffer.from(row.recovery_key, "base64"), { name: "AES-GCM", length: 256 }, false, ["unwrapKey"]);
  return unwrapMEK(row.recovery_wrapped_mek, row.recovery_iv, rk);
}

// Builds the escrow fields for one row and proves them against the private
// key before returning. Throws on any mismatch.
export async function buildVerifiedEscrow(row, pub, priv) {
  const mek = await unwrapWithRecoveryKey(row);
  const escrow_wrapped_mek = await wrapMEKForEscrow(mek, row.id, pub);
  const check = await makeMekCheck(mek);
  const back = await unwrapMEKFromEscrow(escrow_wrapped_mek, row.id, priv);
  if ((await exportMEKRawBase64(back)) !== (await exportMEKRawBase64(mek))) throw new Error("round-trip mismatch");
  if (!(await verifyMekCheck(back, check))) throw new Error("mek_check mismatch");
  return { escrow_wrapped_mek, escrow_key_id: ESCROW_KEY_ID, ...check };
}

export async function verifyExistingEscrow(row, priv) {
  const back = await unwrapMEKFromEscrow(row.escrow_wrapped_mek, row.id, priv);
  if (!(await verifyMekCheck(back, row))) throw new Error("mek_check mismatch");
  if (row.recovery_key && row.recovery_wrapped_mek && row.recovery_iv) {
    const viaRecovery = await unwrapWithRecoveryKey(row);
    if ((await exportMEKRawBase64(back)) !== (await exportMEKRawBase64(viaRecovery))) throw new Error("escrow MEK differs from recovery MEK");
  }
}

export async function run({ mode, serviceKey, pkcs8, spki, baseUrl = SUPABASE_URL, log = console.log }) {
  const priv = await importEscrowPrivateKey(pkcs8);
  const pub = await importEscrowPublicKey(spki); // spki only for tests; production uses the bundled key

  const res = await fetch(`${baseUrl}/rest/v1/profiles?select=${KEY_COLUMNS}&encrypted_mek=not.is.null&order=id`, { headers: headers(serviceKey) });
  if (!res.ok) throw new Error(`fetch profiles: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  log(`${rows.length} profiles with encrypted_mek`);

  const summary = { migrated: 0, verified: 0, already: 0, skipped: [], failed: [] };

  if (mode === "verify") {
    for (const row of rows) {
      if (!row.escrow_wrapped_mek) { summary.skipped.push(row.id); continue; }
      try { await verifyExistingEscrow(row, priv); summary.verified++; }
      catch (e) { summary.failed.push(`${row.id}: ${e.message}`); }
    }
    log(`verified ${summary.verified}, without escrow ${summary.skipped.length}, failed ${summary.failed.length}`);
    for (const f of summary.failed) log("  FAIL " + f);
    for (const s of summary.skipped) log("  no escrow blob " + s);
    return summary;
  }

  for (const row of rows) {
    if (row.escrow_wrapped_mek) { summary.already++; continue; }
    if (!row.recovery_key || !row.recovery_wrapped_mek || !row.recovery_iv) {
      summary.skipped.push(row.id);
      log(`  skip ${row.id}: no usable recovery key (blob is written at the account's next login)`);
      continue;
    }
    let fields;
    try {
      fields = await buildVerifiedEscrow(row, pub, priv);
    } catch (e) {
      log(`  ABORT at ${row.id}: ${e.message}`);
      summary.failed.push(`${row.id}: ${e.message}`);
      return summary;
    }
    if (mode !== "write") { log(`  would write ${row.id}`); summary.migrated++; continue; }
    const patch = await fetch(`${baseUrl}/rest/v1/profiles?id=eq.${row.id}&escrow_wrapped_mek=is.null`, {
      method: "PATCH", headers: headers(serviceKey, { Prefer: "return=representation" }), body: JSON.stringify(fields),
    });
    const body = await patch.text();
    if (!patch.ok) { log(`  ABORT at ${row.id}: PATCH ${patch.status} ${body}`); summary.failed.push(row.id); return summary; }
    const written = JSON.parse(body);
    if (written.length !== 1 || written[0].escrow_wrapped_mek !== fields.escrow_wrapped_mek) {
      log(`  ABORT at ${row.id}: PATCH did not return the written row`); summary.failed.push(row.id); return summary;
    }
    summary.migrated++;
    log(`  written ${row.id}`);
  }
  log(`${mode === "write" ? "migrated" : "would migrate"} ${summary.migrated}, already had escrow ${summary.already}, skipped ${summary.skipped.length}, failed ${summary.failed.length}`);
  return summary;
}

function readHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt + " > ");
    let buf = "";
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\u0003") process.exit(130);
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", onData);
          process.stdout.write("\n"); resolve(buf.trim()); return;
        }
        buf += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--verify") ? "verify" : "dry";
  console.log(`escrow-migrate: ${mode} run against ${SUPABASE_URL}`);
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || (await readHidden("Paste the Supabase service role key (Project Settings, API), then Enter"));
  const pkcs8 = (process.env.ESCROW_PRIVATE_KEY || (await readHidden("Paste the escrow private key from Bitwarden, then Enter"))).replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  if (!serviceKey || !pkcs8) { console.error("both keys are required"); process.exit(1); }
  const summary = await run({ mode, serviceKey, pkcs8 });
  process.exit(summary.failed.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
}
