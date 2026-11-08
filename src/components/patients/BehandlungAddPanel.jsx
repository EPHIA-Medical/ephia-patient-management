import React from "react";
import { fmtDate, fmtUnits, toDE } from "../../utils/helpers";
import { trackEvent } from "../../lib/analytics";
import PraeparatAutocomplete from "../ui/PraeparatAutocomplete";
import TreatmentMap from "../treatment/TreatmentMap";
import InfoTooltip, { Tooltip } from "../ui/InfoTooltip";
import { serializeMarkers } from "../treatment/markerUtils";
import { emptyPraeparat, praepLetter, praeparatTotals, withPraeparate } from "../../utils/praeparate";
import Select from "../ui/Select";

export default function BehandlungAddPanel({
  patient, email, rawData, patientDbId, matchingInvoices, rechnungsInvoices, copySourceDocs = [], practice,
  editingTreatmentInv, setEditingTreatmentInv,
  newTreatmentMarkers, setNewTreatmentMarkers,
  newTreatmentInvoiceId, setNewTreatmentInvoiceId,
  newTreatmentPraeparate, setNewTreatmentPraeparate,
  newTreatmentDate, setNewTreatmentDate,
  newTreatmentNotes, setNewTreatmentNotes,
  newTreatmentFacePhoto, setNewTreatmentFacePhoto,
  newTreatmentBehId, setNewTreatmentBehId,
  onUpdateInvoice,
  setCenterView,
  setViewingTreatment, setPendingQuickInvoice,
}) {
  // Präparate used in this session; the first one drives the unit of the map
  const praeparate = newTreatmentPraeparate && newTreatmentPraeparate.length > 0 ? newTreatmentPraeparate : [emptyPraeparat()];
  const multiPraep = praeparate.length > 1;
  const activeEinheit = praeparate[0].einheit || "SE";
  const hasMarkers = newTreatmentMarkers.length > 0;
  // Präparate the practice has saved as Dermalfiller need a Chargennummer (Klasse-III-Medizinprodukt)
  const fillerNames = new Set((practice.praeparate || []).filter((s) => s.typ === "filler" && s.name).map((s) => s.name.trim().toLowerCase()));
  const isFillerPraep = (p) => fillerNames.has((p.name || "").trim().toLowerCase());
  const missingCharge = praeparate.some((p) => isFillerPraep(p) && !(p.charge || "").trim());
  // Units per Präparat from the placed points
  const totals = praeparatTotals({ praeparate, markers: newTreatmentMarkers });

  const updatePraep = (idx, patch) => setNewTreatmentPraeparate(praeparate.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const addPraep = () => setNewTreatmentPraeparate([...praeparate, emptyPraeparat(activeEinheit)]);
  const removePraep = (idx) => {
    if (praeparate.length < 2) return;
    setNewTreatmentPraeparate(praeparate.filter((_, i) => i !== idx));
    // Points of the removed Präparat fall back to the first one; later ones shift down
    setNewTreatmentMarkers(newTreatmentMarkers.map((m) => {
      const p = m.p || 0;
      if (p === idx) { const { p: _p, ...rest } = m; return rest; }
      if (p > idx) return { ...m, p: p - 1 };
      return m;
    }));
  };

  // Patient-facing note + optional amount (printed on the Behandlungsdoku PDF, unlike internal Notizen)
  const [patientHinweis, setPatientHinweis] = React.useState(editingTreatmentInv?.treatmentDoc?.patientHinweis || "");
  const [patientBetrag, setPatientBetrag] = React.useState(editingTreatmentInv?.treatmentDoc?.patientBetrag || "");

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
    const first = { ...praeparate[0], name: src.praeparat || "", einheit: src.einheit || praeparate[0].einheit };
    // Transfer the documented injection points, if the source has any
    const srcMarkers = src.treatmentDoc?.markers || [];
    if (srcMarkers.length > 0) {
      setNewTreatmentMarkers(srcMarkers.map((m, i) => ({ id: Date.now() + i, x: m.x, y: m.y, amount: m.amount, ...(m.color ? { color: m.color } : {}) })));
      if (src.treatmentDoc?.facePhoto) setNewTreatmentFacePhoto(src.treatmentDoc.facePhoto);
    } else {
      const menge = src.mlStr || (src.ml != null ? toDE(src.ml) : "");
      if (menge) first.amount = menge;
    }
    setNewTreatmentPraeparate([first, ...praeparate.slice(1)]);
  };

  const inputCls = "w-full border border-[#DFE3EB] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";

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
                className={inputCls + " bg-white"}
                style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light" }}
                value={newTreatmentDate}
                onChange={(e) => setNewTreatmentDate(e.target.value)}
              />
              {newTreatmentBehId && <p className="text-[10px] text-gray-400 mt-1">Vorbelegt mit dem Termin der Behandlung. Änderst Du das Datum, wird der Behandlungstermin in der Übersicht mit angepasst.</p>}
            </div>
            {copySourceDocs.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-0.5">
                  <label className="block text-xs font-medium text-gray-500">Daten aus Dokument &uuml;bertragen</label>
                  <InfoTooltip>Pr&auml;parat, Menge und Einheit aus einer bestehenden Rechnung oder Honorarvereinbarung &uuml;bernehmen. Es wird keine Verkn&uuml;pfung erstellt &mdash; die Felder lassen sich danach frei bearbeiten.</InfoTooltip>
                </div>
                <Select
                  className={inputCls + " bg-white"}
                  value={newTreatmentInvoiceId || ""}
                  onChange={(e) => { const v = e.target.value; setNewTreatmentInvoiceId(v || null); if (v) copyFromDoc(v); }}
                >
                  <option value="">&mdash; Dokument w&auml;hlen &mdash;</option>
                  {copySourceDocs.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {docLabel(inv)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">Notizen</p>
          <textarea
            className={inputCls}
            rows={4}
            placeholder="Optionale Notizen zur Behandlung…"
            value={newTreatmentNotes}
            onChange={(e) => setNewTreatmentNotes(e.target.value)}
          />
          <p className="text-[10px] text-gray-400 mt-1 mb-3">Notizen sind intern und erscheinen nicht auf dem PDF.</p>

          <div className="flex items-center gap-1 mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Hinweis f&uuml;r Patient:in</p>
            <InfoTooltip>Dieser Text wird auf die Behandlungsdokumentation gedruckt. Mit Betrag erscheinen zus&auml;tzlich Deine Bankdaten aus den Praxis-Einstellungen, z.B. wenn nur Materialkosten ohne Rechnung bezahlt werden.</InfoTooltip>
          </div>
          <textarea
            className={inputCls}
            rows={3}
            placeholder="Optional, z.B. „Bitte überweise die Materialkosten innerhalb von 14 Tagen.“"
            value={patientHinweis}
            onChange={(e) => setPatientHinweis(e.target.value)}
          />
          <div className="mt-2">
            <label className="block text-xs font-medium text-gray-500 mb-0.5">Zu zahlender Betrag (optional)</label>
            <div className="relative w-36">
              <input
                type="text"
                inputMode="decimal"
                className={inputCls + " pr-7"}
                placeholder="z.B. 45,00"
                value={patientBetrag}
                onChange={(e) => setPatientBetrag(e.target.value)}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">&euro;</span>
            </div>
          </div>
        </div>

        {/* Right column: Praeparate + Injektionspunkte */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{multiPraep ? "Präparate" : "Präparat"}</p>
            <InfoTooltip>H&auml;ufig verwendete Pr&auml;parate kannst Du in den Praxis-Einstellungen speichern, um sie hier schnell auszuw&auml;hlen. Mit „Weiteres Pr&auml;parat“ dokumentierst Du mehrere Produkte in einer Sitzung, z.B. zwei Botulinum-Pr&auml;parate f&uuml;r verschiedene Regionen.</InfoTooltip>
          </div>
          <div className="space-y-2 mb-2">
            {praeparate.map((p, idx) => {
              const t = totals[idx];
              return (
                <div key={idx} className="grid gap-2" style={{ gridTemplateColumns: multiPraep ? "18px 1fr 76px 72px 96px 28px" : "1fr 76px 72px 96px" }}>
                  {multiPraep && (
                    <div className="flex items-end pb-1.5">
                      <span className="text-[10px] font-bold rounded bg-gray-800 text-white text-center" style={{ width: 18, height: 18, lineHeight: "18px" }}>{praepLetter(idx)}</span>
                    </div>
                  )}
                  <div>
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-0.5">Name</label>}
                    <PraeparatAutocomplete
                      className={inputCls}
                      value={p.name}
                      placeholder="z.B. Bocouture"
                      suggestions={(practice.praeparate || []).filter((s) => s.name)}
                      onChange={(v) => updatePraep(idx, { name: v })}
                      onSelect={(s) => updatePraep(idx, { name: s.name, ...(s.einheit && s.einheit !== "Spritze" ? { einheit: s.einheit } : s.typ === "filler" ? { einheit: "ml" } : {}) })}
                    />
                  </div>
                  <div>
                    {idx === 0 && (
                      <label className="block text-xs font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                        Menge
                        <Tooltip content={"Wird automatisch berechnet, wenn Injektionspunkte dokumentiert werden."} width={220}>
                          <svg className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 cursor-help transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </Tooltip>
                      </label>
                    )}
                    <input
                      className={inputCls}
                      value={hasMarkers ? (t.units > 0 ? fmtUnits(newTreatmentMarkers.filter((m) => (m.p || 0) === idx)) : "") : p.amount}
                      placeholder={hasMarkers ? "–" : "z.B. 8,4"}
                      readOnly={hasMarkers}
                      onChange={(e) => { if (!hasMarkers) updatePraep(idx, { amount: e.target.value }); }}
                      style={hasMarkers ? { background: "#f9fafb", color: "#6b7280" } : {}}
                    />
                  </div>
                  <div>
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-0.5">Einheit</label>}
                    <Select className={inputCls + " bg-white"} value={p.einheit} onChange={(e) => updatePraep(idx, { einheit: e.target.value })}>
                      <option value="ml">ml</option>
                      <option value="SE">SE</option>
                      <option value="IE">IE</option>
                    </Select>
                  </div>
                  <div>
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-0.5">Charge</label>}
                    <input
                      className={inputCls + (isFillerPraep(p) && !(p.charge || "").trim() ? " border-amber-400" : "")}
                      value={p.charge || ""}
                      placeholder={isFillerPraep(p) ? "Pflicht" : "optional"}
                      onChange={(e) => updatePraep(idx, { charge: e.target.value })}
                    />
                  </div>
                  {multiPraep && (
                    <div className="flex items-end">
                      <button type="button" className="p-1.5 rounded text-gray-300 hover:text-red-500 transition" title="Pr&auml;parat entfernen" onClick={() => removePraep(idx)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="text-xs text-blue-500 hover:text-blue-700 font-medium mb-4" onClick={addPraep}>+ Weiteres Pr&auml;parat</button>
          {multiPraep && hasMarkers && (
            <p className="text-[10px] text-gray-400 -mt-3 mb-4">Die Buchstaben in den Punkten zeigen das Pr&auml;parat. Beim Setzen eines Punkts w&auml;hlst Du das Pr&auml;parat aus.</p>
          )}

          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1.5">Injektionspunkte <span className="normal-case tracking-normal text-gray-300">(optional)</span></p>
          <div className="bg-gray-50 rounded-lg p-3">
            <TreatmentMap markers={newTreatmentMarkers} setMarkers={setNewTreatmentMarkers} einheit={activeEinheit} facePhoto={newTreatmentFacePhoto} onFacePhotoChange={setNewTreatmentFacePhoto} praeparate={praeparate} />
          </div>
        </div>
      </div>

      {newTreatmentDate && (() => {
        const saveTreatment = (openQuickInvoice) => {
          const base = {
            markers: serializeMarkers(newTreatmentMarkers),
            behandlungsDatum: newTreatmentDate,
            notes: newTreatmentNotes.trim() || "",
            patientHinweis: patientHinweis.trim() || "",
            patientBetrag: patientBetrag.trim() || "",
            facePhoto: newTreatmentFacePhoto || "",
          };
          const treatmentData = withPraeparate(base, praeparate);
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
              invoiceMeta: { nummer: "—", datum: "" },
              lineItems: [],
              treatmentDoc: treatmentData,
              savedAt: new Date().toISOString(),
              _standalone: true,
            };
            if (onUpdateInvoice) onUpdateInvoice(standaloneEntry, true);
            trackEvent("treatment_doc_created", { standalone: true, praeparate: praeparate.length }, null);
            savedEntry = standaloneEntry;
          }
          setNewTreatmentMarkers([]);
          setNewTreatmentInvoiceId(null);
          setNewTreatmentPraeparate([emptyPraeparat()]);
          setNewTreatmentDate(new Date().toISOString().slice(0, 10));
          setNewTreatmentNotes("");
          setPatientHinweis("");
          setPatientBetrag("");
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

        const hasPraep = praeparate.every((p) => p.name.trim());
        const hasAmount = hasMarkers || praeparate.every((p) => p.amount);
        const quickEnabled = !editingTreatmentInv && hasPraep && hasAmount && !missingCharge;

        return (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button
              className={`px-4 py-2 text-sm rounded-lg text-white transition ${missingCharge ? "bg-gray-300 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600"}`}
              disabled={missingCharge}
              title={missingCharge ? "Bei Dermalfillern ist die Chargennummer Pflicht." : undefined}
              onClick={() => !missingCharge && saveTreatment(false)}
            >
              Behandlung speichern
            </button>
            {missingCharge && <span className="text-xs text-amber-600">Bitte die Chargennummer des Fillers eintragen (Rückverfolgbarkeit, § 630f BGB).</span>}
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
