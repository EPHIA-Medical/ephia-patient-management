import { SUPABASE_URL, SUPABASE_ANON_KEY, pgv, supabaseDeleteWhere } from "./client";

export async function supabaseFetchBehandlungen(accessToken, userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/behandlungen?user_id=eq.${pgv(userId)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Fetch behandlungen failed");
  return data;
}

export async function supabaseCreateBehandlung(accessToken, userId, patientId, behData, iv, encryptionVersion) {
  const payload = { user_id: userId, patient_id: patientId, data: behData };
  if (iv != null) payload.iv = iv;
  if (encryptionVersion != null) payload.encryption_version = encryptionVersion;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/behandlungen`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(payload),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Create behandlung failed");
  return Array.isArray(data) ? data[0] : data;
}

export async function supabaseUpdateBehandlung(accessToken, behandlungId, behData, iv, encryptionVersion) {
  const payload = { data: behData };
  if (iv != null) payload.iv = iv;
  if (encryptionVersion != null) payload.encryption_version = encryptionVersion;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/behandlungen?id=eq.${pgv(behandlungId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(payload),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Update behandlung failed");
  return data;
}

export function supabaseDeleteBehandlung(accessToken, behandlungId) {
  return supabaseDeleteWhere(accessToken, "behandlungen", `id=eq.${pgv(behandlungId)}`, "Behandlung löschen");
}

export function supabaseDeleteBehandlungenByPatient(accessToken, patientId) {
  return supabaseDeleteWhere(accessToken, "behandlungen", `patient_id=eq.${pgv(patientId)}`, "Behandlungen löschen");
}
