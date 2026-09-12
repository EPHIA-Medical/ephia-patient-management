import { SUPABASE_URL, SUPABASE_ANON_KEY, pgv, supabaseDeleteWhere } from "./client";

export async function supabaseFetchDocuments(accessToken, userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?user_id=eq.${pgv(userId)}`,
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
  if (!res.ok) throw new Error(data.message || "Fetch documents failed");
  return data;
}

export async function supabaseCreateDocument(accessToken, userId, patientId, behandlungId, docType, docData, iv, encryptionVersion, legacyInvoiceId) {
  const payload = { user_id: userId, doc_type: docType, data: docData };
  if (patientId != null) payload.patient_id = patientId;
  if (behandlungId != null) payload.behandlung_id = behandlungId;
  if (iv != null) payload.iv = iv;
  if (encryptionVersion != null) payload.encryption_version = encryptionVersion;
  if (legacyInvoiceId != null) payload.legacy_invoice_id = legacyInvoiceId;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/documents`,
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
  if (!res.ok) throw new Error(data.message || "Create document failed");
  return Array.isArray(data) ? data[0] : data;
}

export async function supabaseUpdateDocument(accessToken, documentId, docData, iv, encryptionVersion) {
  const payload = { data: docData };
  if (iv != null) payload.iv = iv;
  if (encryptionVersion != null) payload.encryption_version = encryptionVersion;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?id=eq.${pgv(documentId)}`,
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
  if (!res.ok) throw new Error(data.message || "Update document failed");
  return data;
}

export function supabaseDeleteDocument(accessToken, documentId) {
  return supabaseDeleteWhere(accessToken, "documents", `id=eq.${pgv(documentId)}`, "Dokument löschen");
}

export function supabaseDeleteDocumentsByPatient(accessToken, patientId) {
  return supabaseDeleteWhere(accessToken, "documents", `patient_id=eq.${pgv(patientId)}`, "Dokumente löschen");
}

export function supabaseDeleteDocumentsByBehandlung(accessToken, behandlungId) {
  return supabaseDeleteWhere(accessToken, "documents", `behandlung_id=eq.${pgv(behandlungId)}`, "Dokumente löschen");
}

// Unlink all documents of a Behandlung (used when the Behandlung is deleted but its documents are kept)
export async function supabaseDetachDocumentsFromBehandlung(accessToken, behandlungId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?behandlung_id=eq.${pgv(behandlungId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ behandlung_id: null }),
    }
  );
  if (!res.ok) {
    let msg = "";
    try { const body = await res.json(); msg = body.message || ""; } catch (e) { /* ignore */ }
    throw new Error(`Dokumente lösen fehlgeschlagen (${res.status})${msg ? ": " + msg : ""}`);
  }
  return true;
}

export async function supabaseUpdateDocumentBehandlung(accessToken, documentId, behandlungId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?id=eq.${pgv(documentId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({ behandlung_id: behandlungId }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Update document behandlung failed");
  return data;
}
