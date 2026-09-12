import { SUPABASE_URL, SUPABASE_ANON_KEY, pgv, supabaseDeleteWhere } from "./client";

export async function supabaseFetchActivityLog(accessToken, userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/activity_log?user_id=eq.${pgv(userId)}&order=created_at.desc`,
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
  if (!res.ok) throw new Error(data.message || "Fetch activity log failed");
  return data;
}

export async function supabaseCreateActivityLog(accessToken, userId, patientId, entityType, entityId, actionType, logData, iv, encryptionVersion) {
  const payload = { user_id: userId, entity_type: entityType, entity_id: entityId, action_type: actionType, data: logData };
  if (patientId != null) payload.patient_id = patientId;
  if (iv != null) payload.iv = iv;
  if (encryptionVersion != null) payload.encryption_version = encryptionVersion;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/activity_log`,
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
  if (!res.ok) throw new Error(data.message || "Create activity log failed");
  return Array.isArray(data) ? data[0] : data;
}

export function supabaseDeleteActivityLogByPatient(accessToken, patientId) {
  return supabaseDeleteWhere(accessToken, "activity_log", `patient_id=eq.${pgv(patientId)}`, "Verlauf löschen");
}
