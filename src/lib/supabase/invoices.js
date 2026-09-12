import { SUPABASE_URL, SUPABASE_ANON_KEY, pgv, supabaseDeleteWhere } from "./client";

export async function supabaseFetchInvoices(accessToken, userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invoices?user_id=eq.${pgv(userId)}`,
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
  if (!res.ok) throw new Error(data.message || "Fetch invoices failed");
  return data;
}

export async function supabaseCreateInvoice(accessToken, userId, invoiceData, iv, encryptionVersion) {
  const payload = { user_id: userId, data: invoiceData };
  if (iv != null) payload.iv = iv;
  if (encryptionVersion != null) payload.encryption_version = encryptionVersion;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invoices`,
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
  if (!res.ok) throw new Error(data.message || "Create invoice failed");
  return Array.isArray(data) ? data[0] : data;
}

export async function supabaseUpdateInvoice(accessToken, invoiceId, invoiceData, iv, encryptionVersion) {
  const payload = { data: invoiceData };
  if (iv != null) payload.iv = iv;
  if (encryptionVersion != null) payload.encryption_version = encryptionVersion;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invoices?id=eq.${pgv(invoiceId)}`,
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
  if (!res.ok) throw new Error(data.message || "Update invoice failed");
  return data;
}

export function supabaseDeleteInvoice(accessToken, invoiceId) {
  return supabaseDeleteWhere(accessToken, "invoices", `id=eq.${pgv(invoiceId)}`, "Rechnung löschen");
}
