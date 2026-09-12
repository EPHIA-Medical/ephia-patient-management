import React from "react";
import { fmtDate, evalAmount, fmtUnits, toDE } from "../../utils/helpers";
import { trackEvent } from "../../lib/analytics";
import PraeparatAutocomplete from "../ui/PraeparatAutocomplete";
import TreatmentMap from "../treatment/TreatmentMap";
import InfoTooltip from "../ui/InfoTooltip";
import { serializeMarkers } from "../treatment/markerUtils";

export default function BehandlungAddPanel({
  patient, email, rawData, patientDbId, matchingInvoices, rechnungsInvoices, copySourceDocs = [], practice,
  editingTreatmentInv, setEditingTreatmentInv,
  newTreatmentMarkers, setNewTreatmentMarkers,
  newTreatmentInvoiceId, setNewTreatmentInvoiceId,
  newTreatmentEinheit, setNewTreatmentEinheit,
  newTreatmentPraeparat, setNewTreatmentPraeparat,
  newTreatmentDate, setNewTreatmentDate,
  newTreatmentNotes, setNewTreatmentNotes,
  newTreatmentAmount, setNewTreatmentAmount,
  newTreatmentFacePhoto, setNewTreatmentFacePhoto,
  newTreatmentBehId, setNewTreatmentBehId,
  onUpdateInvoice,
  setCenterView,
  setViewingTreatment, setPendingQuickInvoice,
}) {
  const activeEinheit = newTreatmentEinheit;

  const docLabel = (d) => {
    const datum = d.invoiceMeta?.datum ? fmtDate(d.invoiceMeta.datum) : "";
    const base = d._hvOnly
      ? "Honorarvereinbarung"
      : (d.invoiceMeta?.nummer && d.invoiceMeta.nummer !== "—" ? d.invoiceMeta.nummer : "Rechnung");
    return datum ? `${base} — ${datum}` : base;
  };

  const copyFromDoc = (id) => {
    const src = copySourceDocs.find((d) => String(d.id) === String(id));
    if (!src) return;
    setNewTreatmentPraeparat(src.praeparat || "");
    if (src.einheit) setNewTreatmentEinheit(src.einheit);
    // Transfer the documented injection points, if the source has any
    const srcMarkers = src.treatmentDoc?.markers || [];
    if (srcMarkers.length > 0) {
      setNewTreatmentMarkers(srcMarkers.map((m, i) => ({ id: Date.now() + i, x: m.x, y: m.y, amount: m.amount, ...(m.color ? { color: m.color } : {}) })));
      if (src.treatmentDoc?.facePhoto) setNewTreatmentFacePhoto(src.treatmentDoc.facePhoto);
    } else {
      const menge = src.mlStr || (src.ml != null ? toDE(src.ml) : "");
      if (menge) setNewTreatmentAmount(menge);
    }
  };

  return (
    <div className="px-3 sm:px-5 py-4" style={{ maxWidth: 780 }}>

      <div className="flex flex-col sm:flex-row gap-5">
        {/* Left column: Details + Notizen */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">Behandlungsdetails</p>
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Datum *</label>
              <input
                type="date"
                className="w-full border border-[#DFE3EB] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light" }}
                value={newTreatmentDate}
                onChange={(e) => setNewTreatmentDate(e.target.value)}
              />
            </div>
            {copySourceDocs.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-0.5">
                  <label className="block text-xs font-medium text-gray-500">Daten aus Dokument &uuml;bertragen</label>
                  <InfoTooltip>Pr&auml;parat, Menge und Einheit aus einer bestehenden Rechnung oder Honorarvereinbarung &uuml;bernehmen. Es wird keine Verkn&uuml;pfung erstellt &mdash; die Felder lassen sich danach frei bearbeiten.</InfoTooltip>
                </div>
                <select
                  className="w-full border border-[#DFE3EB] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  value={newTreatmentInvoiceId || ""}
                  onChange={(e) => { const v = e.target.value; setNewTreatmentInvoiceId(v || null); if (v) copyFromDoc(v); }}
                >
                  <option value="">&mdash; Dokument w&auml;hlen &mdash;</option>
                  {copySourceDocs.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {docLabel(inv)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">Notizen</p>
          <textarea
            className="w-full border border-[#DFE3EB] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            rows={4}
            placeholder="Optionale Notizen zur Behandlung…"
            value={newTreatmentNotes}
            onChange={(e) => setNewTreatmentNotes(e.target.value)}
          />
        </div>

        {/* Right column: Praeparat + Injektionspunkte */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Pr&auml;parat</p>
                <InfoTooltip>H&auml;ufig verwendete Pr&auml;parate kannst Du in den Praxis-Einstellungen speichern, um sie hier schnell auszuw&auml;hlen.</InfoTooltip>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Name</label>
                  <PraeparatAutocomplete
                    className="w-full border border-[#DFE3EB] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={newTreatmentPraeparat}
                    placeholder="z.B. Bocouture"
                    suggestions={(practice.praeparate || []).filter(p => p.name)}
                    onChange={(v) => setNewTreatmentPraeparat(v)}
                    onSelect={(p) => {
                      setNewTreatmentPraeparat(p.name);
                      if (p.einheit) setNewTreatmentEinheit(p.einheit);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                    Menge
                    <span className="relative group">
                      <svg className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 cursor-help transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[11px] leading-tight text-white bg-gray-800 rounded-md shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">Wird automatisch berechnet, wenn<br/>Injektionspunkte dokumentiert werden.</span>
                    </span>
                  </label>
                  <input
                    className="w-full border border-[#DFE3EB] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={newTreatmentMarkers.length > 0 ? fmtUnits(newTreatmentMarkers) : newTreatmentAmount}
                    placeholder="z.B. 8,4"
                    readOnly={newTreatmentMarkers.length > 0}
                    onChange={(e) => { if (newTreatmentMarkers.length === 0) setNewTreatmentAmount(e.target.value); }}
                    style={newTreatmentMarkers.length > 0 ? { background: "#f9fafb", color: "#6b7280" } : {}}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Einheit</label>
                  <select className="w-full border border-[#DFE3EB] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" value={newTreatmentEinheit} onChange={(e) => setNewTreatmentEinheit(e.target.value)}>
                    <option value="ml">ml</option>
                    <option value="SE">SE</option>
                    <option value="IE">IE</option>
                  </select>
                </div>
              </div>

          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">Injektionspunkte <span className="normal-case tracking-normal text-gray-300">(optional)</span></p>
          <div className="bg-gray-50 rounded-lg p-3">
            <TreatmentMap markers={newTreatmentMarkers} setMarkers={setNewTreatmentMarkers} einheit={activeEinheit} facePhoto={newTreatmentFacePhoto} onFacePhotoChange={setNewTreatmentFacePhoto} />
          </div>
        </div>
      </div>

      {newTreatmentDate && (() => {
        const saveTreatment = (openQuickInvoice) => {
          const effectiveAmount = newTreatmentMarkers.length > 0 ? fmtUnits(newTreatmentMarkers) : newTreatmentAmount;
          const treatmentData = {
            markers: serializeMarkers(newTreatmentMarkers),
            behandlungsDatum: newTreatmentDate,
            praeparat: newTreatmentPraeparat,
            einheit: activeEinheit,
            notes: newTreatmentNotes.trim() || "",
            amount: effectiveAmount || "",
            facePhoto: newTreatmentFacePhoto || "",
          };
          let savedEntry = null;
          if (editingTreatmentInv) {
            const updated = { ...editingTreatmentInv, treatmentDoc: { ...editingTreatmentInv.treatmentDoc, ...treatmentData } };
            if (onUpdateInvoice) onUpdateInvoice(updated);
            savedEntry = updated;
          } else {
            const standaloneId = "treat-" + Date.now();
            const standaloneEntry = {
              id: standaloneId,
              patient: { vorname: patient.vorname, nachname: patient.nachname, email: patient.email || email },
              _patientDbId: patientDbId || null,
              _behandlungId: newTreatmentBehId || null,
              invoiceMeta: { nummer: "\u2014", datum: "" },
              lineItems: [],
              treatmentDoc: treatmentData,
              savedAt: new Date().toISOString(),
              _standalone: true,
            };
            if (onUpdateInvoice) onUpdateInvoice(standaloneEntry, true);
            trackEvent("treatment_doc_created", { standalone: true }, null);
            savedEntry = standaloneEntry;
          }
          setNewTreatmentMarkers([]);
          setNewTreatmentInvoiceId(null);
          setNewTreatmentPraeparat("");
          setNewTreatmentEinheit("SE");
          setNewTreatmentDate(new Date().toISOString().slice(0, 10));
          setNewTreatmentNotes("");
          setNewTreatmentAmount("");
          if (setNewTreatmentBehId) setNewTreatmentBehId(null);
          setEditingTreatmentInv(null);

          if (openQuickInvoice && savedEntry) {
            setViewingTreatment(savedEntry);
            setPendingQuickInvoice(true);
            setCenterView("behandlung_detail");
          } else {
            setCenterView("timeline");
          }
        };

        const hasPraep = newTreatmentPraeparat;
        const hasAmount = newTreatmentMarkers.length > 0 || newTreatmentAmount;
        const quickEnabled = !editingTreatmentInv && hasPraep && hasAmount;

        return (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button
              className="px-4 py-2 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition"
              onClick={() => saveTreatment(false)}
            >
              Behandlung speichern
            </button>
            <button
              className={`px-4 py-2 text-sm rounded-lg text-white transition ${quickEnabled ? "bg-green-500 hover:bg-green-600" : "bg-gray-300 cursor-not-allowed"}`}
              disabled={!quickEnabled}
              onClick={() => quickEnabled && saveTreatment(true)}
            >
              Speichern &amp; Schnellrechnung erstellen
            </button>
          </div>
        );
      })()}
    </div>
  );
}
