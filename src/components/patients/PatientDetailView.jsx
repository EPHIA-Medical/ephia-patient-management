import { showToast } from "../../utils/toast";
import React, { useState, useRef, useEffect } from "react";
import { fmtDate } from "../../utils/helpers";
import { CONSENT_TEMPLATES } from "../consent/consentTemplates";
import { FACE_IMAGE_B64 } from "../../constants";
import TreatmentDocPreview from "./TreatmentDocumentPreview";
import PatientLeftSidebar from "./PatientLeftSidebar";
import PatientTimeline from "./PatientTimeline";
import BehandlungDetailPanel from "./BehandlungDetailPanel";
import BehandlungAddPanel from "./BehandlungAddPanel";
import PatientBehandlungenSidebar from "./PatientBehandlungenSidebar";

// ═══════════════════ Patient Detail View ═══════════════════

export default function PatientDetailView({ patient, invoices, behandlungen = [], docsMigrated, kleinunternehmer, practice, onBack, onView, onViewHV, onDownload, onDownloadHV, onPrint, onPrintHV, onDelete, onUpdateInvoice, onUpdatePatient, onCreateInvoice, onQuickInvoice, onNewHV, onStartConsent, onViewConsent, onDownloadConsent, onCreateBehandlung, onUpdateBehandlung, onDeleteBehandlung, onLinkDocToBehandlung, activityLog = [], onLogActivity }) {
  // ── Derived data ──
  const rawData = (patient._raw && typeof patient._raw.data === "object" && patient._raw.data) ? patient._raw.data : {};
  const email = (rawData.email || patient.email || "").toLowerCase();
  const patientDbId = patient._raw ? patient._raw.id : patient.id;

  // ── Shared state ──
  const [confirmDeleteTreatment, setConfirmDeleteTreatment] = useState(null);
  const [confirmDeleteBeh, setConfirmDeleteBeh] = useState(null);
  const [editingTreatmentInv, setEditingTreatmentInv] = useState(null);
  const [viewingTreatment, setViewingTreatment] = useState(null);

  // Three-column layout: center view state
  const [centerView, setCenterView] = useState("timeline");
  const [newBehandlungOpen, setNewBehandlungOpen] = useState(false);
  const [newBehDatum, setNewBehDatum] = useState(new Date().toISOString().slice(0, 10));
  const [newBehZeit, setNewBehZeit] = useState("");
  const [expandedBeh, setExpandedBeh] = useState(null);

  // New treatment states (shared between add and detail panels via pendingQuickInvoice flow)
  const [newTreatmentMarkers, setNewTreatmentMarkers] = useState([]);
  const [newTreatmentInvoiceId, setNewTreatmentInvoiceId] = useState(null);
  const [newTreatmentEinheit, setNewTreatmentEinheit] = useState("SE");
  const [newTreatmentPraeparat, setNewTreatmentPraeparat] = useState("");
  const [newTreatmentDate, setNewTreatmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [newTreatmentNotes, setNewTreatmentNotes] = useState("");
  const [newTreatmentAmount, setNewTreatmentAmount] = useState("");
  const [newTreatmentFacePhoto, setNewTreatmentFacePhoto] = useState("");
  const [newTreatmentBehId, setNewTreatmentBehId] = useState(null);

  // Quick invoice pending (bridges behandlungen_add -> behandlung_detail)
  const [pendingQuickInvoice, setPendingQuickInvoice] = useState(false);

  // Treatment doc PDF state
  const [treatmentDocTarget, setTreatmentDocTarget] = useState(null);

  // Sidebar collapsible states
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
  const [adressdatenOpen, setAdressdatenOpen] = useState(isDesktop);
  const [medizinischeOpen, setMedizinischeOpen] = useState(isDesktop);
  const [anamneseOpen, setAnamneseOpen] = useState(isDesktop);

  // Profile photo upload ref
  const profilePhotoInputRef = useRef(null);

  // ── Computed data ──
  const matchingInvoices = invoices.filter((inv) => {
    if (inv._patientDbId && patientDbId) return inv._patientDbId === patientDbId;
    const invEmail = ((inv.patient || {}).email || "").toLowerCase();
    return email && invEmail && invEmail === email;
  });
  const rechnungsInvoices = matchingInvoices.filter((inv) => !inv._standalone && !inv._hvOnly && !inv._consentForm);
  // Rechnungen + Honorarvereinbarungen of this patient that carry Präparat data to copy from
  const copySourceDocs = matchingInvoices
    .filter((inv) => !inv._standalone && !inv._consentForm && (inv.praeparat || inv.einheit))
    .sort((a, b) => (b.invoiceMeta?.datum || b.savedAt || "").localeCompare(a.invoiceMeta?.datum || a.savedAt || ""));
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

  // ── Retroactive demographic sync from existing consent forms ──
  const retroSyncDoneRef = useRef(false);
  useEffect(() => {
    if (retroSyncDoneRef.current || !onUpdatePatient) return;
    const missingFields = ["geschlecht", "geburtsdatum", "groesse", "gewicht"].filter(f => !rawData[f]);
    if (missingFields.length === 0) return;
    const consentForms = matchingInvoices.filter(inv => inv._consentForm && inv.consentData?.answers);
    if (consentForms.length === 0) return;
    // Use the most recent consent form with demographic data
    const sorted = [...consentForms].sort((a, b) => (b._createdAt || b.savedAt || "").localeCompare(a._createdAt || a.savedAt || ""));
    const demoFields = {};
    for (const form of sorted) {
      const ans = form.consentData.answers;
      for (const f of missingFields) {
        if (ans[f] && !demoFields[f]) demoFields[f] = ans[f];
      }
    }
    if (Object.keys(demoFields).length === 0) return;
    retroSyncDoneRef.current = true;
    onUpdatePatient({ ...rawData, ...demoFields });
  }, [patientDbId]); // eslint-disable-line

  // ── Helper functions (shared across components) ──
  const hasConsentRisks = (inv) => {
    const a = inv.consentData?.answers || inv.consentData || {};
    const tpl = CONSENT_TEMPLATES.find(t => t.id === (inv.consentData?.templateId));
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
    if (inv.paymentStatus === "bezahlt") return { label: "Bezahlt", color: "text-green-600" };
    return { label: "Ausstehend", color: "text-amber-500" };
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
      if (onUpdatePatient) onUpdatePatient({ ...rawData, profilePhoto: base64 });
    };
    reader.readAsDataURL(file);
  };

  // ── Render ──
  return (
    <div>
      {/* Back button */}
      <div className="mb-4">
        <button className="text-sm text-gray-400 hover:text-gray-600 transition" onClick={onBack}>&larr; Zur&uuml;ck zur Patient:innenliste</button>
      </div>

      {/* Three-column layout — separate cards */}
      <div className="flex flex-col lg:flex-row gap-5 lg:gap-6 items-start">
        {/* ═══════════════════ LEFT SIDEBAR ═══════════════════ */}
        <div className="w-full lg:w-auto bg-white rounded-lg border border-[#DFE3EB] shadow-sm overflow-hidden flex-shrink-0">
          <PatientLeftSidebar
            patient={patient} rawData={rawData} email={email}
            latestFacePhoto={latestFacePhoto} profilePhotoInputRef={profilePhotoInputRef} handleProfilePhotoUpload={handleProfilePhotoUpload}
            adressdatenOpen={adressdatenOpen} setAdressdatenOpen={setAdressdatenOpen}
            medizinischeOpen={medizinischeOpen} setMedizinischeOpen={setMedizinischeOpen}
            anamneseOpen={anamneseOpen} setAnamneseOpen={setAnamneseOpen}
            anamnese={anamnese}
            onUpdatePatient={onUpdatePatient}
          />
        </div>

        {/* ═══════════════════ CENTER: Behandlungen ═══════════════════ */}
        <div className="w-full lg:flex-1 min-w-0">
          {/* Data Highlights */}
          <div className="bg-white rounded-lg border border-[#DFE3EB] shadow-sm mb-5 lg:mb-6">
            <div className="grid grid-cols-3 gap-6 px-6 py-5">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Erstellt am</div>
                <div className="text-sm text-gray-800 font-medium mt-1.5">{fmtDate(patient._raw?.created_at?.slice(0, 10))}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Behandlungen</div>
                <div className="text-sm text-gray-800 font-medium mt-1.5">{patientBeh.length}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Letzte Aktivit&auml;t</div>
                <div className="text-sm text-gray-800 font-medium mt-1.5">{lastActivity ? fmtDate(lastActivity._createdAt?.slice(0, 10)) : "--"}</div>
              </div>
            </div>
          </div>

          {/* Behandlungen or Detail view */}
          <div className="bg-white rounded-lg border border-[#DFE3EB] shadow-sm overflow-hidden lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
            {(centerView === "timeline" || centerView === "behandlungen_add") && (
              <PatientBehandlungenSidebar
                patientBeh={patientBeh} matchingInvoices={matchingInvoices} patientDbId={patientDbId} patient={patient}
                newBehandlungOpen={newBehandlungOpen} setNewBehandlungOpen={setNewBehandlungOpen}
                newBehDatum={newBehDatum} setNewBehDatum={setNewBehDatum}
                newBehZeit={newBehZeit} setNewBehZeit={setNewBehZeit}
                expandedBeh={expandedBeh} setExpandedBeh={setExpandedBeh}
                onCreateBehandlung={onCreateBehandlung} onDeleteBehandlung={onDeleteBehandlung}
                onStartConsent={onStartConsent} onNewHV={onNewHV} onCreateInvoice={onCreateInvoice}
                setCenterView={setCenterView} setNewTreatmentBehId={setNewTreatmentBehId}
                onViewConsent={onViewConsent} onViewHV={onViewHV} onView={onView}
                setViewingTreatment={setViewingTreatment} setConfirmDeleteBeh={setConfirmDeleteBeh}
                hasConsentRisks={hasConsentRisks} getDocLabel={getDocLabel} getDocStatus={getDocStatus} handleDocClick={handleDocClick}
                onLinkDocToBehandlung={onLinkDocToBehandlung} onDelete={onDelete}
              />
            )}

            {centerView === "behandlung_detail" && viewingTreatment && (
              <BehandlungDetailPanel
                viewingTreatment={viewingTreatment} setViewingTreatment={setViewingTreatment}
                setCenterView={setCenterView}
                patient={patient} rawData={rawData} invoices={invoices}
                kleinunternehmer={kleinunternehmer} practice={practice}
                onUpdateInvoice={onUpdateInvoice} onQuickInvoice={onQuickInvoice}
                setConfirmDeleteTreatment={setConfirmDeleteTreatment}
                downloadTreatmentDoc={downloadTreatmentDoc}
                pendingQuickInvoice={pendingQuickInvoice} setPendingQuickInvoice={setPendingQuickInvoice}
              />
            )}
          </div>
        </div>

        {/* ═══════════════════ RIGHT SIDEBAR: Historie ═══════════════════ */}
        <div className="w-full lg:w-96 xl:w-[28rem] bg-white rounded-lg border border-[#DFE3EB] shadow-sm overflow-hidden flex-shrink-0 lg:sticky lg:top-0 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
          <PatientTimeline
            patient={patient} patientDbId={patientDbId}
            matchingInvoices={matchingInvoices} patientBeh={patientBeh}
            activityLog={activityLog} lastActivity={lastActivity}
            onViewConsent={onViewConsent} onViewHV={onViewHV} onView={onView}
            setViewingTreatment={setViewingTreatment} setCenterView={setCenterView}
          />
        </div>
      </div>

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* Behandlungsdoku create/edit modal */}
      {centerView === "behandlungen_add" && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">{editingTreatmentInv ? "Behandlung bearbeiten" : "Neue Behandlungsdokumentation"}</h2>
              <button className="p-1 text-gray-400 hover:text-gray-600 transition" onClick={() => { setCenterView("timeline"); setEditingTreatmentInv(null); setNewTreatmentBehId(null); }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <BehandlungAddPanel
              patient={patient} email={email} rawData={rawData} patientDbId={patientDbId}
              matchingInvoices={matchingInvoices} rechnungsInvoices={rechnungsInvoices} copySourceDocs={copySourceDocs} practice={practice}
              editingTreatmentInv={editingTreatmentInv} setEditingTreatmentInv={setEditingTreatmentInv}
              newTreatmentMarkers={newTreatmentMarkers} setNewTreatmentMarkers={setNewTreatmentMarkers}
              newTreatmentInvoiceId={newTreatmentInvoiceId} setNewTreatmentInvoiceId={setNewTreatmentInvoiceId}
              newTreatmentEinheit={newTreatmentEinheit} setNewTreatmentEinheit={setNewTreatmentEinheit}
              newTreatmentPraeparat={newTreatmentPraeparat} setNewTreatmentPraeparat={setNewTreatmentPraeparat}
              newTreatmentDate={newTreatmentDate} setNewTreatmentDate={setNewTreatmentDate}
              newTreatmentNotes={newTreatmentNotes} setNewTreatmentNotes={setNewTreatmentNotes}
              newTreatmentAmount={newTreatmentAmount} setNewTreatmentAmount={setNewTreatmentAmount}
              newTreatmentFacePhoto={newTreatmentFacePhoto} setNewTreatmentFacePhoto={setNewTreatmentFacePhoto}
              newTreatmentBehId={newTreatmentBehId} setNewTreatmentBehId={setNewTreatmentBehId}
              onUpdateInvoice={onUpdateInvoice}
              setCenterView={setCenterView}
              setViewingTreatment={setViewingTreatment} setPendingQuickInvoice={setPendingQuickInvoice}
            />
          </div>
        </div>
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
          try {
            await onDeleteBehandlung(confirmDeleteBeh._id, { deleteDocs });
            showToast(deleteDocs && behDocCount > 0 ? "Behandlung und Dokumente gelöscht" : "Behandlung gelöscht");
            setConfirmDeleteBeh(null);
          } catch (e) {
            console.error("Delete Behandlung error:", e);
            showToast("Fehler beim Löschen: " + (e?.message || e), { error: true });
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
                  <button className="px-3 py-2 text-xs rounded border border-[#DFE3EB] text-gray-700 hover:bg-gray-50" onClick={() => runDelete(false)}>Nur Behandlung l&ouml;schen, Dokumente behalten</button>
                )}
                <button className="px-3 py-2 text-xs rounded bg-red-600 text-white hover:bg-red-700" onClick={() => runDelete(true)}>
                  {behDocCount > 0 ? `Behandlung mit ${behDocCount} Dokument${behDocCount === 1 ? "" : "en"} löschen` : "Behandlung löschen"}
                </button>
                <button className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700" onClick={() => setConfirmDeleteBeh(null)}>Abbrechen</button>
              </div>
            </div>
          </div>
        );
      })()}

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
