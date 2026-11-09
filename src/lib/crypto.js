// ═══════════════════ E2EE Crypto Helpers ═══════════════════

export const MEK_SESSION_KEY = "ephia_mek";
export let currentMEK = null; // Module-level: holds CryptoKey during session

export function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBuf(str) {
  const binary = atob(str);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

// PBKDF2-SHA256 iterations for the password-derived key (PDK) that wraps the
// MEK. New wraps use PDK_ITERATIONS (OWASP 2023 figure for PBKDF2-SHA256).
// Unwrapping always uses the count stored in profiles.mek_params, so raising
// this never locks anyone out; profiles without mek_params predate the field
// and were wrapped with LEGACY_PDK_ITERATIONS. Logins re-wrap older profiles
// up to PDK_ITERATIONS (see needsPdkUpgrade / wrapMEKWithPassword).
export const PDK_ITERATIONS = 600000;
export const LEGACY_PDK_ITERATIONS = 100000;

export function storedPdkIterations(profile) {
  return profile?.mek_params?.iterations || LEGACY_PDK_ITERATIONS;
}

export function needsPdkUpgrade(profile) {
  return !!profile?.encrypted_mek && storedPdkIterations(profile) < PDK_ITERATIONS;
}

// Wraps the MEK under a fresh salt and the current iteration count. Returns
// the four profile columns, to be written together in one PATCH.
export async function wrapMEKWithPassword(mek, password) {
  const mek_salt = generateSalt();
  const pdk = await derivePDK(password, mek_salt, PDK_ITERATIONS);
  const { encrypted, iv } = await wrapMEK(mek, pdk);
  return { encrypted_mek: encrypted, mek_iv: iv, mek_salt, mek_params: { iterations: PDK_ITERATIONS, hash: "SHA-256" } };
}

// No default for iterations on purpose: an unwrap must use the stored count,
// and a silent default is how a mismatch would creep in.
export async function derivePDK(password, saltBase64, iterations) {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error("derivePDK: iterations required");
  const enc = new TextEncoder();
  const salt = base64ToBuf(saltBase64);
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

export async function generateMEK() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function generateRecoveryKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["wrapKey", "unwrapKey"]);
}

export function generateSalt() {
  return bufToBase64(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function wrapMEK(mek, wrappingKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", mek, wrappingKey, { name: "AES-GCM", iv });
  return { encrypted: bufToBase64(wrapped), iv: bufToBase64(iv.buffer) };
}

export async function unwrapMEK(encryptedBase64, ivBase64, unwrappingKey) {
  const encrypted = base64ToBuf(encryptedBase64);
  const iv = base64ToBuf(ivBase64);
  return crypto.subtle.unwrapKey("raw", encrypted, unwrappingKey, { name: "AES-GCM", iv }, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encryptData(obj, mek) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = enc.encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, mek, plaintext);
  return { ciphertext: bufToBase64(ciphertext), iv: bufToBase64(iv.buffer) };
}

export async function decryptData(ciphertextBase64, ivBase64, mek) {
  const ciphertext = base64ToBuf(ciphertextBase64);
  const iv = base64ToBuf(ivBase64);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, mek, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function computePatientHash(identifier, mek) {
  // identifier can be email or "vorname|nachname" fallback
  const enc = new TextEncoder();
  const mekRaw = await crypto.subtle.exportKey("raw", mek);
  const hmacKey = await crypto.subtle.importKey("raw", mekRaw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", hmacKey, enc.encode(identifier.toLowerCase().trim()));
  return bufToBase64(signature);
}

export function getPatientIdentifier(patientData) {
  if (patientData.email && patientData.email.trim()) return patientData.email.toLowerCase().trim();
  return `${(patientData.vorname || "").trim()}|${(patientData.nachname || "").trim()}`.toLowerCase();
}

export async function exportMEKToBase64(mek) {
  const raw = await crypto.subtle.exportKey("raw", mek);
  return bufToBase64(raw);
}

export async function importMEKFromBase64(b64) {
  const raw = base64ToBuf(b64);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export function storeMEKInSession(mekBase64) {
  try { sessionStorage.setItem(MEK_SESSION_KEY, mekBase64); } catch (e) { /* ignore */ }
}

export function loadMEKFromSession() {
  try { return sessionStorage.getItem(MEK_SESSION_KEY); } catch (e) { return null; }
}

export function clearMEKFromSession() {
  try { sessionStorage.removeItem(MEK_SESSION_KEY); } catch (e) { /* ignore */ }
}
