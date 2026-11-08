import { showToast } from "../../utils/toast";
import React, { useState, useRef, useEffect } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import SendToPatientDialog from "../invoice/SendToPatientDialog";
import { treatmentCopySources } from "../../utils/copySources";
import { fmtDate } from "../../utils/helpers";
import { resolveConsentTemplate } from "../consent/consentTemplateStore";
import { FACE_IMAGE_B64 } from "../../constants";
import TreatmentDocPreview from "./TreatmentDocumentPreview";
import PatientLeftSidebar from "./PatientLeftSidebar";
import PatientTimeline from "./PatientTimeline";
import BehandlungDetailPanel from "./BehandlungDetailPanel";
import BehandlungAddPanel from "./BehandlungAddPanel";
import PatientBehandlungenSidebar from "./PatientBehandlungenSidebar";
import NoteEditor from "./NoteEditor";
import PatientInvoicesTab from "./PatientInvoicesTab";
import Modal from "../ui/Modal";
import Spinner from "../ui/Spinner";
import { emptyPraeparat } from "../../utils/praeparate";

// ═══════════════════ Patient Detail View ═══════════════════

export default function PatientDetailView({ accessToken, patient, invoices, behandlungen = [], docsMigrated, kleinunternehmer, practice, onBack, onView, onViewHV, onDownload, onDownloadHV, onPrint, onPrintHV, onDelete, onUpdateInvoice, onUpdatePatient, onCreateInvoice, onQuickInvoice, onNewHV, onStartConsent, onViewConsent, onDownloadConsent, onCreateBehandlung, onUpdateBehandlung, onDeleteBehandlung, onLinkDocToBehandlung, onSetPaymentStatus, onStartHvFromValues, activityLog = [], onLogActivity }) {
  // ── Derived data ──
  const rawData = (patient._raw && typeof patient._raw.data === "object" && patient._raw.data) ? patient._raw.data : {};
  const email = (rawData.email || patient.email || "").toLowerCase();
  const patientDbId = patient._raw ? patient._raw.id : patient.id;

  // ── Shared state ──
  const [confirmDeleteTreatment, setConfirmDeleteTreatment] = useState(null);
  const [confirmDeleteBeh, setConfirmDeleteBeh] = useState(null);
  const [behDeleting, setBehDeleting] = useState(null); // "keep" | "all" while the delete runs
  const [editingTreatmentInv, setEditingTreatmentInv] = useState(null);
  const [viewingTreatment, setViewingTreatment] = useState(null);

  // Three-column layout: center view state
  const [centerView, setCenterView] = useState("timeline");
  const [newBehandlungOpen, setNewBehandlungOpen] = useState(false);
  const [newBehDatum, setNewBehDatum] = useState(new Date().toISOString().slice(0, 10));
  const [newBehZeit, setNewBehZeit] = useState("");
  const [expandedBeh, setExpandedBeh] = useState(null);
  const [historieOpen, setHistorieOpen] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [centerTab, setCenterTab] = useState("behandlungen"); // "behandlungen" | "rechnungen"

  const closeTreatmentModal = () => { setViewingTreatment(null); setCenterView("timeline"); };
  const closeTreatmentForm = () => { setCenterView("timeline"); setEditingTreatmentInv(null); setNewTreatmentBehId(null); };

  // Close the Historie drawer with Escape
  useEffect(() => {
    if (!historieOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setHistorieOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historieOpen]);

  // New treatment states (shared between add and detail panels via pendingQuickInvoice flow)
  const [newTreatmentMarkers, setNewTreatmentMarkers] = useState([]);
  const [newTreatmentInvoiceId, setNewTreatmentInvoiceId] = useState(null);
  // Präparate used in the session: [{ name, einheit, amount }], at least one
  const [newTreatmentPraeparate, setNewTreatmentPraeparate] = useState([emptyPraeparat()]);
  const [newTreatmentDate, setNewTreatmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [newTreatmentNotes, setNewTreatmentNotes] = useState("");
  const [newTreatmentFacePhoto, setNewTreatmentFacePhoto] = useState("");
  const [newTreatmentBehId, setNewTreatmentBehId] = useState(null);

  // Quick invoice pending (bridges behandlungen_add -> behandlung_detail)
  const [pendingQuickInvoice, setPendingQuickInvoice] = useState(false);

  // Treatment doc PDF state
  const [treatmentDocTarget, setTreatmentDocTarget] = useState(null);
  // Behandlungsdoku being sent to the patient (its hidden preview is rendered via treatmentDocTarget)
  const [sendTdInv, setSendTdInv] = useState(null);

  // Sidebar collapsible states

  // Profile photo upload ref
  const profilePhotoInputRef = useRef(null);

  // ── Computed data ──
  const matchingInvoices = invoices.filter((inv) => {
    if (inv._patientDbId && patientDbId) return inv._patientDbId === patientDbId;
    const invEmail = ((inv.patient || {}).email || "").toLowerCase();
    return email && invEmail && invEmail === email;
  });
  const rechnungsInvoices = matchingInvoices.filter((inv) => !inv._standalone && !inv._hvOnly && !inv._consentForm);
  // Earlier treatments to take over Präparate and points from (utils/copySources.js)
  const copySourceDocs = treatmentCopySources(matchingInvoices);
  // Titles used before (all patients), most frequent first, as suggestions
  const behTitleSuggestions = React.useMemo(() => {
    const counts = new Map();
    for (const b of behandlungen) { const t = (b.titel || "").trim(); if (t) counts.set(t, (counts.get(t) || 0) + 1); }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de")).slice(0, 40).map(([t]) => t);
  }, [behandlungen]);
  const patientBeh = behandlungen.filter(b => b._patientId === patientDbId).sort((a, b) => (b.datum || b._createdAt || "").localeCompare(a.datum || a._createdAt || ""));
  const lastActivity = matchingInvoices.length > 0 ? matchingInvoices.reduce((best, inv) => {
    const t = inv._createdAt || inv.savedAt || "";
    const bt = best ? (best._createdAt || best.savedAt || "") : "";
    return t > bt ? inv : best;
  }, null) : null;

  // Auto-pull latest face photo from treatment docs
  const latestFacePhoto = React.useMemo(() => {
    if (rawData.profilePhoto) return rawData.profilePhoto;
    const treatmentDocs = matchingInvoices
      .filter(inv => inv.treatmentDoc?.facePhoto && inv.treatmentDoc.facePhoto !== FACE_IMAGE_B64)
      .sort((a, b) => (b._createdAt || b.savedAt || "").localeCompare(a._createdAt || a.savedAt || ""));
    return treatmentDocs[0]?.treatmentDoc?.facePhoto || null;
  }, [matchingInvoices, rawData.profilePhoto]);

  // Anamnese data
  const anamnese = (rawData.anamnese || []).slice().sort((a, b) => (a.addedAt || "").localeCompare(b.addedAt || ""));

  // ── Retroactive sync from existing consent forms: demographics + Anamnese ──
  // Fills missing demographic fields and adds Anamnese entries for every "Ja" answer that is
  // not on the patient yet (same rule as the Risiko badge). Also repairs records whose
  // Anamnese was wiped by the old invoice save. One update, so the two can't overwrite each other.
  const retroSyncDoneRef = useRef(false);
  useEffect(() => {
    if (retroSyncDoneRef.current || !onUpdatePatient) return;
    const consentForms = matchingInvoices.filter(inv => inv._consentForm && inv.consentData?.answers);
    if (consentForms.length === 0) return;
    const sorted = [...consentForms].sort((a, b) => (b._createdAt || b.savedAt || "").localeCompare(a._createdAt || a.savedAt || ""));
    const missingFields = ["geschlecht", "geburtsdatum", "groesse", "gewicht"].filter(f => !rawData[f]);
    const demoFields = {};
    for (const form of sorted) {
      const ans = form.consentData.answers;
      for (const f of missingFields) {
        if (ans[f] && !demoFields[f]) demoFields[f] = ans[f];
      }
    }
    // Oldest first, so an entry keeps the date it was first answered with "Ja"
    const anamnese = [...(rawData.anamnese || [])];
    for (const form of [...sorted].reverse()) {
      const ans = form.consentData.answers;
      const tpl = resolveConsentTemplate(form.consentData, practice);
      if (!tpl) continue;
      const qs = [...(tpl.questions || []), ...(ans.geschlecht === "w" ? (tpl.additionalQuestionsWomen || []) : [])];
      for (const q of qs) {
        if (ans[q.id] !== true || anamnese.some(e => e.questionId === q.id)) continue;
        anamnese.push({ questionId: q.id, questionLabel: q.label, detailText: ans[q.id + "_text"] || "", addedAt: (form._createdAt || form.savedAt || "").slice(0, 10) });
      }
    }
    const anamneseAdded = anamnese.length > (rawData.anamnese || []).length;
    if (Object.keys(demoFields).length === 0 && !anamneseAdded) return;
    retroSyncDoneRef.current = true;
    Promise.resolve(onUpdatePatient({ ...rawData, ...demoFields, ...(anamneseAdded ? { anamnese } : {}) })).catch(() => { /* background sync, logged in App */ });
  }, [patientDbId, matchingInvoices.length]); // eslint-disable-line

  // ── Helper functions (shared across components) ──
  const hasConsentRisks = (inv) => {
    const a = inv.consentData?.answers || inv.consentData || {};
    const tpl = resolveConsentTemplate(inv.consentData, practice);
    if (!tpl) return false;
    for (const q of tpl.questions) { if (a[q.id] === true) return true; }
    if (tpl.additionalQuestionsWomen && a.geschlecht === "w") {
      for (const q of tpl.additionalQuestionsWomen) { if (a[q.id] === true) return true; }
    }
    return false;
  };

  const getDocLabel = (inv) => {
    if (inv._consentForm || inv._docType === "aufklaerung") return "Aufklärungsbogen";
    if (inv._hvOnly || inv._docType === "hv") return "Honorarvereinbarung";
    if ((inv._standalone || inv._treatmentDocOnly) || inv._docType === "behandlungsdoku") return "Behandlungsdoku";
    return "Rechnung";
  };

  const getDocStatus = (inv) => {
    if (inv._consentForm || inv._docType === "aufklaerung") {
      const sigs = inv.consentData?._signatures;
      const risk = hasConsentRisks(inv);
      if (inv.consentData?.refused) return { label: "Abgelehnt", color: "text-red-500", risk };
      if (sigs?.patient && sigs?.doctor) return { label: "Unterschrieben", color: "text-green-600", risk, done: true };
      if (sigs?.patient) return { label: "Ärzt:in fehlt", color: "text-amber-500", risk };
      return { label: "Entwurf", color: "text-gray-400", risk };
    }
    if (inv._hvOnly || inv._docType === "hv") {
      const sigs = inv._signatures;
      if (inv._signedHvUpload) return { label: "Hochgeladen", color: "text-green-600", done: true };
      if (sigs?.patient && sigs?.doctor) return { label: "Unterschrieben", color: "text-green-600", done: true };
      if (sigs?.patient) return { label: "Ärzt:in fehlt", color: "text-amber-500" };
      return { label: "—", color: "text-gray-400" };
    }
    // A Behandlungsdoku has no payment of its own: once saved it is documented
    if ((inv._standalone || inv._treatmentDocOnly) || inv._docType === "behandlungsdoku") return { label: "Dokumentiert", color: "text-green-600", done: true };
    if (inv.paymentStatus === "bezahlt") return { label: "Bezahlt", color: "text-green-600", payment: true, paid: true, paidAt: inv.paidAt };
    return { label: "Ausstehend", color: "text-amber-500", payment: true, paid: false };
  };

  const handleDocClick = (inv) => {
    if (inv._consentForm || inv._docType === "aufklaerung") { onViewConsent && onViewConsent(inv); }
    else if (inv._hvOnly || inv._docType === "hv") { onViewHV && onViewHV(inv); }
    else if ((inv._standalone || inv._treatmentDocOnly) || inv._docType === "behandlungsdoku") {
      setViewingTreatment(inv);
      setCenterView("behandlung_detail");
    }
    else { onView && onView(inv); }
  };

  // "+ Behandlungsdoku" inside a Behandlung: the document starts on the Behandlungstermin
  const openBehandlungsdokuFor = (beh) => {
    setNewTreatmentBehId(beh ? beh._id : null);
    setNewTreatmentDate((beh && beh.datum) || new Date().toISOString().slice(0, 10));
    setCenterView("behandlungen_add");
  };

  const downloadTreatmentDoc = async (inv) => {
    setTreatmentDocTarget(inv);
    await new Promise(r => setTimeout(r, 150));
    const el = document.getElementById("treatment-doc-preview");
    if (!el) { setTreatmentDocTarget(null); return; }
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#fff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      const td = inv.treatmentDoc || {};
      const dateStr = td.behandlungsDatum || new Date().toISOString().slice(0, 10);
      const patName = [patient.vorname || rawData.vorname || "", patient.nachname || rawData.nachname || ""].filter(Boolean).join("_") || "Patient";
      const filename = `Behandlung_${patName}_${dateStr}.pdf`;
      const blob = pdf.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      const isMobile = window.innerWidth < 640;
      if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: filename }); } catch (e) { if (e.name !== "AbortError") pdf.save(filename); }
      } else {
        pdf.save(filename);
      }
    } catch (e) {
      console.error("Treatment doc PDF error:", e);
    } finally {
      setTreatmentDocTarget(null);
    }
  };

  // Profile photo upload handler
  const handleProfilePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      if (onUpdatePatient) {
        Promise.resolve(onUpdatePatient({ ...rawData, profilePhoto: base64 })).catch((err) => showToast("Foto konnte nicht gespeichert werden: " + (err?.message || err), { error: true }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Rechnungen of this patient (no HV, Aufklärung or Behandlungsdoku)
  const patientRechnungen = matchingInvoices.filter((inv) => getDocLabel(inv) === "Rechnung");

  // ── Render ──
  return (
    <div>
      {/* Back button + note action */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <button className="text-sm text-gray-400 hover:text-gray-600 transition" onClick={onBack}>&larr; Zur&uuml;ck zur Patient:innenliste</button>
        {!rawData.note && !noteEditing && onUpdatePatient && (
          <button className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700 font-medium transition" onClick={() => setNoteEditing(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Persönliche Notiz
          </button>
        )}
      </div>

      {/* Pinned personal note (encrypted with the patient data, appears on no document) */}
      {(rawData.note || noteEditing) && (
        <div className="mb-5 lg:mb-6 rounded-lg bg-amber-50 border border-amber-200/70 px-4 sm:px-5 py-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M16 3a1 1 0 01.7 1.7L15 6.4v4.2l2.7 2.7a1 1 0 01-.7 1.7H13v6a1 1 0 11-2 0v-6H7a1 1 0 01-.7-1.7L9 10.6V6.4L7.3 4.7A1 1 0 018 3h8z" /></svg>
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Persönliche Notiz</span>
            {!noteEditing && rawData.noteUpdatedAt && (
              <span className="text-xs text-amber-700/60">· {new Date(rawData.noteUpdatedAt).toLocaleDateString("de-DE")}</span>
            )}
            {!noteEditing && (
              <div className="ml-auto flex items-center gap-1">
                <button className="px-2 py-1 text-xs rounded text-amber-800/70 hover:text-amber-900 hover:bg-amber-100 transition" onClick={() => setNoteEditing(true)}>Bearbeiten</button>
                <button className="px-2 py-1 text-xs rounded text-amber-800/70 hover:text-red-600 hover:bg-amber-100 transition" onClick={async () => {
                  try { await onUpdatePatient({ ...rawData, note: "", noteUpdatedAt: new Date().toISOString() }); }
                  catch (e) { showToast("Notiz konnte nicht entfernt werden: " + (e?.message || e), { error: true }); }
                }}>Entfernen</button>
              </div>
            )}
          </div>
          {noteEditing ? (
            <NoteEditor
              value={rawData.note || ""}
              editing={noteEditing}
              setEditing={setNoteEditing}
              rows={3}
              placeholder="z.B. bevorzugt Termine am Vormittag, reagiert empfindlich auf Kälte …"
              onSave={(text) => onUpdatePatient({ ...rawData, note: text, noteUpdatedAt: new Date().toISOString() })}
            />
          ) : (
            <p
              role="button"
              tabIndex={0}
              title="Klicken zum Bearbeiten"
              className="-mx-2 px-2 py-1 rounded-md text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed cursor-text hover:bg-amber-100/60 transition"
              onClick={() => { if (window.getSelection && String(window.getSelection()).length > 0) return; setNoteEditing(true); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setNoteEditing(true); } }}
            >{rawData.note}</p>
          )}
          {noteEditing && <p className="text-[11px] text-amber-800/60 mt-2">Nur für Dich sichtbar und verschlüsselt gespeichert. Erscheint auf keinem Dokument.</p>}
        </div>
      )}

      {/* Two-column layout: Stammdaten + Behandlungen; Historie opens as a drawer */}
      <div className="flex flex-col lg:flex-row gap-5 lg:gap-6 items-start">
        {/* ═══════════════════ LEFT SIDEBAR ═══════════════════ */}
        <div className="w-full lg:w-auto bg-white rounded-lg border border-[#DFE3EB] shadow-sm overflow-hidden flex-shrink-0">
          <PatientLeftSidebar
            patient={patient} rawData={rawData} email={email}
            latestFacePhoto={latestFacePhoto} profilePhotoInputRef={profilePhotoInputRef} handleProfilePhotoUpload={handleProfilePhotoUpload}
            anamnese={anamnese}
            onUpdatePatient={onUpdatePatient}
            createdAt={patient._raw?.created_at ? fmtDate(patient._raw.created_at.slice(0, 10)) : ""}
            behCount={patientBeh.length}
            lastActivityDate={lastActivity ? fmtDate(lastActivity._createdAt?.slice(0, 10)) : ""}
            onOpenHistorie={() => setHistorieOpen(true)}
          />
        </div>

        {/* ═══════════════════ CENTER: Behandlungen ═══════════════════ */}
        <div className="w-full lg:flex-1 min-w-0">
          {/* Data Highlights + Historie trigger (phones show these in the patient card row) */}
          <div className="hidden lg:flex bg-white rounded-lg border border-[#DFE3EB] shadow-sm mb-6 flex-wrap items-center gap-x-8 gap-y-4 px-6 py-4">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Erstellt am</div>
              <div className="text-sm text-gray-800 font-medium mt-1">{fmtDate(patient._raw?.created_at?.slice(0, 10))}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Behandlungen</div>
              <div className="text-sm text-gray-800 font-medium mt-1">{patientBeh.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Letzte Aktivit&auml;t</div>
              <div className="text-sm text-gray-800 font-medium mt-1">{lastActivity ? fmtDate(lastActivity._createdAt?.slice(0, 10)) : "--"}</div>
            </div>
            <button
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 rounded-md border border-[#DFE3EB] hover:bg-gray-50 hover:text-gray-800 transition"
              onClick={() => setHistorieOpen(true)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Historie
            </button>
          </div>

          {/* Behandlungen | Rechnungen (documents open in modals on top) */}
          <div className="bg-white rounded-lg border border-[#DFE3EB] shadow-sm overflow-hidden lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
            <div className="px-5 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 -mb-px" role="tablist">
                {[
                  { id: "behandlungen", label: "Behandlungen", count: patientBeh.length },
                  { id: "rechnungen", label: "Rechnungen", count: patientRechnungen.length },
                ].map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={centerTab === t.id}
                    className={`px-2.5 sm:px-3 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded-t ${centerTab === t.id ? "border-blue-500 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"}`}
                    onClick={() => setCenterTab(t.id)}
                  >
                    {t.label} <span className={`ml-0.5 text-xs font-medium ${centerTab === t.id ? "text-gray-500" : "text-gray-300"}`}>{t.count}</span>
                  </button>
                ))}
              </div>
              {centerTab === "behandlungen" ? (
                <button className="text-sm text-blue-500 hover:text-blue-700 font-medium transition whitespace-nowrap" onClick={() => setNewBehandlungOpen(true)}><span className="sm:hidden">+ Neu</span><span className="hidden sm:inline">+ Neue Behandlung</span></button>
              ) : (
                onCreateInvoice && <button className="text-sm text-blue-500 hover:text-blue-700 font-medium transition whitespace-nowrap" onClick={() => onCreateInvoice(patient)}><span className="sm:hidden">+ Neu</span><span className="hidden sm:inline">+ Neue Rechnung</span></button>
              )}
            </div>
            {/* Both panels share one grid cell, so the box keeps the height of the taller one and
                switching tabs doesn't make the page jump. The hidden one stays out of view and focus. */}
            <div className="grid">
              <div role="tabpanel" className={`[grid-area:1/1] min-w-0 ${centerTab === "behandlungen" ? "" : "invisible"}`} aria-hidden={centerTab !== "behandlungen"}>
                <PatientBehandlungenSidebar
                  hideHeader
                  onSetPaymentStatus={onSetPaymentStatus}
                  patientBeh={patientBeh} matchingInvoices={matchingInvoices} patientDbId={patientDbId} patient={patient}
                  newBehandlungOpen={newBehandlungOpen} setNewBehandlungOpen={setNewBehandlungOpen}
                  newBehDatum={newBehDatum} setNewBehDatum={setNewBehDatum}
                  newBehZeit={newBehZeit} setNewBehZeit={setNewBehZeit}
                  expandedBeh={expandedBeh} setExpandedBeh={setExpandedBeh}
                  onCreateBehandlung={onCreateBehandlung} onDeleteBehandlung={onDeleteBehandlung} onUpdateBehandlung={onUpdateBehandlung}
                  onStartConsent={onStartConsent} onNewHV={onNewHV} onCreateInvoice={onCreateInvoice} onAddBehandlungsdoku={openBehandlungsdokuFor}
                  setCenterView={setCenterView} setNewTreatmentBehId={setNewTreatmentBehId}
                  onViewConsent={onViewConsent} onViewHV={onViewHV} onView={onView}
                  setViewingTreatment={setViewingTreatment} setConfirmDeleteBeh={setConfirmDeleteBeh}
                  hasConsentRisks={hasConsentRisks} getDocLabel={getDocLabel} getDocStatus={getDocStatus} handleDocClick={handleDocClick}
                  onLinkDocToBehandlung={onLinkDocToBehandlung} onDelete={onDelete}
                  titleSuggestions={behTitleSuggestions}
                />
              </div>
              <div role="tabpanel" className={`[grid-area:1/1] min-w-0 ${centerTab === "rechnungen" ? "" : "invisible"}`} aria-hidden={centerTab !== "rechnungen"}>
                <PatientInvoicesTab
                  invoices={patientRechnungen}
                  behandlungen={patientBeh}
                  kleinunternehmer={kleinunternehmer}
                  onView={onView}
                  onSetPaymentStatus={onSetPaymentStatus}
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* Historie slide-over: on demand instead of a permanent column */}
      {historieOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Historie">
          <div className="absolute inset-0 bg-black/20" onClick={() => setHistorieOpen(false)} />
          <div className="relative w-full sm:w-[28rem] h-full bg-white shadow-2xl overflow-y-auto">
            <PatientTimeline
              patient={patient} patientDbId={patientDbId}
              matchingInvoices={matchingInvoices} patientBeh={patientBeh}
              activityLog={activityLog} lastActivity={lastActivity}
              onViewConsent={onViewConsent} onViewHV={onViewHV} onView={onView}
              setViewingTreatment={setViewingTreatment} setCenterView={setCenterView}
              onClose={() => setHistorieOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Behandlungsdoku view modal (same shell as Rechnung, HV and Aufklärungsbogen) */}
      {centerView === "behandlung_detail" && viewingTreatment && (
        <Modal title="Behandlungsdokumentation" onClose={closeTreatmentModal} escapeBlocked={!!confirmDeleteTreatment} bodyClassName="bg-[#F5F8FA] px-3 sm:px-6 py-4 sm:py-6">
          <div className="bg-white rounded-lg shadow-sm">
            <BehandlungDetailPanel
              inModal
              viewingTreatment={viewingTreatment} setViewingTreatment={setViewingTreatment}
              setCenterView={setCenterView}
              patient={patient} rawData={rawData} invoices={invoices}
              kleinunternehmer={kleinunternehmer} practice={practice}
              onUpdateInvoice={onUpdateInvoice} onQuickInvoice={onQuickInvoice}
              setConfirmDeleteTreatment={setConfirmDeleteTreatment}
              downloadTreatmentDoc={downloadTreatmentDoc}
              onSendTreatmentDoc={accessToken ? (inv) => { setTreatmentDocTarget(inv); setSendTdInv(inv); } : null}
              pendingQuickInvoice={pendingQuickInvoice} setPendingQuickInvoice={setPendingQuickInvoice}
              onStartHvFromValues={onStartHvFromValues}
            />
          </div>
        </Modal>
      )}

      {/* Behandlungsdoku create/edit form: same shell, closes via X only (unsaved input) */}
      {centerView === "behandlungen_add" && (
        <Modal title={editingTreatmentInv ? "Behandlung bearbeiten" : "Neue Behandlungsdokumentation"} onClose={closeTreatmentForm} z="z-50" dismissible={false}>
          <div>
            <BehandlungAddPanel
              patient={patient} email={email} rawData={rawData} patientDbId={patientDbId}
              matchingInvoices={matchingInvoices} rechnungsInvoices={rechnungsInvoices} copySourceDocs={copySourceDocs} practice={practice}
              editingTreatmentInv={editingTreatmentInv} setEditingTreatmentInv={setEditingTreatmentInv}
              newTreatmentMarkers={newTreatmentMarkers} setNewTreatmentMarkers={setNewTreatmentMarkers}
              newTreatmentInvoiceId={newTreatmentInvoiceId} setNewTreatmentInvoiceId={setNewTreatmentInvoiceId}
              newTreatmentPraeparate={newTreatmentPraeparate} setNewTreatmentPraeparate={setNewTreatmentPraeparate}
              newTreatmentDate={newTreatmentDate} setNewTreatmentDate={setNewTreatmentDate}
              newTreatmentNotes={newTreatmentNotes} setNewTreatmentNotes={setNewTreatmentNotes}
              newTreatmentFacePhoto={newTreatmentFacePhoto} setNewTreatmentFacePhoto={setNewTreatmentFacePhoto}
              newTreatmentBehId={newTreatmentBehId} setNewTreatmentBehId={setNewTreatmentBehId}
              onUpdateInvoice={onUpdateInvoice}
              setCenterView={setCenterView}
              setViewingTreatment={setViewingTreatment} setPendingQuickInvoice={setPendingQuickInvoice}
            />
          </div>
        </Modal>
      )}

      {/* Delete treatment doc confirmation */}
      {confirmDeleteTreatment && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Behandlung l&ouml;schen?</h3>
            <p className="text-xs text-gray-500 mb-4">Diese Behandlungsdokumentation wird unwiderruflich gel&ouml;scht. Diese Aktion kann nicht r&uuml;ckg&auml;ngig gemacht werden.</p>
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-1.5 text-xs rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50" onClick={() => setConfirmDeleteTreatment(null)}>Abbrechen</button>
              <button className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700" onClick={() => {
                const inv = confirmDeleteTreatment;
                if (inv._standalone) {
                  if (onUpdateInvoice) onUpdateInvoice({ ...inv, _deleted: true });
                } else {
                  const updated = { ...inv };
                  delete updated.treatmentDoc;
                  if (onUpdateInvoice) onUpdateInvoice(updated);
                }
                setConfirmDeleteTreatment(null);
                setCenterView("timeline");
              }}>L&ouml;schen</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Behandlung confirmation */}
      {confirmDeleteBeh && (() => {
        const behDocCount = matchingInvoices.filter((inv) => inv._behandlungId === confirmDeleteBeh._id).length;
        const runDelete = async (deleteDocs) => {
          if (behDeleting) return;
          setBehDeleting(deleteDocs ? "all" : "keep");
          try {
            await onDeleteBehandlung(confirmDeleteBeh._id, { deleteDocs });
            showToast(deleteDocs && behDocCount > 0 ? "Behandlung und Dokumente gelöscht" : "Behandlung gelöscht");
            setConfirmDeleteBeh(null);
          } catch (e) {
            console.error("Delete Behandlung error:", e);
            showToast("Fehler beim Löschen: " + (e?.message || e), { error: true });
          } finally {
            setBehDeleting(null);
          }
        };
        return (
          <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Behandlung vom {fmtDate(confirmDeleteBeh.datum)} l&ouml;schen?</h3>
              <p className="text-xs text-gray-500 mb-4">
                {behDocCount === 0
                  ? "Diese Behandlung enthält keine Dokumente."
                  : `Diese Behandlung enthält ${behDocCount} Dokument${behDocCount === 1 ? "" : "e"}. Du kannst sie behalten (sie erscheinen dann unter „Einzelne Dokumente“) oder mitlöschen.`}
              </p>
              <div className="flex flex-col gap-2">
                {behDocCount > 0 && (
                  <button className="px-3 py-2 text-xs rounded border border-[#DFE3EB] text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5" disabled={!!behDeleting} onClick={() => runDelete(false)}>
                    {behDeleting === "keep" && <Spinner className="h-3.5 w-3.5" />}
                    {behDeleting === "keep" ? "Wird gelöscht…" : "Nur Behandlung löschen, Dokumente behalten"}
                  </button>
                )}
                <button className="px-3 py-2 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-1.5" disabled={!!behDeleting} onClick={() => runDelete(true)}>
                  {behDeleting === "all" && <Spinner className="h-3.5 w-3.5" />}
                  {behDeleting === "all" ? "Wird gelöscht…" : (behDocCount > 0 ? `Behandlung mit ${behDocCount} Dokument${behDocCount === 1 ? "" : "en"} löschen` : "Behandlung löschen")}
                </button>
                <button className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!!behDeleting} onClick={() => setConfirmDeleteBeh(null)}>Abbrechen</button>
              </div>
            </div>
          </div>
        );
      })()}

      {sendTdInv && (
        <SendToPatientDialog
          docs={[{ key: "behandlung", label: "Behandlungsdokumentation", elementId: "treatment-doc-preview", filename: `Behandlungsdokumentation_${sendTdInv.treatmentDoc?.behandlungsDatum || "Behandlung"}.pdf`, ref: sendTdInv._supabaseId || String(sendTdInv.id) }]}
          makeFile={async (elementId, filename) => {
            // The hidden preview mounts with treatmentDocTarget; wait until it is in the DOM
            let el = null;
            for (let i = 0; i < 40 && !el; i++) { await new Promise((r) => setTimeout(r, 50)); el = document.getElementById(elementId); }
            if (!el) throw new Error(`Element ${elementId} not found`);
            const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#fff" });
            const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
            pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
            return new File([pdf.output("blob")], filename, { type: "application/pdf" });
          }}
          secure={{
            token: accessToken,
            email: rawData.email || patient.email || "",
            firstName: rawData.vorname || patient.vorname || "",
            dob: rawData.geburtsdatum || "",
            practice: { name: (sendTdInv._practice || practice).name || "", email: (sendTdInv._practice || practice).email || "", phone: (sendTdInv._practice || practice).phone || "" },
          }}
          onClose={() => { setSendTdInv(null); setTreatmentDocTarget(null); }}
          onDone={(how) => { if (how === "emailed" && onLogActivity) onLogActivity(patient._raw?.id || patient.id, "behandlungsdoku", sendTdInv._supabaseId, "updated", "Per E-Mail-Link gesendet: Behandlungsdoku"); }}
        />
      )}

      {/* Hidden treatment document preview for PDF generation */}
      {treatmentDocTarget && (() => {
        const tInv = treatmentDocTarget;
        const tTd = tInv.treatmentDoc || {};
        const tEinheit = tTd.einheit || tInv.einheit || "SE";
        const tPatData = (patient._raw && typeof patient._raw.data === "object" && patient._raw.data) || {};
        const tPat = { vorname: tPatData.vorname || patient.vorname || "", nachname: tPatData.nachname || patient.nachname || "", address1: tPatData.address1 || "", address2: tPatData.address2 || "", country: tPatData.country || "Deutschland" };
        return (
          <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
            <TreatmentDocPreview
              practice={tInv._practice || practice}
              patient={tPat}
              treatmentDoc={tTd}
              einheit={tEinheit}
              facePhoto={tTd.facePhoto || ""}
            />
          </div>
        );
      })()}
    </div>
  );
}
