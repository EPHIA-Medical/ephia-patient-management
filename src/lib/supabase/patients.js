import { SUPABASE_URL, SUPABASE_ANON_KEY, pgv, supabaseDeleteWhere } from "./client";

export function supabaseDeletePatient(accessToken, patientId) {
  return supabaseDeleteWhere(accessToken, "patients", `id=eq.${pgv(patientId)}`, "Patient:in löschen");
}

export async function supabaseFetchPatients(accessToken, userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/patients?user_id=eq.${pgv(userId)}`,
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
  if (!res.ok) throw new Error(data.message || "Fetch patients failed");
  return data;
}
