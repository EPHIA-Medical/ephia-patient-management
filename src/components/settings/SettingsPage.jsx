import React, { useMemo, useState, useEffect } from "react";
import InfoTooltip from "../ui/InfoTooltip";
import Spinner from "../ui/Spinner";
import ConsentTemplateEditor from "./ConsentTemplateEditor";
import { SUPABASE_URL, SUPABASE_ANON_KEY, pgv } from "../../lib/supabase/client";
import { computePatientHash, getPatientIdentifier, encryptData, derivePDK, generateSalt, wrapMEK } from "../../lib/crypto";
import { supabaseUpdateProfile } from "../../lib/supabase/profiles";
import { supabaseDeletePatient } from "../../lib/supabase/patients";
import { supabaseCreateBehandlung, supabaseDeleteBehandlung } from "../../lib/supabase/behandlungen";
import { supabaseCreateDocument, supabaseDeleteDocument } from "../../lib/supabase/documents";
import { showToast } from "../../utils/toast";
import { CONSENT_TEMPLATES } from "../consent/consentTemplates";
import { SPRITZEN_GROESSEN } from "../../constants";
import { autoLogoutMinutes, AUTO_LOGOUT_MIN_MINUTES, AUTO_LOGOUT_MAX_MINUTES } from "../../constants";
import Select from "../ui/Select";
import {
  getAvailableConsentTemplates, getPracticeTemplates, isBuiltinTemplate, consentTemplateLabel,
  copyTemplateForPractice, emptyPracticeTemplate, finalizePracticeTemplates, validatePracticeTemplate,
} from "../consent/consentTemplateStore";

const RESTORE_WORD = "ERSETZEN";

export const SETTINGS_SECTIONS = [
  { id: "praxis", label: "Praxisdaten", desc: "Name, Adresse und Logo, wie sie auf Deinen Dokumenten erscheinen." },
  { id: "kontakt", label: "Kontakt & Bank", desc: "Kontaktdaten und Bankverbindung für Rechnungen." },
  { id: "rechnungen", label: "Rechnungen", desc: "Umsatzsteuer, Zahlungsfrist und Fußzeile Deiner Rechnungen." },
  { id: "praeparate", label: "Präparate", desc: "Häufig verwendete Präparate mit Art, Einheit und Preis." },
  { id: "aufklaerung", label: "Aufklärungsbögen", desc: "Die Bögen, die Patient:innen vor der Behandlung lesen, beantworten und unterschreiben." },
  { id: "sicherheit", label: "Sicherheit", desc: "Automatischer Logout, Praxis-PIN und Passwort." },
  { id: "daten", label: "Daten & Backup", desc: "Alle Daten exportieren oder aus einem Backup wiederherstellen.", needsAccount: true },
];

const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

// ═══════════════════ Praxiseinstellungen (page) ═══════════════════
//
// `practice` is the saved state, `draft` the edited copy (lifted into App so it
// survives leaving the page). Nothing is stored until "Speichern".

