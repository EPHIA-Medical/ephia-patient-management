import React, { useState, useRef, useEffect } from "react";
import InfoTooltip from "../ui/InfoTooltip";
import { SUPABASE_URL, SUPABASE_ANON_KEY, pgv } from "../../lib/supabase/client";
import { computePatientHash, getPatientIdentifier, encryptData, derivePDK, generateSalt, wrapMEK } from "../../lib/crypto";
import { supabaseUpdateProfile } from "../../lib/supabase/profiles";
import { supabaseDeletePatient } from "../../lib/supabase/patients";
import { supabaseCreateBehandlung, supabaseDeleteBehandlung } from "../../lib/supabase/behandlungen";
import { supabaseCreateDocument, supabaseDeleteDocument } from "../../lib/supabase/documents";
import { showToast } from "../../utils/toast";

const RESTORE_WORD = "ERSETZEN";
// ═══════════════════ Settings Panel ═══════════════════

export default function SettingsPanel({ practice, setPractice, show, setShow, onSave, isFirstTime, session, currentMEK, userId, patients, invoices, behandlungen, setPatients, setInvoices }) {
  const [pwCurrent, setPwCurrent] = React.useState("");
  const [pwNew, setPwNew] = React.useState("");
  const [pwConfirm, setPwConfirm] = React.useState("");
  const [pwLoading, setPwLoading] = React.useState(false);
  const [pwMsg, setPwMsg] = React.useState(null);

  const handleChangePassword = async () => {
    if (!pwNew || pwNew !== pwConfirm) return;
    if (pwNew.length < 6) { setPwMsg({ type: "error", text: "Neues Passwort muss mindestens 6 Zeichen lang sein." }); return; }
    setPwLoading(true);
    setPwMsg(null);
    try {
      // Verify current password by attempting sign-in
      const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: session.user.email, password: pwCurrent }),
      });
      if (!verifyRes.ok) { setPwMsg({ type: "error", text: "Aktuelles Passwort ist falsch." }); setPwLoading(false); return; }

      // E2EE: re-wrap the MEK under the NEW password BEFORE touching the auth
      // password, so we can never end up with a changed login password but a
      // MEK still wrapped under the old one. The MEK itself does not change —
      // only the password-derived key that wraps it. This mirrors
      // initializeEncryption/unlockMEK exactly (wrapMEK + the
      // encrypted_mek/mek_iv/mek_salt/mek_params fields, profiles keyed by id).
      let rewrap = null;
      if (currentMEK && userId) {
        const newSalt = generateSalt();
        const newPdk = await derivePDK(pwNew, newSalt);
        const { encrypted: encrypted_mek, iv: mek_iv } = await wrapMEK(currentMEK, newPdk);
        rewrap = { encrypted_mek, mek_iv, mek_salt: newSalt, mek_params: { iterations: 100000, hash: "SHA-256" } };
      }

      // Update password via Supabase Auth API
      const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ password: pwNew }),
      });
      if (!updateRes.ok) { const err = await updateRes.json(); throw new Error(err.message || "Fehler beim Ändern des Passworts"); }

      // Persist the re-wrapped MEK. If this fails after the password change,
      // surface a hard error: the user can still recover via their recovery
      // key on next login, but we must not silently claim success.
      if (rewrap) {
        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${pgv(userId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Prefer": "return=representation" },
          body: JSON.stringify(rewrap),
        });
        if (!patchRes.ok) {
          const err = await patchRes.text();
          console.error("Failed to persist re-wrapped MEK:", err);
          throw new Error("Passwort geändert, aber die Verschlüsselung konnte nicht aktualisiert werden. Bitte melde Dich neu an — Deine Daten werden über den Wiederherstellungsschlüssel automatisch entsperrt.");
        }
      }

      setPwMsg({ type: "success", text: "Passwort erfolgreich geändert." });
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    } catch (err) {
      setPwMsg({ type: "error", text: err.message || "Fehler beim Ändern des Passworts." });
    }
    setPwLoading(false);
  };

  const [exportLoading, setExportLoading] = React.useState(false);
  const handleExportData = () => {
    setExportLoading(true);
    try {
      // Build decrypted patient list (full data for restore)
      const exportPatients = (patients || []).map(p => {
        const d = (typeof p.data === "object" && p.data) || {};
        return { id: p.id, ...d };
      });

      // Build invoice/document list — include ALL fields (incl. _docType,
      // _patientId, _behandlungId linkage) so restore can rebuild the graph.
      const exportInvoices = (invoices || []).map(inv => {
        const { _supabaseId, encrypted_patient, patient_iv, ...rest } = inv;
        return rest;
      });

      // Build behandlungen list — needed so document↔behandlung links survive
      // a restore. id/patientId are the original DB ids (remapped on restore).
      const exportBehandlungen = (behandlungen || []).map(b => {
        const { _id, _patientId, _createdAt, ...behData } = b;
        return { id: _id, patientId: _patientId, data: behData };
      });

      const exportData = {
        _exportVersion: 3,
        _exportDate: new Date().toISOString(),
        _appVersion: "ephia-invoicing-mvp",
        practice: { ...practice },
        patients: exportPatients,
        behandlungen: exportBehandlungen,
        invoices: exportInvoices,
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ephia-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      showToast("Export fehlgeschlagen: " + e.message, { error: true });
    }
    setExportLoading(false);
  };

  const [importLoading, setImportLoading] = React.useState(false);
  const importFileRef = React.useRef(null);
  const [restoreCtx, setRestoreCtx] = React.useState(null); // { data, behBackup, accessToken, uid } while the confirm modal is open
  const [restoreTyped, setRestoreTyped] = React.useState("");

  const handleImportData = async (e) => {
    const file = e?.target?.files?.[0];
    if (e?.target) e.target.value = "";
    if (!file) return;

    // Parse + fully validate the backup BEFORE touching any data, so a bad
    // file can never leave the account half-wiped.
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { showToast("Backup konnte nicht gelesen werden (kein gültiges JSON).", { error: true }); return; }
    if (!data || !data._exportVersion || !Array.isArray(data.patients) || !Array.isArray(data.invoices)) {
      showToast("Ungültiges Backup-Format.", { error: true }); return;
    }
    const behBackup = Array.isArray(data.behandlungen) ? data.behandlungen : [];

    const accessToken = session?.access_token;
    const uid = session?.user?.id || userId;
    if (!accessToken || !uid) { showToast("Keine aktive Sitzung.", { error: true }); return; }
    // E2EE is required: everything is stored encrypted. Without a MEK we cannot
    // re-encrypt, and we must never write plaintext PII.
    if (!currentMEK) {
      showToast("Verschlüsselung ist nicht entsperrt. Bitte melde Dich neu an, bevor Du ein Backup wiederherstellst.", { error: true });
      return;
    }

    // Strong, explicit confirmation via an in-app modal (no browser prompt).
    setRestoreTyped("");
    setRestoreCtx({ data, behBackup, accessToken, uid });
  };

  // Runs the replace-all restore once the user has confirmed in the modal.
  const performRestore = async () => {
    if (!restoreCtx) return;
    const { data, behBackup, accessToken, uid } = restoreCtx;
    setRestoreCtx(null);
    setImportLoading(true);
    try {
      // 1. Restore practice settings.
      if (data.practice) {
        await supabaseUpdateProfile(accessToken, uid, { ...data.practice });
        setPractice({ ...data.practice });
      }

      // 2. Delete current data, children before parents:
      //    documents → behandlungen → patients (all on the documents schema).
      for (const inv of invoices || []) {
        if (inv._supabaseId) { try { await supabaseDeleteDocument(accessToken, inv._supabaseId); } catch (err) { console.warn("Delete document failed:", err); } }
      }
      for (const b of behandlungen || []) {
        if (b._id) { try { await supabaseDeleteBehandlung(accessToken, b._id); } catch (err) { console.warn("Delete behandlung failed:", err); } }
      }
      for (const p of patients || []) {
        if (p.id) { try { await supabaseDeletePatient(accessToken, p.id); } catch (err) { console.warn("Delete patient failed:", err); } }
      }

      const fail = { patients: 0, behandlungen: 0, documents: 0 };

      // 3. Recreate patients (encryption_version 1, email = patient_hash; never
      //    plaintext). Build old→new id map to re-link behandlungen/documents.
      const patientIdMap = {};
      for (const p of data.patients) {
        const { id: oldId, ...patientData } = p;
        try {
          const patientHash = await computePatientHash(getPatientIdentifier(patientData), currentMEK);
          const { ciphertext, iv } = await encryptData(patientData, currentMEK);
          const res = await fetch(`${SUPABASE_URL}/rest/v1/patients`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Prefer": "return=representation" },
            body: JSON.stringify({ user_id: uid, email: patientHash, patient_hash: patientHash, data: ciphertext, iv, encryption_version: 1 }),
          });
          if (!res.ok) throw new Error(await res.text());
          const json = await res.json();
          const rec = Array.isArray(json) ? json[0] : json;
          if (oldId != null && rec?.id) patientIdMap[oldId] = rec.id;
        } catch (err) { fail.patients++; console.warn("Restore patient failed:", err); }
      }

      // 4. Recreate behandlungen (encryption_version 2), remap patient_id.
      const behIdMap = {};
      for (const b of behBackup) {
        try {
          const newPatientId = b.patientId != null ? (patientIdMap[b.patientId] || null) : null;
          const { ciphertext, iv } = await encryptData(b.data || {}, currentMEK);
          const created = await supabaseCreateBehandlung(accessToken, uid, newPatientId, ciphertext, iv, 2);
          if (b.id != null && created?.id) behIdMap[b.id] = created.id;
        } catch (err) { fail.behandlungen++; console.warn("Restore behandlung failed:", err); }
      }

      // 5. Recreate documents (encryption_version 2), remap patient_id +
      //    behandlung_id and preserve doc_type. The encrypted body is the doc
      //    content with the internal linkage fields stripped back out.
      for (const inv of data.invoices) {
        try {
          const { _supabaseId, _createdAt, _docType, _behandlungId, _patientId, encrypted_patient, patient_iv, ...body } = inv;
          const newPatientId = _patientId != null ? (patientIdMap[_patientId] || null) : null;
          const newBehId = _behandlungId != null ? (behIdMap[_behandlungId] || null) : null;
          const { ciphertext, iv } = await encryptData(body, currentMEK);
          await supabaseCreateDocument(accessToken, uid, newPatientId, newBehId, _docType || "rechnung", ciphertext, iv, 2);
        } catch (err) { fail.documents++; console.warn("Restore document failed:", err); }
      }

      // 6. Make sure the app loads from the documents schema after restore.
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${pgv(uid)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ docs_migration_version: 1 }),
        });
      } catch (err) { console.warn("Failed to set migration version:", err); }

      const failed = fail.patients + fail.behandlungen + fail.documents;
      showToast(
        failed > 0
          ? `Wiederherstellung mit Fehlern: ${fail.patients} Patient:innen, ${fail.behandlungen} Behandlungen, ${fail.documents} Dokumente konnten NICHT wiederhergestellt werden. Bitte bewahre die Backup-Datei auf. Die Seite wird neu geladen.`
          : "Wiederherstellung erfolgreich. Die Seite wird neu geladen.",
        { error: failed > 0, duration: 6000 }
      );
      // Reload so all in-memory state is re-fetched cleanly from the database.
      setTimeout(() => window.location.reload(), 1600);
    } catch (err) {
      console.error("Import failed:", err);
      showToast("Import fehlgeschlagen: " + (err?.message || err) + ". Bitte bewahre die Backup-Datei auf.", { error: true });
      setImportLoading(false);
    }
  };

  const inputCls2 = "w-full border border-[#DFE3EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition";

  const f = (label, key, ph, required = true) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}{required ? " *" : ""}</label>
      <input
        className={inputCls2}
        value={practice[key]}
        placeholder={ph}
        onChange={(e) => setPractice({ ...practice, [key]: e.target.value })}
      />
    </div>
  );

  if (!show) return null;

  const sectionHeading = (text) => (
    <p className="text-[11px] font-semibold text-gray-800 uppercase tracking-wider mb-4 pb-2 border-b border-[#DFE3EB]">{text}</p>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center overflow-y-auto p-2 sm:p-4">
      {/* Restore confirmation modal (replaces the old browser window.prompt) */}
      {restoreCtx && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4" onClick={() => setRestoreCtx(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.6 14.86A1 1 0 002.54 20h18.92a1 1 0 00.85-1.28l-8.6-14.86a1 1 0 00-1.72 0z" /></svg>
              <h3 className="text-sm font-semibold text-gray-800">Daten wiederherstellen?</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3 leading-relaxed">
              Backup vom {restoreCtx.data._exportDate ? new Date(restoreCtx.data._exportDate).toLocaleString("de-DE") : "?"}: {restoreCtx.data.patients.length} Patient:innen, {restoreCtx.behBackup.length} Behandlungen, {restoreCtx.data.invoices.length} Dokumente.
            </p>
            <p className="text-xs text-red-600 mb-3 leading-relaxed font-medium">
              ACHTUNG: ALLE aktuellen Daten werden gelöscht und durch das Backup ersetzt. Bewahre die Backup-Datei auf, bis Du geprüft hast, dass alles korrekt wiederhergestellt wurde.
            </p>
            <label className="block text-xs text-gray-500 mb-1">Tippe <span className="font-mono font-semibold">{RESTORE_WORD}</span>, um fortzufahren:</label>
            <input autoFocus className="w-full border border-[#DFE3EB] rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-300" value={restoreTyped} onChange={(e) => setRestoreTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && restoreTyped === RESTORE_WORD) performRestore(); }} />
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-1.5 text-xs rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50" onClick={() => setRestoreCtx(null)}>Abbrechen</button>
              <button className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed" disabled={restoreTyped !== RESTORE_WORD} onClick={performRestore}>Daten ersetzen</button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-2xl mx-0 sm:mx-4 my-auto flex flex-col" style={{ maxWidth: 900, width: "100%", maxHeight: "95vh" }}>
        {/* Sticky header */}
        <div className="flex-shrink-0 px-5 sm:px-8 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Praxis-Einstellungen</h3>
              {isFirstTime && (
                <p className="text-xs text-gray-400 mt-1">Trag Deine Praxisdaten ein — Du kannst alles jederzeit wieder hier anpassen.</p>
              )}
            </div>
            {!isFirstTime && <button className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1" onClick={() => setShow(false)}>✕</button>}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6">
          {/* ── Praxisdaten ── */}
          {sectionHeading("Praxisdaten")}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-8">
            {f("Praxisname", "name", "Dr. Muster")}
            <div>
              <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
                Stadt (Behandlungsort) *
                <InfoTooltip>Gib die Stadt ein, in der Du üblicherweise praktizierst. Dieser Ort wird automatisch als Behandlungsort auf neuen Rechnungen vorausgefüllt.</InfoTooltip>
              </label>
              <input className={inputCls2} value={practice.city} placeholder="z.B. Berlin" onChange={(e) => setPractice({ ...practice, city: e.target.value })} />
            </div>
            {f("Adresszeile 1", "address1", "Straße Nr.")}
            {f("Adresszeile 2", "address2", "PLZ Ort")}
            {f("Adresszeile 3 (optional)", "address3", "", false)}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Land</label>
              <input className={inputCls2 + " bg-gray-50 text-gray-400 cursor-not-allowed"} value="Deutschland" disabled />
            </div>
          </div>

          {/* ── Logo ── */}
          <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <label className="block text-xs font-medium text-gray-500 mb-2">Praxis-Logo</label>
            {practice.logo ? (
              <div className="flex items-center gap-4">
                <img src={practice.logo} alt="Logo" style={{ maxHeight: 48, maxWidth: 120, objectFit: "contain" }} className="rounded" />
                <div className="flex flex-col gap-1.5">
                  <button className="text-xs text-red-500 hover:text-red-700 text-left" onClick={() => setPractice({ ...practice, logo: "", logoReplacesName: false })}>Entfernen</button>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-400" checked={!!practice.logoReplacesName} onChange={(e) => setPractice({ ...practice, logoReplacesName: e.target.checked })} />
                    <span className="text-xs text-gray-600">Logo ersetzt Praxisname</span>
                  </label>
                </div>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-blue-600 hover:text-blue-700 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Logo hochladen
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 500 * 1024) { showToast("Logo darf max. 500 KB groß sein.", { error: true }); return; }
                  const reader = new FileReader();
                  reader.onload = () => setPractice({ ...practice, logo: reader.result });
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }} />
              </label>
            )}
          </div>

          {/* ── Kontakt & Bankverbindung ── */}
          {sectionHeading("Kontakt & Bankverbindung")}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-8">
            {f("Telefon", "phone", "")}
            {f("E-Mail", "email", "")}
            {f("Bankname", "bankName", "")}
            {f("IBAN", "iban", "")}
            {f("BIC", "bic", "")}
            {f("Steuernummer (optional)", "steuernummer", "z.B. 123/456/78901", false)}
            {f("PayPal", "paypal", "name@email.de", false)}
          </div>

          {/* ── Rechnungseinstellungen ── */}
          {sectionHeading("Rechnungseinstellungen")}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-8">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition sm:col-span-2">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400 mt-0.5" checked={practice.kleinunternehmer} onChange={(e) => setPractice({ ...practice, kleinunternehmer: e.target.checked })} />
              <div>
                <span className="text-sm text-gray-700">MwSt.-befreit (Kleinunternehmer&shy;regelung §19 UStG)</span>
                <p className="text-[10px] text-gray-400 mt-0.5">Keine Umsatzsteuer auf Rechnungen ausweisen</p>
              </div>
            </label>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Standard-Zahlungsfrist (Tage)</label>
              <input type="number" min="0" className={inputCls2} value={practice.zahlungsfrist ?? 14} placeholder="14" onChange={(e) => setPractice({ ...practice, zahlungsfrist: e.target.value === "" ? "" : parseInt(e.target.value, 10) || 0 })} />
              <p className="text-[10px] text-gray-400 mt-1">Wird automatisch auf neuen Rechnungen eingesetzt</p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition sm:col-span-2">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400 mt-0.5" checked={practice.showBankOnInvoice !== false} onChange={(e) => setPractice({ ...practice, showBankOnInvoice: e.target.checked })} />
              <div>
                <span className="text-sm text-gray-700">Bankverbindung in der Rechnungs-Fußzeile anzeigen</span>
                <p className="text-[10px] text-gray-400 mt-0.5">Auf Rechnungen, die als bezahlt markiert sind, wird die Bankverbindung immer ausgeblendet und stattdessen „Betrag dankend erhalten" ausgewiesen</p>
              </div>
            </label>
          </div>

          {/* ── Gespeicherte Präparate ── */}
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#DFE3EB]">
            <p className="text-[11px] font-semibold text-gray-800 uppercase tracking-wider">Gespeicherte Präparate</p>
            <InfoTooltip>{"Den Preis pro Einheit berechnest Du, indem Du den Einkaufspreis der Phiole durch die Anzahl der enthaltenen Einheiten teilst.\n\nBeispiel: Kostet eine Phiole mit 100 SE insgesamt 50 €, liegt der Preis pro SE bei 0,50 €."}</InfoTooltip>
          </div>
          <div className="mb-8">
            <p className="text-[10px] text-gray-400 mb-4">Definiere Deine häufig verwendeten Präparate. Beim Erstellen einer Rechnung kannst Du sie mit einem Klick auswählen.</p>
            {(practice.praeparate || []).map((p, idx) => (
              <div key={idx} className="flex items-center gap-3 mb-2">
                <input className={inputCls2 + " flex-1"} value={p.name} placeholder="z.B. Relfydess" onChange={(e) => { const arr = [...(practice.praeparate || [])]; arr[idx] = { ...arr[idx], name: e.target.value }; setPractice({ ...practice, praeparate: arr }); }} />
                <select className={inputCls2 + " w-20"} value={p.einheit || "ml"} onChange={(e) => { const arr = [...(practice.praeparate || [])]; arr[idx] = { ...arr[idx], einheit: e.target.value }; setPractice({ ...practice, praeparate: arr }); }}>
                  <option value="ml">ml</option>
                  <option value="SE">SE</option>
                  <option value="IE">IE</option>
                </select>
                <div className="relative">
                  <input className={inputCls2 + " w-28 pr-8"} type="text" inputMode="decimal" value={p.preisStr ?? ""} placeholder="0,00" onChange={(e) => { const v = e.target.value.replace(/[^\d,.\- ]/g, ""); const arr = [...(practice.praeparate || [])]; arr[idx] = { ...arr[idx], preisStr: v }; setPractice({ ...practice, praeparate: arr }); }} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                </div>
                <button className="p-1.5 text-gray-400 hover:text-red-500 transition flex-shrink-0" onClick={() => { const arr = [...(practice.praeparate || [])]; arr.splice(idx, 1); setPractice({ ...practice, praeparate: arr }); }} title="Entfernen">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            <button
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium mt-2 transition"
              onClick={() => setPractice({ ...practice, praeparate: [...(practice.praeparate || []), { name: "", einheit: "ml", preisStr: "" }] })}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Präparat hinzufügen
            </button>
          </div>

          {/* ── Sicherheit ── */}
          {sectionHeading("Sicherheit")}
          <div className="space-y-4 mb-8">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400 mt-0.5" checked={practice.autoLogoutEnabled !== false} onChange={(e) => setPractice({ ...practice, autoLogoutEnabled: e.target.checked })} />
              <div>
                <span className="text-sm text-gray-700">Automatischer Logout nach 15 Min. Inaktivität</span>
                <p className="text-[10px] text-gray-400 mt-0.5">Empfohlen zum Schutz von Patient:innendaten</p>
              </div>
            </label>
            {practice.autoLogoutEnabled === false && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <strong>Achtung:</strong> Ohne Auto-Logout bist Du selbst dafür verantwortlich, dass keine unbefugten Personen Zugriff erhalten.
              </p>
            )}
            <div className="p-3 rounded-lg border border-gray-100">
              <label className="block text-sm text-gray-700 mb-0.5">Praxis-PIN für den Aufklärungsbogen</label>
              <p className="text-[10px] text-gray-400 mb-2">Mit gesetzter PIN können Patient:innen den Aufklärungsbogen (z.B. auf dem Tablet im Wartezimmer) nicht selbst schließen — das Verlassen des Bogens erfordert die PIN. Leer lassen zum Deaktivieren.</p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                className={inputCls2 + " max-w-[10rem]"}
                placeholder="4–6 Ziffern"
                value={practice.kioskPin || ""}
                onChange={(e) => setPractice({ ...practice, kioskPin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              />
              {practice.kioskPin && practice.kioskPin.length < 4 && (
                <p className="text-[10px] text-red-500 mt-1">Die PIN muss mindestens 4 Ziffern haben — kürzere PINs werden nicht aktiv.</p>
              )}
            </div>
            {!isFirstTime && session && (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-xs font-medium text-gray-600 mb-3">Passwort ändern</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input type="password" className={inputCls2} placeholder="Aktuelles Passwort" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} />
                  <input type="password" className={inputCls2} placeholder="Neues Passwort" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
                  <input type="password" className={`${inputCls2} ${pwNew && pwConfirm && pwNew !== pwConfirm ? "!border-red-300 !ring-red-400" : ""}`} placeholder="Bestätigen" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
                </div>
                {pwMsg && (
                  <p className={`text-xs mt-2 ${pwMsg.type === "error" ? "text-red-500" : "text-green-600"}`}>{pwMsg.text}</p>
                )}
                <button
                  className="mt-3 px-4 py-2 text-xs rounded-lg border border-[#DFE3EB] text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                  disabled={pwLoading || !pwCurrent || !pwNew || pwNew !== pwConfirm}
                  onClick={handleChangePassword}
                >
                  {pwLoading ? "Wird geändert..." : "Passwort ändern"}
                </button>
              </div>
            )}
          </div>

          {/* ── Daten ── */}
          {!isFirstTime && session && (
            <>
              {sectionHeading("Daten")}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-xs font-medium text-gray-600 mb-1">Export</p>
                  <p className="text-[10px] text-gray-400 mb-3">Alle Daten als JSON-Datei herunterladen.</p>
                  <button
                    className="px-3 py-2 text-xs rounded-lg border border-[#DFE3EB] text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition"
                    disabled={exportLoading}
                    onClick={handleExportData}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    {exportLoading ? "Exportiert..." : "Alle Daten exportieren"}
                  </button>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-xs font-medium text-gray-600 mb-1">Import</p>
                  <p className="text-[10px] text-gray-400 mb-3">Daten aus Backup wiederherstellen. Alle vorhandenen Daten werden ersetzt.</p>
                  <input ref={importFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportData} />
                  <button
                    className="px-3 py-2 text-xs rounded-lg border border-[#DFE3EB] text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition"
                    disabled={importLoading}
                    onClick={() => importFileRef.current?.click()}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m4-8l-4-4m0 0l-4 4m4-4v12" /></svg>
                    {importLoading ? "Wird wiederhergestellt..." : "Backup wiederherstellen"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sticky footer */}
        <div className={`flex-shrink-0 px-5 sm:px-8 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl ${isFirstTime ? "flex justify-end" : "flex justify-between"}`}>
          {!isFirstTime && (
            <button className="px-4 py-2 text-sm rounded-lg border border-[#DFE3EB] text-gray-600 hover:bg-white transition" onClick={() => setShow(false)}>
              Abbrechen
            </button>
          )}
          <button className="px-5 py-2 text-sm rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition" onClick={() => { onSave(); setShow(false); }}>
            {isFirstTime ? "Speichern und loslegen" : "Speichern und schließen"}
          </button>
        </div>
      </div>
    </div>
  );
}

