import React from "react";
import { fmtDate, fmtUnits, toDE } from "../../utils/helpers";
import { trackEvent } from "../../lib/analytics";
import PraeparatAutocomplete from "../ui/PraeparatAutocomplete";
import TreatmentMap from "../treatment/TreatmentMap";
import InfoTooltip, { Tooltip } from "../ui/InfoTooltip";
import { serializeMarkers } from "../treatment/markerUtils";
import { emptyPraeparat, getPraeparate, praepLetter, praeparatTotals, withPraeparate } from "../../utils/praeparate";
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
    const iso = d.treatmentDoc?.behandlungsDatum || d.invoiceMeta?.datum || "";
    const datum = iso ? fmtDate(iso) : "";
    const base = d._standalone
      ? "Behandlungsdoku"
      : d._hvOnly
        ? "Honorarvereinbarung"
        : (d.invoiceMeta?.nummer && d.invoiceMeta.nummer !== "—" ? d.invoiceMeta.nummer : "Rechnung");
    const n = (d.treatmentDoc?.markers || []).length;
    const punkte = n > 0 ? ` (${n} ${n === 1 ? "Punkt" : "Punkte"})` : "";
    return (datum ? `${datum} · ${base}` : base) + punkte;
  };

  const copyFromDoc = (id) => {
    const src = copySourceDocs.find((d) => String(d.id) === String(id));
    if (!src) return;
    // A documented treatment brings all its Präparate (the points refer to them by index); the
    // Chargennummer belongs to the earlier treatment and is never taken over
    if (src.treatmentDoc) {
      const list = getPraeparate(src.treatmentDoc).map((p) => ({ ...p, charge: "" }));
      setNewTreatmentPraeparate(list.length > 0 ? list : [emptyPraeparat()]);
      const srcMarkers = src.treatmentDoc.markers || [];
      setNewTreatmentMarkers(srcMarkers.map((m, i) => ({ ...m, id: Date.now() + i })));
      if (src.treatmentDoc.facePhoto) setNewTreatmentFacePhoto(src.treatmentDoc.facePhoto);
      return;
    }
    const first = { ...praeparate[0], name: src.praeparat || "", einheit: src.einheit || praeparate[0].einheit };
    // Transfer the documented injection points, if the source has any
    const srcMarkers = src.treatmentDoc?.markers || [];
    if (srcMarkers.length > 0) {
      // Keep every stored field (colour, Präparat, lines/fans, body region)
      setNewTreatmentMarkers(srcMarkers.map((m, i) => ({ ...m, id: Date.now() + i })));
      if (src.treatmentDoc?.facePhoto) setNewTreatmentFacePhoto(src.treatmentDoc.facePhoto);
    } else {
      const menge = src.mlStr || (src.ml != null ? toDE(src.ml) : "");
      if (menge) first.amount = menge;
    }
    setNewTreatmentPraeparate([first, ...praeparate.slice(1)]);
  };

  const inputCls = "w-full border border-[#DFE3EB] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
  const sectionTitle = (text, extra) => (
    <div className="flex items-center gap-1.5 mb-2.5">
      <h3 className="text-sm font-semibold text-gray-800">{text}</h3>
      {extra}
    </div>
  );
  const fieldLabel = "block text-xs font-medium text-gray-500 mb-1";
  // The patient hint is rarely used, so it stays folded until asked for (or already filled)
  const [showHinweis, setShowHinweis] = React.useState(!!(patientHinweis || patientBetrag));

  return (
    <div className="px-4 sm:px-6 pt-5">

      {/* Behandlung: Datum + optional copy from an existing document */}
      <section className="pb-5">
        {sectionTitle("Behandlung")}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={fieldLabel}>Datum</label>
            <input
              type="date"
              className={inputCls + " bg-white"}
              style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light" }}
              value={newTreatmentDate}
              onChange={(e) => setNewTreatmentDate(e.target.value)}
            />
            {newTreatmentBehId && <p className="text-[11px] text-gray-400 mt-1">Ändert auch den Termin in der Übersicht.</p>}
          </div>
          {copySourceDocs.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="text-xs font-medium text-gray-500">Aus fr&uuml;herer Behandlung &uuml;bernehmen</label>
                <InfoTooltip>Pr&auml;parate und Injektionspunkte aus einer fr&uuml;heren Behandlungsdoku, Rechnung oder Honorarvereinbarung &uuml;bernehmen. Die Chargennummer wird nicht &uuml;bernommen. Es entsteht keine Verkn&uuml;pfung, alle Felder bleiben frei bearbeitbar.</InfoTooltip>
              </div>
              <Select
                className={inputCls + " bg-white"}
                value={newTreatmentInvoiceId || ""}
                onChange={(e) => { const v = e.target.value; setNewTreatmentInvoiceId(v || null); if (v) copyFromDoc(v); }}
              >
                <option value="">Kein Dokument</option>
                {copySourceDocs.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {docLabel(inv)}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </section>

      {/* Präparat(e) */}
      <section className="py-5 border-t border-gray-100">
        {sectionTitle(multiPraep ? "Präparate" : "Präparat", <InfoTooltip>H&auml;ufig verwendete Pr&auml;parate kannst Du in den Praxis-Einstellungen speichern, um sie hier schnell auszuw&auml;hlen. Mit „Weiteres Pr&auml;parat“ dokumentierst Du mehrere Produkte in einer Sitzung, z.B. zwei Botulinum-Pr&auml;parate f&uuml;r verschiedene Regionen.</InfoTooltip>)}
        <div className="space-y-2">
          {praeparate.map((p, idx) => {
            const t = totals[idx];
            return (
              <div key={idx} className="grid gap-2 items-end" style={{ gridTemplateColumns: multiPraep ? "18px minmax(0,1fr) 84px 76px 110px 28px" : "minmax(0,1fr) 84px 76px 110px" }}>
                {multiPraep && (
                  <div className="pb-2.5">
                    <span className="block text-[10px] font-bold rounded bg-gray-800 text-white text-center" style={{ width: 18, height: 18, lineHeight: "18px" }}>{praepLetter(idx)}</span>
                  </div>
                )}
                <div>
                  {idx === 0 && <label className={fieldLabel}>Name</label>}
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
                    <label className={fieldLabel + " flex items-center gap-1"}>
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
                  {idx === 0 && <label className={fieldLabel}>Einheit</label>}
                  <Select className={inputCls + " bg-white"} value={p.einheit} onChange={(e) => updatePraep(idx, { einheit: e.target.value })}>
                    <option value="ml">ml</option>
                    <option value="SE">SE</option>
                    <option value="IE">IE</option>
                  </Select>
                </div>
                <div>
                  {idx === 0 && <label className={fieldLabel}>Charge</label>}
                  <input
                    className={inputCls + (isFillerPraep(p) && !(p.charge || "").trim() ? " border-amber-400" : "")}
                    value={p.charge || ""}
                    placeholder={isFillerPraep(p) ? "Pflicht" : "optional"}
                    onChange={(e) => updatePraep(idx, { charge: e.target.value })}
                  />
                </div>
                {multiPraep && (
                  <div className="pb-1">
                    <button type="button" className="p-1.5 rounded text-gray-300 hover:text-red-500 transition" title="Pr&auml;parat entfernen" onClick={() => removePraep(idx)}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" className="mt-2.5 text-sm text-blue-600 hover:text-blue-700 font-medium" onClick={addPraep}>+ Weiteres Pr&auml;parat</button>
        {multiPraep && hasMarkers && (
          <p className="text-[11px] text-gray-400 mt-1.5">Die Buchstaben in den Punkten zeigen das Pr&auml;parat. Beim Setzen eines Punkts w&auml;hlst Du das Pr&auml;parat aus.</p>
        )}
      </section>

      {/* Injektionspunkte */}
      <section className="py-5 border-t border-gray-100">
        {sectionTitle("Injektionspunkte", <span className="text-xs text-gray-400">optional</span>)}
        <TreatmentMap markers={newTreatmentMarkers} setMarkers={setNewTreatmentMarkers} einheit={activeEinheit} facePhoto={newTreatmentFacePhoto} onFacePhotoChange={setNewTreatmentFacePhoto} praeparate={praeparate} />
      </section>

      {/* Notizen + Hinweis für Patient:in */}
      <section className="py-5 border-t border-gray-100">
        {sectionTitle("Notizen", <span className="text-xs text-gray-400">intern, nicht auf dem PDF</span>)}
        <textarea
          className={inputCls}
          rows={3}
          placeholder="z.B. Verlauf, Besonderheiten, Absprachen …"
          value={newTreatmentNotes}
          onChange={(e) => setNewTreatmentNotes(e.target.value)}
        />
        {!showHinweis ? (
          <button type="button" className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium" onClick={() => setShowHinweis(true)}>+ Hinweis f&uuml;r Patient:in</button>
        ) : (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-xs font-medium text-gray-500">Hinweis f&uuml;r Patient:in</label>
              <InfoTooltip>Dieser Text wird auf die Behandlungsdokumentation gedruckt. Mit Betrag erscheinen zus&auml;tzlich Deine Bankdaten aus den Praxis-Einstellungen, z.B. wenn nur Materialkosten ohne Rechnung bezahlt werden.</InfoTooltip>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px] items-start">
              <textarea
                className={inputCls}
                rows={2}
                autoFocus={!patientHinweis}
                placeholder="Steht auf dem PDF, z.B. „Bitte überweise die Materialkosten innerhalb von 14 Tagen.“"
                value={patientHinweis}
                onChange={(e) => setPatientHinweis(e.target.value)}
              />
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputCls + " pr-7"}
                  placeholder="Betrag"
                  title="Zu zahlender Betrag (optional)"
                  value={patientBetrag}
                  onChange={(e) => setPatientBetrag(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">&euro;</span>
              </div>
            </div>
          </div>
        )}
      </section>

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
          setShowHinweis(false);
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
          <div className="py-4 border-t border-gray-100 flex items-center gap-3 flex-wrap">
            {missingCharge && <span className="text-xs text-amber-600 mr-auto">Bitte die Chargennummer des Fillers eintragen (Rückverfolgbarkeit, § 630f BGB).</span>}
            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
              {!editingTreatmentInv && (
                <button
                  className="px-4 py-2 text-sm rounded-lg border border-[#DFE3EB] bg-white text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                  disabled={!quickEnabled}
                  title={quickEnabled ? undefined : "Dafür braucht es Präparat und Menge (oder Injektionspunkte)."}
                  onClick={() => quickEnabled && saveTreatment(true)}
                >
                  Speichern &amp; Rechnung erstellen
                </button>
              )}
              <button
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-blue-500 hover:bg-blue-600 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={missingCharge}
                title={missingCharge ? "Bei Dermalfillern ist die Chargennummer Pflicht." : undefined}
                onClick={() => !missingCharge && saveTreatment(false)}
              >
                Speichern
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
