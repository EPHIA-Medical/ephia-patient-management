export const SUPABASE_URL = "https://grfngjgjiipbgntsduom.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZm5namdqaWlwYmdudHNkdW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODQ0MTgsImV4cCI6MjA4Nzk2MDQxOH0.zXQPceMagDNR4JcAz7f4PkywClG0CLBKrdrOpOeliTU";

// Encode a value before interpolating it into a PostgREST filter (e.g. `id=eq.${pgv(id)}`).
// Prevents query-param / operator injection if a value is ever attacker-influenced.
// UUIDs and emails pass through unchanged, so this is behaviour-preserving for valid input.
export const pgv = (v) => encodeURIComponent(v);

// Shared DELETE helper: PostgREST returns 204 on success; on failure (RLS, FK constraint, …)
// we surface the server message instead of silently returning false.
export async function supabaseDeleteWhere(accessToken, table, filter, label) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    let msg = "";
    try { const body = await res.json(); msg = body.message || body.details || ""; } catch (e) { /* no json body */ }
    throw new Error(`${label || "Löschen"} fehlgeschlagen (${res.status})${msg ? ": " + msg : ""}`);
  }
  return true;
}
