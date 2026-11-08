#!/usr/bin/env node
// Escrow recovery tool (docs/escrow-recovery-plan.md, section 3.2 and the
// step 2 gate). Runs on a laptop, never on a server.
//
//   node scripts/escrow-recover.mjs verify  <user-id> <escrow_wrapped_mek> <mek_check> <mek_check_iv>
//   node scripts/escrow-recover.mjs release <user-id> <escrow_wrapped_mek> <mek_check> <mek_check_iv>
//
// Both modes read the escrow PRIVATE key (PKCS8, base64, one line) from stdin,
// so it is pasted from Bitwarden and never lands on disk or in shell history.
//
//   verify   unwraps the blob, checks it against mek_check, prints OK or FAIL.
//            Prints nothing secret. Used to prove the public key in the bundle
//            matches the private key in Bitwarden (step 2 gate) and to
//            spot-check migrated accounts (step 3 gate).
//   release  additionally wraps the MEK under a one-time code and prints the
//            four escrow_release* values to paste into the profile row plus the
//            code to send to the account email. Expiry is 48 h from now.
//
// The MEK itself is never printed.

import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { importEscrowPrivateKey, unwrapMEKFromEscrow, verifyMekCheck } from "../src/lib/escrow.js";
import { derivePDK, generateSalt, wrapMEK } from "../src/lib/crypto.js";

globalThis.crypto ??= webcrypto;

// 256 simple German nouns, 8 of them = 64 bits. Spelled without umlauts so they
// survive any mail client and keyboard.
const WORDS = ["acker", "adler", "ahorn", "amsel", "anker", "apfel", "arm", "ast", "bach", "bagger", "ball", "band", "bank", "bart", "baum", "beere", "berg", "besen", "biene", "birke", "blatt", "blau", "blitz", "blume", "bohne", "boot", "brief", "brot", "bruecke", "buch", "burg", "dach", "daumen", "decke", "diele", "distel", "donner", "dorf", "dose", "drache", "eiche", "eimer", "eis", "ente", "erde", "ernte", "esel", "eule", "faden", "fahne", "falke", "farbe", "feder", "feld", "fels", "fenster", "feuer", "fisch", "flasche", "flinte", "floete", "flug", "fluss", "frosch", "fuchs", "gabel", "gans", "garn", "garten", "gast", "geige", "gelb", "gipfel", "glas", "gold", "gras", "gurke", "haar", "hafen", "hahn", "hammer", "hand", "hase", "haus", "hecke", "heft", "herz", "himmel", "hirsch", "holz", "honig", "huegel", "hund", "hut", "igel", "insel", "jacke", "jahr", "kaffee", "kamm", "kanu", "karte", "katze", "kegel", "kerze", "kessel", "kette", "kiesel", "kind", "kirche", "kirsche", "kissen", "kiste", "klee", "kleid", "knopf", "koffer", "korb", "kran", "kreis", "krone", "kuchen", "kugel", "kuh", "laden", "lampe", "land", "laub", "leiter", "lerche", "licht", "lied", "linde", "loch", "loewe", "luft", "lupe", "mantel", "marmor", "mast", "maus", "meer", "mehl", "milch", "moewe", "mond", "moos", "muehle", "muetze", "muschel", "nadel", "nagel", "natter", "nebel", "nest", "netz", "nixe", "nord", "note", "nuss", "obst", "ofen", "ohr", "olive", "orgel", "otter", "palme", "papier", "pappel", "park", "perle", "pfad", "pfeil", "pferd", "pflaume", "pilz", "pinsel", "platz", "quark", "quelle", "rabe", "rad", "rahmen", "rakete", "rebe", "regen", "reh", "reis", "riegel", "ring", "robbe", "rose", "rotte", "ruder", "sack", "saite", "salz", "samen", "sand", "schaf", "schale", "schere", "schiff", "schnee", "schuh", "schwan", "see", "segel", "seil", "sense", "sofa", "sonne", "spatz", "spiegel", "stab", "stadt", "stein", "stern", "storch", "strand", "stuhl", "sturm", "tafel", "tal", "tanne", "tasse", "taube", "teich", "teller", "tinte", "tisch", "topf", "tor", "traube", "truhe", "tulpe", "turm", "ufer", "uhr", "vogel", "wachs", "wagen", "wald", "wanne", "wasser", "weg", "weide", "wein", "welle", "wespe", "wiese", "wind", "wolke", "wurm", "wurzel", "zange"];
const RELEASE_ITERATIONS = 300000;
const RELEASE_HOURS = 48;

function fail(msg) { console.error(msg); process.exit(1); }

function oneTimeCode() {
  const idx = webcrypto.getRandomValues(new Uint32Array(8));
  return Array.from(idx, (n) => WORDS[n % WORDS.length]).join("-");
}

async function main() {
  const [mode, userId, blob, mekCheck, mekCheckIv] = process.argv.slice(2);
  if (!["verify", "release"].includes(mode) || !userId || !blob || !mekCheck || !mekCheckIv) {
    fail("usage: escrow-recover.mjs verify|release <user-id> <escrow_wrapped_mek> <mek_check> <mek_check_iv>   (private key on stdin)");
  }
  const pkcs8 = readFileSync(0, "utf8").replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  if (!pkcs8) fail("no private key on stdin");

  const priv = await importEscrowPrivateKey(pkcs8);
  let mek;
  try {
    mek = await unwrapMEKFromEscrow(blob, userId, priv);
  } catch (e) {
    fail("FAIL: blob does not unwrap for this user id with this private key (" + (e.message || e) + ")");
  }
  const ok = await verifyMekCheck(mek, { mek_check: mekCheck, mek_check_iv: mekCheckIv });
  if (!ok) fail("FAIL: unwrapped key does not verify against mek_check");
  console.log("OK: escrow blob unwraps and verifies for user " + userId);
  if (mode === "verify") return;

  const code = oneTimeCode();
  const salt = generateSalt();
  const codeKey = await derivePDK(code, salt, RELEASE_ITERATIONS);
  const { encrypted, iv } = await wrapMEK(mek, codeKey);
  const expires = new Date(Date.now() + RELEASE_HOURS * 3600 * 1000).toISOString();

  console.log("\nPaste into the profile row (Supabase dashboard, table profiles, id = " + userId + "):\n");
  console.log(JSON.stringify({
    escrow_release: encrypted,
    escrow_release_iv: iv,
    escrow_release_salt: salt,
    escrow_release_expires_at: expires,
  }, null, 2));
  console.log("\nSend this code to the ACCOUNT email address (auth.users), not to the requester:\n");
  console.log("  " + code + "\n");
  console.log("Expires " + expires + ". Log the recovery (date, user id, request email).");
}

main().catch((e) => fail(String(e && e.stack || e)));
