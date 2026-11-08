// ═══════════════════ Secure document sending: browser crypto ═══════════════════
//
// Used by the app (sending) and by the patient's opening page (/d/). Nothing
// here talks to the network.
//
//   halfA  32 random bytes, only in the link after '#'
//   halfB  32 random bytes, stored by the API, released after the factor check
//   F      PBKDF2-SHA256(answer, keySalt, 600k) from the date of birth or code
//   K      HKDF-SHA256(halfA ‖ halfB ‖ F, salt keySalt, info "ephia-share-v1") → AES-256-GCM
//
// EPHIA stores halfB and the ciphertext but never halfA (it only passes through
// the send call into the email) and never the date of birth or code (the server
// gets a verifier derived from it). Neither EPHIA's database, the mail provider
// nor the link alone can decrypt a file.

export const SHARE_INFO = "ephia-share-v1";
export const F_ITERATIONS = 600000;

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function toB64url(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(str) {
  const b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Date of birth → "YYYY-MM-DD". Accepts "TT.MM.JJJJ", "T.M.JJJJ", "TTMMJJJJ" and ISO.
// Returns "" when it is not a real calendar date.
export function normalizeDob(input) {
  const s = String(input || "").trim();
  let d, m, y;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = s.match(/^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{4})$/))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else if ((r = s.match(/^(\d{2})(\d{2})(\d{4})$/))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  if (y < 1900 || dt.getTime() > Date.now()) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const normalizeCode = (input) => String(input || "").replace(/\D/g, "");

export function normalizeAnswer(type, input) {
  return type === "code" ? (normalizeCode(input).length === 6 ? normalizeCode(input) : "") : normalizeDob(input);
}

// 6-digit code without modulo bias
export function generateCode() {
  const max = 4294967296 - (4294967296 % 1000000);
  let v;
  do { v = crypto.getRandomValues(new Uint32Array(1))[0]; } while (v >= max);
  return String(v % 1000000).padStart(6, "0");
}

async function pbkdf2(answer, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(answer), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: F_ITERATIONS, hash: "SHA-256" }, base, 256);
  return new Uint8Array(bits);
}

const deriveF = (answer, keySalt) => pbkdf2(answer, keySalt);

// What the server checks instead of the date of birth itself: a PBKDF2 with a
// different salt, so it says nothing about F and EPHIA never sees the answer.
export async function deriveVerifier(answer, keySalt) {
  const tag = new TextEncoder().encode("verify");
  const salt = new Uint8Array(keySalt.length + tag.length);
  salt.set(keySalt, 0); salt.set(tag, keySalt.length);
  return toB64url(await pbkdf2(answer, salt));
}

// K from the three parts. answer must already be normalised.
export async function deriveShareKey(halfA, halfB, answer, keySalt) {
  const f = await deriveF(answer, keySalt);
  const ikm = new Uint8Array(halfA.length + halfB.length + f.length);
  ikm.set(halfA, 0); ikm.set(halfB, halfA.length); ikm.set(f, halfA.length + halfB.length);
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: keySalt, info: new TextEncoder().encode(SHARE_INFO) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(key, bytes) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { iv: toB64url(iv), data: new Uint8Array(ct) };
}

export async function decryptBytes(key, ivB64, data) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(ivB64) }, key, data);
  return new Uint8Array(pt);
}

export async function encryptText(key, text) {
  const { iv, data } = await encryptBytes(key, new TextEncoder().encode(text));
  return { iv, data: toB64url(data) };
}

export async function decryptText(key, ivB64, dataB64) {
  return new TextDecoder().decode(await decryptBytes(key, ivB64, fromB64url(dataB64)));
}
