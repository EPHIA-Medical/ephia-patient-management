// Client for the secure document sending routes of the api/ service (api/src/app/api/shares).
// Also used by the patient's opening page (/d/), which needs no login.

import {
  randomBytes, toB64url, fromB64url, normalizeAnswer, deriveShareKey, deriveVerifier, encryptBytes, encryptText,
  decryptBytes, decryptText,
} from "./shareCrypto";

export const API_URL = (typeof window !== "undefined" && window.location.hostname === "localhost" && window.localStorage?.getItem("ephia_api_url")) || "https://api.pms.ephia.de";

async function call(path, { method = "GET", token, body } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("Keine Verbindung zum Server. Bitte prüfe Deine Internetverbindung."), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status, data });
  return data;
}

/**
 * Encrypts the files in the browser and sends them as a protected link.
 * files: [{ kind: "rechnung"|"behandlung"|"hv"|"aufklaerung", ref, label, file: File|Blob }]
 * factor: { type: "dob"|"code", value }
 */
export async function sendSecureShare({ token, files, factor, recipient, practice, message }) {
  const answer = normalizeAnswer(factor.type, factor.value);
  if (!answer) throw new Error(factor.type === "code" ? "Der Code muss sechs Ziffern haben." : "Bitte ein gültiges Geburtsdatum eingeben.");
  const halfA = randomBytes(32), halfB = randomBytes(32), keySalt = randomBytes(16);
  const key = await deriveShareKey(halfA, halfB, answer, keySalt);
  const verifier = await deriveVerifier(answer, keySalt);
  const encFiles = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.file.arrayBuffer());
    const { iv, data } = await encryptBytes(key, bytes);
    const label = await encryptText(key, f.label);
    encFiles.push({ kind: f.kind, ref: String(f.ref || ""), iv, data: toB64url(data), label_iv: label.iv, label_enc: label.data });
  }
  return call("/api/shares", {
    method: "POST",
    token,
    body: {
      files: encFiles,
      half_a: toB64url(halfA),
      half_b: toB64url(halfB),
      key_salt: toB64url(keySalt),
      factor: { type: factor.type, verifier },
      recipient,
      practice,
      message: message || "",
    },
  });
}

export const listShares = (token, refs) => call(`/api/shares?docs=${encodeURIComponent(refs.filter(Boolean).join(","))}`, { token });
export const revokeShare = (token, id) => call(`/api/shares/${encodeURIComponent(id)}/revoke`, { method: "POST", token });

// ── patient side ──

export const fetchShareMeta = (id) => call(`/api/shares/${encodeURIComponent(id)}`);

/**
 * Checks the date of birth or code with the server and decrypts the files locally.
 * Returns [{ label, blob }]. On a wrong answer throws with .status 401 and .data.attempts_left.
 */
export async function unlockShare({ id, halfAB64, factorType, value, keySaltB64 }) {
  const answer = normalizeAnswer(factorType, value);
  if (!answer) throw Object.assign(new Error(factorType === "code" ? "Der Code hat sechs Ziffern." : "Bitte gib Dein Geburtsdatum als TT.MM.JJJJ ein."), { status: 400 });
  const keySalt = fromB64url(keySaltB64);
  const verifier = await deriveVerifier(answer, keySalt);
  const res = await call(`/api/shares/${encodeURIComponent(id)}/unlock`, { method: "POST", body: { verifier } });
  const key = await deriveShareKey(fromB64url(halfAB64), fromB64url(res.half_b), answer, fromB64url(res.key_salt));
  const out = [];
  for (const f of res.files) {
    const r = await fetch(f.url);
    if (!r.ok) throw new Error("Die Unterlagen konnten nicht geladen werden. Bitte versuche es noch einmal.");
    const data = new Uint8Array(await r.arrayBuffer());
    const pdf = await decryptBytes(key, f.iv, data);
    out.push({ label: await decryptText(key, f.label_iv, f.label_enc), blob: new Blob([pdf], { type: "application/pdf" }) });
  }
  return out;
}