export default function SettingsPage({ practice, setPractice, draft, setDraft, dirty, onSave, onDiscard, section, templateId, onNavigate, isFirstTime, session, currentMEK, userId, patients, invoices, behandlungen, avvAcceptance, agbAcceptance }) {
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
          throw new Error("Passwort geändert, aber die Verschlüsselung konnte nicht aktualisiert werden. Bitte melde Dich neu an. Falls Deine Daten dann nicht entschlüsselt werden, wende Dich an customerlove@ephia.de.");
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

  const [saving, setSaving] = useState(false);
  const [confirmRemoveTpl, setConfirmRemoveTpl] = useState(null);

  const sections = SETTINGS_SECTIONS.filter((s) => !(s.needsAccount && (isFirstTime || !session)));
  const active = sections.find((s) => s.id === section) || sections[0];

  useEffect(() => { window.scrollTo({ top: 0 }); }, [active.id, templateId]);

  const inputCls2 = "w-full border border-[#DFE3EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition";
  const set = (patch) => setDraft({ ...draft, ...patch });

  const f = (label, key, ph, required = true) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}{required ? " *" : ""}</label>
      <input className={inputCls2} value={draft[key] ?? ""} placeholder={ph} onChange={(e) => set({ [key]: e.target.value })} />
    </div>
  );

  // ── Aufklärungsbögen ──
  const ownTemplates = getPracticeTemplates(draft);
  const availableTemplates = useMemo(() => getAvailableConsentTemplates(draft), [draft]);
  const setOwnTemplates = (list) => set({ consentTemplates: list });
  const editingTemplate = templateId ? (ownTemplates.find((t) => t.id === templateId) || CONSENT_TEMPLATES.find((t) => t.id === templateId) || null) : null;

  const adaptTemplate = (source, asAdaptation = true) => {
    const copy = copyTemplateForPractice(source, { asAdaptation });
    setOwnTemplates([...ownTemplates, copy]);
    onNavigate(`/einstellungen/aufklaerung/${copy.id}`);
  };
  const createTemplate = () => {
    const tpl = emptyPracticeTemplate();
    setOwnTemplates([...ownTemplates, tpl]);
    onNavigate(`/einstellungen/aufklaerung/${tpl.id}`);
  };
  const updateTemplate = (next) => setOwnTemplates(ownTemplates.map((t) => (t.id === next.id ? next : t)));
  const removeTemplate = (tpl) => {
    setOwnTemplates(ownTemplates.filter((t) => t.id !== tpl.id));
    setConfirmRemoveTpl(null);
    if (templateId === tpl.id) onNavigate("/einstellungen/aufklaerung");
  };

  const handleSave = async () => {
    for (const tpl of ownTemplates) {
      const err = validatePracticeTemplate(tpl);
      if (err) {
        showToast(`${consentTemplateLabel(tpl) || "Aufklärungsbogen"}: ${err}`, { error: true });
        onNavigate(`/einstellungen/aufklaerung/${tpl.id}`);
        return;
      }
    }
    const next = { ...draft, autoLogoutMinutes: autoLogoutMinutes(draft) };
    if (Array.isArray(draft.consentTemplates)) next.consentTemplates = finalizePracticeTemplates(draft.consentTemplates, getPracticeTemplates(practice));
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); }
  };

  const savedTemplate = (id) => getPracticeTemplates(practice).find((t) => t.id === id);

  // ═══ Section renderers ═══
  const renderPraxis = () => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-8">
        {f("Praxisname", "name", "Dr. Muster")}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
            Stadt (Behandlungsort) *
            <InfoTooltip>Gib die Stadt ein, in der Du üblicherweise praktizierst. Dieser Ort wird automatisch als Behandlungsort auf neuen Rechnungen vorausgefüllt.</InfoTooltip>
          </label>
          <input className={inputCls2} value={draft.city ?? ""} placeholder="z.B. Berlin" onChange={(e) => set({ city: e.target.value })} />
        </div>
        {f("Adresszeile 1", "address1", "Straße Nr.")}
        {f("Adresszeile 2", "address2", "PLZ Ort")}
        {f("Adresszeile 3 (optional)", "address3", "", false)}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Land</label>
          <input className={inputCls2 + " bg-gray-50 text-gray-400 cursor-not-allowed"} value="Deutschland" disabled />
        </div>
      </div>
      <div className="p-4 bg-gray-50 rounded-lg">
        <label className="block text-xs font-medium text-gray-500 mb-2">Praxis-Logo</label>
        {draft.logo ? (
          <div className="flex items-center gap-4">
            <img src={draft.logo} alt="Logo" style={{ maxHeight: 48, maxWidth: 120, objectFit: "contain" }} className="rounded" />
            <div className="flex flex-col gap-1.5">
              <button className="text-xs text-red-500 hover:text-red-700 text-left" onClick={() => set({ logo: "", logoReplacesName: false })}>Entfernen</button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-400" checked={!!draft.logoReplacesName} onChange={(e) => set({ logoReplacesName: e.target.checked })} />
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
              reader.onload = () => setDraft((d) => ({ ...d, logo: reader.result }));
              reader.readAsDataURL(file);
              e.target.value = "";
            }} />
          </label>
        )}
      </div>
    </>
  );

  const renderKontakt = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
      {f("Telefon", "phone", "")}
      {f("E-Mail", "email", "")}
      {f("Bankname", "bankName", "")}
      {f("IBAN", "iban", "")}
      {f("BIC", "bic", "")}
      {f("Steuernummer (optional)", "steuernummer", "z.B. 123/456/78901", false)}
      {f("PayPal", "paypal", "name@email.de", false)}
    </div>
  );

  const renderRechnungen = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
      <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition sm:col-span-2">
        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400 mt-0.5" checked={!!draft.kleinunternehmer} onChange={(e) => set({ kleinunternehmer: e.target.checked })} />
        <div>
          <span className="text-sm text-gray-700">MwSt.-befreit (Kleinunternehmer&shy;regelung §19 UStG)</span>
          <p className="text-xs text-gray-400 mt-0.5">Keine Umsatzsteuer auf Rechnungen ausweisen</p>
        </div>
      </label>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Standard-Zahlungsfrist (Tage)</label>
        <input type="number" min="0" className={inputCls2} value={draft.zahlungsfrist ?? 14} placeholder="14" onChange={(e) => set({ zahlungsfrist: e.target.value === "" ? "" : parseInt(e.target.value, 10) || 0 })} />
        <p className="text-xs text-gray-400 mt-1">Wird automatisch auf neuen Rechnungen eingesetzt</p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition sm:col-span-2">
        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400 mt-0.5" checked={draft.showBankOnInvoice !== false} onChange={(e) => set({ showBankOnInvoice: e.target.checked })} />
        <div>
          <span className="text-sm text-gray-700">Bankverbindung in der Rechnungs-Fußzeile anzeigen</span>
          <p className="text-xs text-gray-400 mt-0.5">Auf Rechnungen, die als bezahlt markiert sind, wird die Bankverbindung immer ausgeblendet und stattdessen „Betrag dankend erhalten" ausgewiesen</p>
        </div>
      </label>
    </div>
  );

  const renderPraeparate = () => {
    const list = draft.praeparate || [];
    const upd = (idx, patch) => { const arr = [...list]; arr[idx] = { ...arr[idx], ...patch }; set({ praeparate: arr }); };
    return (
      <div>
        <p className="text-xs text-gray-400 mb-4 flex items-center gap-1">
          Beim Erstellen einer Rechnung kannst Du sie mit einem Klick auswählen.
          <InfoTooltip>{"Botulinum: Den Preis pro Einheit berechnest Du, indem Du den Einkaufspreis der Phiole durch die Anzahl der enthaltenen Einheiten teilst. Beispiel: Kostet eine Phiole mit 100 SE insgesamt 50 €, liegt der Preis pro SE bei 0,50 €.\n\nDermalfiller: Preis pro Spritze (Einkaufspreis). Eine angebrochene Spritze darf nicht bei einer anderen Person verwendet werden, deshalb wird immer die ganze Spritze berechnet."}</InfoTooltip>
        </p>
        {list.length === 0 && <p className="text-sm text-gray-400 mb-3">Noch keine Präparate gespeichert.</p>}
        {list.map((p, idx) => (
          <div key={idx} className="flex items-center gap-2 sm:gap-3 mb-2">
            <Select className={inputCls2 + " !w-28 sm:!w-32"} value={p.typ || "botox"} onChange={(e) => { const typ = e.target.value; upd(idx, { typ, ...(typ === "filler" ? { einheit: "Spritze", spritzenGroesse: p.spritzenGroesse || "1 ml" } : typ === "hyaluronidase" ? { einheit: "IE" } : p.einheit === "Spritze" ? { einheit: "SE" } : {}) }); }}>
              <option value="botox">Botulinum</option>
              <option value="filler">Dermalfiller</option>
              <option value="hyaluronidase">Hyaluronidase</option>
            </Select>
            <input className={inputCls2 + " flex-1 min-w-0"} value={p.name} placeholder={p.typ === "filler" ? "z.B. Juvéderm Volift" : p.typ === "hyaluronidase" ? "z.B. Hylase Dessau" : "z.B. Relfydess"} onChange={(e) => upd(idx, { name: e.target.value })} />
            {p.typ === "filler" ? (
              <Select className={inputCls2 + " !w-24"} value={p.spritzenGroesse || "1 ml"} onChange={(e) => upd(idx, { spritzenGroesse: e.target.value })}>
                {SPRITZEN_GROESSEN.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            ) : (
              <Select className={inputCls2 + " !w-24"} value={p.einheit || "ml"} onChange={(e) => upd(idx, { einheit: e.target.value })}>
                <option value="ml">ml</option>
                <option value="SE">SE</option>
                <option value="IE">IE</option>
              </Select>
            )}
            <div className="relative">
              <input className={inputCls2 + " !w-24 sm:!w-28 pr-8"} type="text" inputMode="decimal" value={p.preisStr ?? ""} placeholder="0,00" onChange={(e) => upd(idx, { preisStr: e.target.value.replace(/[^\d,.\- ]/g, "") })} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
            </div>
            <button className="p-1.5 text-gray-400 hover:text-red-500 transition flex-shrink-0" onClick={() => set({ praeparate: list.filter((_, k) => k !== idx) })} title="Entfernen">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-2 transition" onClick={() => set({ praeparate: [...list, { name: "", einheit: "ml", preisStr: "" }] })}>
          + Präparat hinzufügen
        </button>
      </div>
    );
  };

  const renderTemplateList = () => (
    <div>
      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-3 mb-6 leading-relaxed">
        Bereits unterschriebene Bögen behalten immer den Text, den Patient:innen unterschrieben haben. Änderungen gelten nur für neue Bögen. Für den Inhalt angepasster Bögen bist Du als behandelnde Ärzt:in verantwortlich.
      </div>
      <div className="space-y-3">
        {availableTemplates.map((tpl) => {
          const builtin = isBuiltinTemplate(tpl);
          const saved = !builtin && savedTemplate(tpl.id);
          return (
            <div key={tpl.id} className="rounded-lg bg-gray-50 px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{consentTemplateLabel(tpl) || "Ohne Namen"}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${builtin ? "bg-white text-gray-500" : "bg-blue-50 text-blue-600"}`}>
                    {builtin ? "EPHIA-Vorlage" : tpl.basedOn ? "Angepasst" : "Eigener Bogen"}
                  </span>
                  {!builtin && !saved && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">Nicht gespeichert</span>}
                </div>
                <div className="text-xs text-gray-400 mt-1 truncate">
                  {tpl.name}{builtin ? ` · Version ${tpl.version}` : saved ? ` · Version ${saved.version}, geändert am ${fmtDateTime(saved.updatedAt)}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {builtin ? (
                  <>
                    <button className="px-3 py-1.5 text-xs rounded-lg text-gray-600 hover:bg-white transition" onClick={() => onNavigate(`/einstellungen/aufklaerung/${tpl.id}`)}>Ansehen</button>
                    <button className="px-3 py-1.5 text-xs rounded-lg bg-white text-gray-800 font-medium hover:bg-gray-100 transition" onClick={() => adaptTemplate(tpl)}>Anpassen</button>
                  </>
                ) : (
                  <>
                    <button className="px-3 py-1.5 text-xs rounded-lg text-gray-600 hover:bg-white transition" onClick={() => adaptTemplate(tpl, false)}>Duplizieren</button>
                    <button className="px-3 py-1.5 text-xs rounded-lg text-gray-600 hover:bg-white hover:text-red-600 transition" onClick={() => setConfirmRemoveTpl(tpl)}>{tpl.basedOn ? "Zurücksetzen" : "Löschen"}</button>
                    <button className="px-3 py-1.5 text-xs rounded-lg bg-white text-gray-800 font-medium hover:bg-gray-100 transition" onClick={() => onNavigate(`/einstellungen/aufklaerung/${tpl.id}`)}>Bearbeiten</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium transition" onClick={createTemplate}>+ Neuer Aufklärungsbogen</button>
    </div>
  );

  const renderTemplateEditor = () => {
    if (!editingTemplate) {
      return (
        <div className="text-sm text-gray-500">
          Dieser Aufklärungsbogen existiert nicht (mehr).{" "}
          <button className="text-blue-600 hover:text-blue-700" onClick={() => onNavigate("/einstellungen/aufklaerung")}>Zur Übersicht</button>
        </div>
      );
    }
    const builtin = isBuiltinTemplate(editingTemplate);
    return (
      <div>
        {builtin && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 mb-6">
            <p className="text-xs text-gray-500 flex-1">Die EPHIA-Vorlage kann nicht direkt geändert werden. Mit „Anpassen“ legst Du eine eigene Fassung an, die die Vorlage in Deiner Praxis ersetzt.</p>
            <button className="px-3 py-1.5 text-xs rounded-lg bg-white text-gray-800 font-medium hover:bg-gray-100 transition flex-shrink-0" onClick={() => adaptTemplate(editingTemplate)}>Anpassen</button>
          </div>
        )}
        <ConsentTemplateEditor template={editingTemplate} readOnly={builtin} onChange={updateTemplate} />
      </div>
    );
  };

  const renderSicherheit = () => (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-gray-50">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400 mt-0.5" checked={draft.autoLogoutEnabled !== false} onChange={(e) => set({ autoLogoutEnabled: e.target.checked })} />
          <div>
            <span className="text-sm text-gray-700">Automatischer Logout bei Inaktivität</span>
            <p className="text-xs text-gray-400 mt-0.5">Empfohlen zum Schutz von Patient:innendaten</p>
          </div>
        </label>
        {draft.autoLogoutEnabled !== false && (
          <div className="mt-3 ml-7">
            <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="auto-logout-minutes">Abmelden nach</label>
            <div className="flex items-center gap-2">
              <input
                id="auto-logout-minutes"
                type="number"
                inputMode="numeric"
                min={AUTO_LOGOUT_MIN_MINUTES}
                max={AUTO_LOGOUT_MAX_MINUTES}
                className={inputCls2 + " !w-24 bg-white"}
                value={draft.autoLogoutMinutes ?? 15}
                onChange={(e) => set({ autoLogoutMinutes: e.target.value === "" ? "" : parseInt(e.target.value, 10) })}
                onBlur={() => set({ autoLogoutMinutes: autoLogoutMinutes(draft) })}
              />
              <span className="text-sm text-gray-600">Minuten ohne Aktivität</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Zwischen {AUTO_LOGOUT_MIN_MINUTES} und {AUTO_LOGOUT_MAX_MINUTES} Minuten.
              {autoLogoutMinutes(draft) > 30 && <span className="text-amber-700"> Längere Zeiten erhöhen das Risiko, dass Unbefugte an einem offenen Gerät Patient:innendaten sehen.</span>}
            </p>
          </div>
        )}
      </div>
      {draft.autoLogoutEnabled === false && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          <strong>Achtung:</strong> Ohne Auto-Logout bist Du selbst dafür verantwortlich, dass keine unbefugten Personen Zugriff erhalten.
        </p>
      )}
      <div className="p-3 rounded-lg bg-gray-50">
        <label className="block text-sm text-gray-700 mb-0.5">Praxis-PIN für den Aufklärungsbogen</label>
        <p className="text-xs text-gray-400 mb-2">Mit gesetzter PIN können Patient:innen den Aufklärungsbogen (z.B. auf dem Tablet im Wartezimmer) nicht selbst schließen. Das Verlassen des Bogens erfordert die PIN. Leer lassen zum Deaktivieren.</p>
        <input type="text" inputMode="numeric" autoComplete="off" maxLength={6} className={inputCls2 + " max-w-[10rem] bg-white"} placeholder="4–6 Ziffern" value={draft.kioskPin || ""} onChange={(e) => set({ kioskPin: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
        {draft.kioskPin && draft.kioskPin.length < 4 && (
          <p className="text-xs text-red-500 mt-1">Die PIN muss mindestens 4 Ziffern haben. Kürzere PINs werden nicht aktiv.</p>
        )}
      </div>
      {!isFirstTime && session && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700 mb-1">Auftragsverarbeitungsvertrag</p>
          <p className="text-xs text-gray-400 mb-2">
            {avvAcceptance
              ? `Abgeschlossen am ${new Date(avvAcceptance.accepted_at).toLocaleDateString("de-DE")} (Version ${avvAcceptance.version}).`
              : "Noch nicht abgeschlossen."}
          </p>
          <button className="text-xs text-blue-600 hover:text-blue-700 font-medium" onClick={() => onNavigate("/avv")}>Vertrag anzeigen und als PDF speichern</button>
        </div>
      )}
      {!isFirstTime && session && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700 mb-1">Allgemeine Geschäftsbedingungen</p>
          <p className="text-xs text-gray-400 mb-2">
            {agbAcceptance
              ? `Bestätigt am ${new Date(agbAcceptance.accepted_at).toLocaleDateString("de-DE")} (Version ${agbAcceptance.version}).`
              : "Noch nicht bestätigt."}
          </p>
          <button className="text-xs text-blue-600 hover:text-blue-700 font-medium" onClick={() => onNavigate("/agb")}>AGB anzeigen und als PDF speichern</button>
        </div>
      )}
      {!isFirstTime && session && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700 mb-1">Passwort ändern</p>
          <p className="text-xs text-gray-400 mb-3">Wird sofort geändert, unabhängig vom Speichern der übrigen Einstellungen.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="password" className={inputCls2 + " bg-white"} placeholder="Aktuelles Passwort" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} />
            <input type="password" className={inputCls2 + " bg-white"} placeholder="Neues Passwort" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
            <input type="password" className={`${inputCls2} bg-white ${pwNew && pwConfirm && pwNew !== pwConfirm ? "!border-red-300 !ring-red-400" : ""}`} placeholder="Bestätigen" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
          </div>
          {pwMsg && <p className={`text-xs mt-2 ${pwMsg.type === "error" ? "text-red-500" : "text-green-600"}`}>{pwMsg.text}</p>}
          <button className="mt-3 px-4 py-2 text-xs rounded-lg bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition" disabled={pwLoading || !pwCurrent || !pwNew || pwNew !== pwConfirm} onClick={handleChangePassword}>
            {pwLoading ? "Wird geändert..." : "Passwort ändern"}
          </button>
        </div>
      )}
    </div>
  );

  const renderDaten = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-700 mb-1">Export</p>
        <p className="text-xs text-gray-400 mb-3">Alle Daten als JSON-Datei herunterladen.</p>
        <button className="px-3 py-2 text-xs rounded-lg bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition" disabled={exportLoading} onClick={handleExportData}>
          {exportLoading ? "Exportiert..." : "Alle Daten exportieren"}
        </button>
      </div>
      <div className="p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-700 mb-1">Import</p>
        <p className="text-xs text-gray-400 mb-3">Daten aus Backup wiederherstellen. Alle vorhandenen Daten werden ersetzt.</p>
        <input ref={importFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportData} />
        <button className="px-3 py-2 text-xs rounded-lg bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition" disabled={importLoading} onClick={() => importFileRef.current?.click()}>
          {importLoading ? "Wird wiederhergestellt..." : "Backup wiederherstellen"}
        </button>
      </div>
    </div>
  );

  const renderers = {
    praxis: renderPraxis, kontakt: renderKontakt, rechnungen: renderRechnungen, praeparate: renderPraeparate,
    aufklaerung: () => (templateId ? renderTemplateEditor() : renderTemplateList()),
    sicherheit: renderSicherheit, daten: renderDaten,
  };

  const inTemplateEditor = active.id === "aufklaerung" && templateId;
  const heading = inTemplateEditor ? (consentTemplateLabel(editingTemplate) || "Neuer Aufklärungsbogen") : active.label;
  const showSaveBar = dirty || isFirstTime;

  return (
    <div>
      {/* Restore confirmation modal */}
      {restoreCtx && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4" onClick={() => setRestoreCtx(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Daten wiederherstellen?</h3>
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

      {/* Remove / reset template confirmation */}
      {confirmRemoveTpl && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4" onClick={() => setConfirmRemoveTpl(null)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">
              {confirmRemoveTpl.basedOn ? "Auf EPHIA-Vorlage zurücksetzen?" : `„${consentTemplateLabel(confirmRemoveTpl) || "Aufklärungsbogen"}“ löschen?`}
            </h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              {confirmRemoveTpl.basedOn
                ? "Deine angepasste Fassung wird entfernt, neue Bögen nutzen wieder die EPHIA-Vorlage."
                : "Der Bogen steht für neue Aufklärungen nicht mehr zur Verfügung."}{" "}
              Bereits unterschriebene Bögen bleiben unverändert. Wirksam wird das erst mit „Speichern“.
            </p>
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-1.5 text-xs rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50" onClick={() => setConfirmRemoveTpl(null)}>Abbrechen</button>
              <button className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700" onClick={() => removeTemplate(confirmRemoveTpl)}>{confirmRemoveTpl.basedOn ? "Zurücksetzen" : "Löschen"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Praxiseinstellungen</h1>
        {isFirstTime && <p className="text-sm text-gray-500 mt-1">Trag Deine Praxisdaten ein. Du kannst alles jederzeit wieder anpassen.</p>}
      </div>

      <div className="flex flex-col lg:flex-row gap-5 lg:gap-8 items-start">
        {/* ── Section menu ── */}
        <nav className="w-full lg:w-56 flex-shrink-0 lg:sticky lg:top-20">
          <div className="flex lg:flex-col gap-1 overflow-x-auto hide-scrollbar -mx-3 px-3 lg:mx-0 lg:px-0">
            {sections.map((s) => {
              const isActive = s.id === active.id;
              return (
                <button
                  key={s.id}
                  className={`text-sm text-left whitespace-nowrap px-3 py-2 rounded-lg transition flex-shrink-0 ${isActive ? "bg-white text-gray-900 font-medium shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-white/60"}`}
                  onClick={() => onNavigate(`/einstellungen/${s.id}`)}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── Content ── */}
        <div className="w-full flex-1 min-w-0">
          <div className="bg-white rounded-lg border border-[#DFE3EB] shadow-sm">
            <div className="px-5 sm:px-8 pt-6 pb-5 border-b border-gray-100">
              {inTemplateEditor && (
                <button className="text-xs text-gray-400 hover:text-gray-600 transition mb-2" onClick={() => onNavigate("/einstellungen/aufklaerung")}>&larr; Alle Aufklärungsbögen</button>
              )}
              <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
              {!inTemplateEditor && <p className="text-xs text-gray-400 mt-1">{active.desc}</p>}
            </div>
            <div className="px-5 sm:px-8 py-6">
              {renderers[active.id]()}
            </div>
          </div>

          {/* Save bar: sticks to the bottom while there are unsaved changes */}
          {showSaveBar && (
            <div className="sticky bottom-0 z-20 mt-4 pb-4">
              <div className="bg-gray-900 text-white rounded-lg shadow-lg px-4 sm:px-5 py-3 flex items-center gap-3">
                <span className="text-sm flex-1">{isFirstTime && !dirty ? "Speichere Deine Praxisdaten, um loszulegen." : "Du hast ungespeicherte Änderungen."}</span>
                {!isFirstTime && (
                  <button className="px-3 py-1.5 text-sm rounded-lg text-gray-300 hover:text-white transition disabled:opacity-50" disabled={saving} onClick={onDiscard}>Verwerfen</button>
                )}
                <button className="px-4 py-1.5 text-sm rounded-lg bg-white text-gray-900 font-medium hover:bg-gray-100 transition inline-flex items-center gap-1.5 disabled:opacity-70" disabled={saving} onClick={handleSave}>
                  {saving && <Spinner className="h-3.5 w-3.5" />}
                  {isFirstTime ? "Speichern und loslegen" : "Speichern"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
