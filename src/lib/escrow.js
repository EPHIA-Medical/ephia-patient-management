// Key escrow for the Master Encryption Key (MEK).
//
// The MEK is wrapped with EPHIA's RSA-OAEP public key so that a doctor who
// lost their password can be recovered on request. The private key never
// touches Supabase or this bundle; it lives in the EPHIA Bitwarden
// organisation and is only ever used by scripts/escrow-recover.mjs.
//
// The OAEP label is the Supabase user id, which binds a blob to its account:
// a blob copied into another profile row does not unwrap.
//
// See docs/escrow-recovery-plan.md.

import { encryptData, decryptData, bufToBase64, base64ToBuf } from "./crypto.js";

// SPKI, base64 (output of `openssl pkey -pubout -outform DER | base64`).
// Key id 2026-11, generated 2026-11-08; private key in the EPHIA Bitwarden
// organisation. While this is empty the app writes no escrow blob.
export const ESCROW_PUBLIC_KEY_SPKI =
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAvAv2lmvsmZpKV4NI/mK5efTsmF0nP8nszh37wsz6xMw2TWzbxAkJz7MnUarOwfbpckiY2+ygbzpDHA87U1TTldrwxyY5wqHQOxiYTLNaZipZ9pBjQ0tEp9hzQBvJHg6qpu5KttOHSW+CHdLsQ24t8aP4W+o+cWnec85DjfA3cfVqj7URs45nIt7D6wPsK2KoHYgihtEZUK0twULf5AqxclTuVq8c6XOFqkI0pe4LdGIC2L4vdeXHjz9d/5fVMqiFjRGj1mUR8jwdkD6w++3wVVxgVd/IrG3vxFHsQGyybIOvJlvLooqXKIbL7lR2k1yTRISjvo37WKPteQjhXhce4GDROWrLI/8JDlk29UN4/FXbS02NOzKAFSjBmWn2Mx4iM/R+UiRXCY5w6umoIAgVqOG6qtrMVCPiiFgXDh9uV1EcSesyXzAAPJanED3Kfhsz0SBT3zKzH/Qbc8j84cMq86CqU+O0wakRiXXUgsfyvywcP2X1+wCoB9O5MBkPYgjIgCzlNJv4Tw1aGUIJh2vSo4P0nCCk/n5B+eYmUZKyVOZ4WwBKV5lIYQY9XewH7eXubqiOMbjWbB5+xDf3iRCZg3Q9QyssiLlPsPvRhK5JAXxm48TMcPIfFDM8RyEcgzxLE4brz53x78vLFKRYE1dlVoPhE2OmyEjArGAO04/0DV0CAwEAAQ==";
export const ESCROW_KEY_ID = "2026-11";

export const MEK_CHECK_PLAINTEXT = "ephia-mek-check-v1";

export function escrowConfigured() {
  return ESCROW_PUBLIC_KEY_SPKI.length > 0;
}

export async function importEscrowPublicKey(spkiBase64 = ESCROW_PUBLIC_KEY_SPKI) {
  return crypto.subtle.importKey(
    "spki",
    base64ToBuf(spkiBase64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

export async function importEscrowPrivateKey(pkcs8Base64) {
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBuf(pkcs8Base64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
}

function labelFor(userId) {
  if (!userId || typeof userId !== "string") throw new Error("escrow: userId required");
  return new TextEncoder().encode(userId);
}

// Wraps the raw MEK for escrow. Returns base64 ciphertext.
export async function wrapMEKForEscrow(mek, userId, publicKey) {
  const pub = publicKey || (await importEscrowPublicKey());
  const raw = await crypto.subtle.exportKey("raw", mek);
  const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP", label: labelFor(userId) }, pub, raw);
  return bufToBase64(wrapped);
}

// Unwraps an escrow blob with the private key. Returns the MEK as a CryptoKey.
// Used by the recovery script only, never by the app.
export async function unwrapMEKFromEscrow(wrappedBase64, userId, privateKey) {
  const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP", label: labelFor(userId) }, privateKey, base64ToBuf(wrappedBase64));
  if (raw.byteLength !== 32) throw new Error("escrow: unwrapped key has wrong length");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

// A known plaintext encrypted under the MEK. Lets any recovery verify that the
// key it holds is the right one before it overwrites anything.
export async function makeMekCheck(mek) {
  const { ciphertext, iv } = await encryptData(MEK_CHECK_PLAINTEXT, mek);
  return { mek_check: ciphertext, mek_check_iv: iv };
}

export async function verifyMekCheck(mek, profile) {
  if (!profile || !profile.mek_check || !profile.mek_check_iv) return false;
  try {
    const value = await decryptData(profile.mek_check, profile.mek_check_iv, mek);
    return value === MEK_CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}

// Everything the app writes to `profiles` for an account's escrow.
export async function buildEscrowFields(mek, userId) {
  const escrow_wrapped_mek = await wrapMEKForEscrow(mek, userId);
  const check = await makeMekCheck(mek);
  return { escrow_wrapped_mek, escrow_key_id: ESCROW_KEY_ID, ...check };
}

export async function exportMEKRawBase64(mek) {
  return bufToBase64(await crypto.subtle.exportKey("raw", mek));
}
