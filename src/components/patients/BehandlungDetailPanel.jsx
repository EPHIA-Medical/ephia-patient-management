import React, { useState, useEffect } from "react";
import { fmtDate, todayLocal, parseDE, toDE, evalAmount, buildLineItems, calcWeightedForGesamt, calcGesamt, fmtUnits, nextInvoiceNumber, fmtBetrag } from "../../utils/helpers";
import { MarkerDot, serializeMarkers, fmtNum } from "../treatment/markerUtils";
import { getPraeparate, praeparatTotals, praepMengeStr, praepLetter, markerPraepIdx, emptyPraeparat, withPraeparate } from "../../utils/praeparate";
import PraeparatAutocomplete from "../ui/PraeparatAutocomplete";
import Select from "../ui/Select";
import { VectorSummary, VectorLegend } from "../treatment/vectors";
import TreatmentMap from "../treatment/TreatmentMap";
import { ChartFigure } from "../treatment/ChartFigure";
import { CHARTS, markerView, usedViews } from "../treatment/charts";
import { HV_THRESHOLD, maxGesamtWithin, HV_WAIVER_TEXT } from "../../utils/hvRules";
import { isGuide, treatmentPoints } from "../../utils/markers";

export default function BehandlungDetailPanel({
  viewingTreatment, setViewingTreatment,
  setCenterView,
  patient, rawData, invoices, kleinunternehmer, practice,
  onUpdateInvoice, onQuickInvoice,
  setConfirmDeleteTreatment,
  downloadTreatmentDoc, onSendTreatmentDoc,
  pendingQuickInvoice, setPendingQuickInvoice, inModal = false, onStartHvFromValues,
}) {
  // Inline editing states (local to this component)
  const [editFace, setEditFace] = useState(false);
  const [editDate, setEditDate] = useState(false);
  const [editPraep, setEditPraep] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [inlineTempDate, setInlineTempDate] = useState("");
  const [inlineTempPraeparate, setInlineTempPraeparate] = useState([]);
  const [inlineTempNotes, setInlineTempNotes] = useState("");
  const [editHinweis, setEditHinweis] = useState(false);
  const [inlineTempHinweis, setInlineTempHinweis] = useState("");
  const [inlineTempBetrag, setInlineTempBetrag] = useState("");
  const [inlineTempMarkers, setInlineTempMarkers] = useState([]);
  const [inlineTempPhoto, setInlineTempPhoto] = useState("");
  // Region shown in the large chart when points sit on several regions
  const [displayView, setDisplayView] = useState(null);

  // Quick-invoice modal states (local to this component)
  const [quickInvoiceOpen, setQuickInvoiceOpen] = useState(false);
  const [quickInvoiceNummer, setQuickInvoiceNummer] = useState("");
  const [quickInvoiceWunschStr, setQuickInvoiceWunschStr] = useState("");
  const [quickInvoicePreisStr, setQuickInvoicePreisStr] = useState("");
  const [quickInvoiceExtraPreis, setQuickInvoiceExtraPreis] = useState({});
  const [quickInvoiceSaving, setQuickInvoiceSaving] = useState(false);
  const [quickInvoiceBegruendung, setQuickInvoiceBegruendung] = useState("");
  const [quickInvoiceHvVerzicht, setQuickInvoiceHvVerzicht] = useState(false);

  const inv = viewingTreatment;
  const td = inv.treatmentDoc || {};
  const einh = td.einheit || inv.einheit || "SE";
  const praep = td.praeparat || inv.praeparat || "";
  // Präparate of this session; every point belongs to one of them (marker.p)
  const praeparate = getPraeparate({ ...td, praeparat: praep, einheit: einh });
  const praepCount = praeparate.length;
  const multiPraep = praepCount > 1;
  const praepTotals = praeparatTotals({ ...td, praeparat: praep, einheit: einh });
  const unitFor = (m) => (multiPraep ? (praeparate[markerPraepIdx(m, praepCount)]?.einheit || einh) : einh);
  const datumStr = td.behandlungsDatum ? fmtDate(td.behandlungsDatum) : "–";
  const hasInvoice = inv.invoiceMeta?.nummer && inv.invoiceMeta.nummer !== "—";
  // Markierungen (guide lines) are drawn on the chart but are not points
  const markerCount = treatmentPoints(td.markers).length;
  const hasChartMarks = (td.markers || []).length > 0;
  const detailViews = usedViews(td.markers || []);
  const shownView = detailViews.includes(displayView) ? displayView : detailViews[0];
  const totalUnits = Math.round((td.markers || []).reduce((s, m) => s + evalAmount(m.amount), 0) * 100) / 100;
  const totalUnitsStr = fmtUnits(td.markers || []);
  const sameEinh = praepTotals.every((t) => t.einheit === praepTotals[0].einheit);
  const praepSummary = praepTotals.map((t) => [t.name || `Präparat ${t.letter}`, praepMengeStr(t)].filter(Boolean).join(" ")).join(" · ");

  // Click-to-edit: the whole field opens its editor; a click that ends a text selection does not
  const clickEdit = (open) => ({
    role: "button",
    tabIndex: 0,
    title: "Klicken zum Bearbeiten",
    onClick: () => { if (window.getSelection && String(window.getSelection()).length > 0) return; open(); },
    onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); open(); } },
  });
  const editableCls = "group/edit block cursor-pointer rounded-md -mx-2 px-2 py-1 hover:bg-gray-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-300 transition";
  const editHint = (
    <svg className="w-3.5 h-3.5 text-gray-300 group-hover/edit:text-blue-500 transition flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
  );
  const fieldLabel = (text) => (
    <div className="flex items-center gap-1.5"><span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{text}</span>{editHint}</div>
  );
  const inputCls = "border border-[#DFE3EB] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";

  const openFaceEditor = () => { setInlineTempMarkers((td.markers || []).map((m, i) => ({ id: Date.now() + i, ...m }))); setInlineTempPhoto(td.facePhoto || ""); setEditFace(true); };

  const saveInlineField = (field, value) => {
    let updatedTd = { ...td };
    if (field === "date") updatedTd.behandlungsDatum = value;
    if (field === "praeparate") updatedTd = withPraeparate(updatedTd, value);
    if (field === "notes") updatedTd.notes = value;
    if (field === "hinweis") { updatedTd.patientHinweis = (value.text || "").trim(); updatedTd.patientBetrag = (value.betrag || "").trim(); }
    if (field === "markers") updatedTd.markers = serializeMarkers(value);
    const updated = { ...inv, treatmentDoc: updatedTd, lastModifiedAt: new Date().toISOString() };
    if (onUpdateInvoice) onUpdateInvoice(updated);
    setViewingTreatment(updated);
  };

  const startEditPraep = () => { setInlineTempPraeparate(praeparate.map((p) => ({ ...p }))); setEditPraep(true); };
  const savePraep = () => {
    const list = inlineTempPraeparate.filter((p, i) => i === 0 || p.name.trim());
    // Points of a removed Präparat fall back to the first one
    const kept = inlineTempPraeparate.map((p, i) => (i === 0 || p.name.trim()) ? i : -1).filter((i) => i >= 0);
    let updatedTd = withPraeparate({ ...td }, list);
    if (kept.length !== inlineTempPraeparate.length || kept.length < praepCount) {
      updatedTd.markers = (td.markers || []).map((m) => {
        const old = markerPraepIdx(m, Infinity);
        const next = kept.indexOf(old);
        const { p: _p, ...rest } = m;
        return next > 0 ? { ...rest, p: next } : rest;
      });
    }
    const updated = { ...inv, treatmentDoc: updatedTd, lastModifiedAt: new Date().toISOString() };
    if (onUpdateInvoice) onUpdateInvoice(updated);
    setViewingTreatment(updated);
    setEditPraep(false);
  };

  // Open the quick invoice modal
  const openQuickInvoiceModal = () => {
    const ri = invoices.filter(i => i.invoiceMeta?.nummer && i.invoiceMeta.nummer !== "—");
    const latest = ri.length > 0 ? ri.reduce((best, i) => { const t = i._createdAt || i.savedAt || ""; const bt = best._createdAt || best.savedAt || ""; return t > bt ? i : best; }, ri[0]) : null;
    setQuickInvoiceNummer(latest ? nextInvoiceNumber(latest.invoiceMeta.nummer) || latest.invoiceMeta.nummer : "");
    setQuickInvoiceWunschStr("");
    setQuickInvoicePreisStr("");
    setQuickInvoiceExtraPreis({});
    setQuickInvoiceBegruendung("");
    setQuickInvoiceHvVerzicht(false);
    setQuickInvoiceOpen(true);
  };

  // Auto-open quick invoice modal after saving treatment with "Speichern & Schnellrechnung"
  useEffect(() => {
    if (pendingQuickInvoice && viewingTreatment) {
      openQuickInvoiceModal();
      setPendingQuickInvoice(false);
    }
  }, [pendingQuickInvoice, viewingTreatment]);

  return (
    <>
      <div className="px-3 sm:px-5 py-4">
        <div className="flex items-center gap-3 mb-4">
          {!inModal && <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => { setViewingTreatment(null); setCenterView("timeline"); }}>&larr; Zur&uuml;ck zur &Uuml;bersicht</button>}
          {inv.lastModifiedAt && inv.lastModifiedAt !== inv.savedAt && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded" title={`Zuletzt geändert: ${new Date(inv.lastModifiedAt).toLocaleString("de-DE")}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Ge&auml;ndert {new Date(inv.lastModifiedAt).toLocaleDateString("de-DE")}
            </span>
          )}
        </div>
        {/* Face map and details sit side by side when the column is wide enough,
            otherwise the details wrap below the map (laptop screens, phones) */}
        <div className="flex flex-wrap gap-6">
          {/* Left: Face map large */}
          <div style={{ flex: "0 1 500px", minWidth: 0, maxWidth: "100%" }}>
            {detailViews.length > 1 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {detailViews.map((v) => {
                  const n = (td.markers || []).filter((m) => markerView(m) === v).length;
                  const active = shownView === v;
                  return (
                    <button key={v} type="button" onClick={() => setDisplayView(v)}
                      className={`inline-flex items-center gap-1.5 px-2.5 text-xs rounded-md transition ${active ? "bg-gray-800 text-white font-medium" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                      style={{ height: 26 }}>
                      {CHARTS.find((c) => c.id === v)?.label}
                      <span className={`text-[10px] font-semibold rounded-full px-1.5 ${active ? "bg-white/20" : "bg-white text-gray-700"}`}>{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="relative">
              {hasChartMarks ? (
                <ChartFigure markers={td.markers || []} view={shownView} facePhoto={td.facePhoto} size={500} dotSize={26} fontSize={12} praepCount={praepCount} onClick={openFaceEditor} />
              ) : (
                <div className="flex items-center justify-center border border-[#DFE3EB] rounded-lg cursor-pointer hover:border-blue-200 transition" style={{ width: 500, maxWidth: "100%", aspectRatio: "1", background: "#fafafa" }} onClick={openFaceEditor} title="Klicken zum Bearbeiten">
                  <p className="text-xs text-gray-400">Keine Injektionspunkte dokumentiert. Klicke, um welche zu setzen.</p>
                </div>
              )}
              <button className="absolute bottom-3 right-3 p-1.5 bg-white rounded border border-[#DFE3EB] shadow-sm text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition" title="Injektionspunkte bearbeiten" onClick={openFaceEditor}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
            </div>
            <VectorLegend markers={(td.markers || []).filter((m) => markerView(m) === shownView)} className="mt-2" />
            {markerCount > 0 ? (
              <p className="text-xs text-gray-500 mt-2">
                {multiPraep ? praepSummary : `Gesamt: ${totalUnitsStr} ${einh}`} an {markerCount} {markerCount === 1 ? "Stelle" : "Stellen"}
              </p>
            ) : td.amount ? (
              <p className="text-xs text-gray-500 mt-2">{multiPraep ? praepSummary : `Menge: ${td.amount} ${einh}`}</p>
            ) : null}
          </div>
          {/* Right: Details with inline edit icons */}
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            {/* Datum */}
            <div className="mb-4">
              {!editDate ? (
                <div {...clickEdit(() => { setInlineTempDate(td.behandlungsDatum || ""); setEditDate(true); })} className={editableCls + " !inline-flex items-center gap-2"}>
                  <h3 className="text-lg font-semibold text-gray-800">Behandlung vom {datumStr}</h3>
                  {editHint}
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <input type="date" className={inputCls + " bg-white"} style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light" }} value={inlineTempDate} onChange={(e) => setInlineTempDate(e.target.value)} />
                    <button className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition" onClick={() => { saveInlineField("date", inlineTempDate); setEditDate(false); }}>{"✓"}</button>
                    <button className="px-2 py-1 text-xs rounded border border-[#DFE3EB] text-gray-500 hover:bg-gray-50 transition" onClick={() => setEditDate(false)}>{"✕"}</button>
                  </div>
                  {inv._behandlungId && <p className="text-[10px] text-gray-400 mt-1">Der Behandlungstermin in der &Uuml;bersicht wird mit angepasst.</p>}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {/* Praeparat(e) */}
              <div>
                {!editPraep ? (
                  <div {...clickEdit(startEditPraep)} className={editableCls}>
                    {fieldLabel(multiPraep ? "Präparate" : "Präparat")}
                    <div className="text-sm text-gray-700 space-y-0.5 mt-0.5">
                      {praepTotals.map((t) => (
                        <p key={t.idx} className="flex items-center gap-2">
                          {multiPraep && <span className="text-[10px] font-bold rounded bg-gray-800 text-white text-center flex-shrink-0" style={{ width: 18, height: 18, lineHeight: "18px" }}>{t.letter}</span>}
                          <span>{t.name || "—"}{multiPraep && praepMengeStr(t) ? <span className="text-gray-400"> &middot; {praepMengeStr(t)}</span> : null}{t.charge ? <span className="text-gray-400"> &middot; Ch. {t.charge}</span> : null}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-0.5 space-y-1.5">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{multiPraep ? "Präparate" : "Präparat"}</span>
                    {inlineTempPraeparate.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2 flex-wrap">
                        {inlineTempPraeparate.length > 1 && <span className="text-[10px] font-bold rounded bg-gray-800 text-white text-center flex-shrink-0" style={{ width: 18, height: 18, lineHeight: "18px" }}>{praepLetter(idx)}</span>}
                        <div className="w-40">
                          <PraeparatAutocomplete
                            className={inputCls + " w-full"}
                            value={p.name}
                            placeholder="z.B. Bocouture"
                            suggestions={(practice.praeparate || []).filter((s) => s.name)}
                            onChange={(v) => setInlineTempPraeparate(inlineTempPraeparate.map((q, i) => (i === idx ? { ...q, name: v } : q)))}
                            onSelect={(s) => setInlineTempPraeparate(inlineTempPraeparate.map((q, i) => (i === idx ? { ...q, name: s.name, ...(s.einheit ? { einheit: s.einheit } : {}) } : q)))}
                          />
                        </div>
                        <Select className={inputCls + " bg-white"} value={p.einheit} onChange={(e) => setInlineTempPraeparate(inlineTempPraeparate.map((q, i) => (i === idx ? { ...q, einheit: e.target.value } : q)))}>
                          <option value="ml">ml</option><option value="SE">SE</option><option value="IE">IE</option>
                        </Select>
                        <input className={inputCls + " w-24"} value={p.charge || ""} placeholder="Charge" title="Chargennummer" onChange={(e) => setInlineTempPraeparate(inlineTempPraeparate.map((q, i) => (i === idx ? { ...q, charge: e.target.value } : q)))} />
                        {inlineTempPraeparate.length > 1 && (
                          <button type="button" className="p-1 rounded text-gray-300 hover:text-red-500 transition" title="Pr&auml;parat entfernen" onClick={() => setInlineTempPraeparate(inlineTempPraeparate.filter((_, i) => i !== idx))}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => setInlineTempPraeparate([...inlineTempPraeparate, emptyPraeparat(inlineTempPraeparate[0]?.einheit || einh)])}>+ Weiteres Pr&auml;parat</button>
                    {inlineTempPraeparate.length > 1 && <p className="text-[10px] text-gray-400">Welches Pr&auml;parat an welchem Punkt verwendet wurde, legst Du beim Bearbeiten der Injektionspunkte fest (Buchstabe am Punkt).</p>}
                    <div className="flex gap-2">
                      <button className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition" onClick={savePraep}>Speichern</button>
                      <button className="px-2 py-1 text-xs rounded border border-[#DFE3EB] text-gray-500 hover:bg-gray-50 transition" onClick={() => setEditPraep(false)}>Abbrechen</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Injektionspunkte */}
              {markerCount > 0 && (
                <div {...clickEdit(openFaceEditor)} className={editableCls}>
                  {fieldLabel("Injektionspunkte")}
                  <div className="mt-1.5 space-y-1">
                    {(td.markers || []).map((m, idx) => !isGuide(m) && (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-4 text-right flex-shrink-0">{idx + 1}.</span>
                        <MarkerDot marker={m} idx={idx} size={22} fontSize={11} praepCount={praepCount} />
                        <span className="text-sm text-gray-700">{m.amount}{String(m.amount).match(/[xX×*]/) ? ` = ${evalAmount(m.amount)}` : ""} {unitFor(m)}</span>
                        {multiPraep && <span className="text-xs text-gray-400">{praeparate[markerPraepIdx(m, praepCount)]?.name || `Präparat ${praepLetter(markerPraepIdx(m, praepCount))}`}</span>}
                        <VectorSummary marker={m} className="text-xs text-gray-500" />
                        {detailViews.length > 1 && <span className="text-[11px] text-gray-400">{CHARTS.find((c) => c.id === markerView(m))?.label}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verkn&uuml;pfte Rechnung */}
              {hasInvoice && (
                <div>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Verkn&uuml;pfte Rechnung</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm text-gray-700">{inv.invoiceMeta.nummer} vom {fmtDate(inv.invoiceMeta.datum)}</p>
                  </div>
                </div>
              )}

              {/* Hinweis für Patient:in (printed on the PDF) */}
              <div>
                {!editHinweis ? (
                  <div {...clickEdit(() => { setInlineTempHinweis(td.patientHinweis || ""); setInlineTempBetrag(td.patientBetrag || ""); setEditHinweis(true); })} className={editableCls}>
                    {fieldLabel("Hinweis für Patient:in")}
                    <div className="text-sm text-gray-600 mt-0.5">
                      <p className="whitespace-pre-wrap">{td.patientHinweis || <span className="text-gray-400">Hinzufügen …</span>}</p>
                      {td.patientBetrag && <p className="mt-0.5 font-medium text-gray-700">Betrag: {fmtBetrag(td.patientBetrag)} &euro;</p>}
                    </div>
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Hinweis f&uuml;r Patient:in</span>
                    <textarea autoFocus className={inputCls + " w-full"} rows={3} placeholder="Erscheint auf dem PDF" value={inlineTempHinweis} onChange={(e) => setInlineTempHinweis(e.target.value)} />
                    <div className="relative w-36 mt-1.5">
                      <input type="text" inputMode="decimal" className={inputCls + " w-full pr-7"} placeholder="Betrag, z.B. 45,00" value={inlineTempBetrag} onChange={(e) => setInlineTempBetrag(e.target.value)} />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">&euro;</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Mit Betrag werden Deine Bankdaten aus den Praxis-Einstellungen mitgedruckt.</p>
                    <div className="flex gap-2 mt-1">
                      <button className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition" onClick={() => { saveInlineField("hinweis", { text: inlineTempHinweis, betrag: inlineTempBetrag }); setEditHinweis(false); }}>Speichern</button>
                      <button className="px-2 py-1 text-xs rounded border border-[#DFE3EB] text-gray-500 hover:bg-gray-50 transition" onClick={() => setEditHinweis(false)}>Abbrechen</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notizen (intern) */}
              <div>
                {!editNotes ? (
                  <div {...clickEdit(() => { setInlineTempNotes(td.notes || ""); setEditNotes(true); })} className={editableCls}>
                    {fieldLabel("Notizen (intern)")}
                    <p className="text-sm text-gray-600 whitespace-pre-wrap mt-0.5">{td.notes || <span className="text-gray-400">Hinzufügen …</span>}</p>
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Notizen (intern)</span>
                    <textarea autoFocus className={inputCls + " w-full"} rows={3} value={inlineTempNotes} onChange={(e) => setInlineTempNotes(e.target.value)} />
                    <div className="flex gap-2 mt-1">
                      <button className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition" onClick={() => { saveInlineField("notes", inlineTempNotes); setEditNotes(false); }}>Speichern</button>
                      <button className="px-2 py-1 text-xs rounded border border-[#DFE3EB] text-gray-500 hover:bg-gray-50 transition" onClick={() => setEditNotes(false)}>Abbrechen</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 flex-wrap">
              {!hasInvoice && markerCount > 0 && praep && (
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 transition shadow-sm"
                  onClick={openQuickInvoiceModal}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Rechnung erstellen
                </button>
              )}
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#DFE3EB] text-gray-600 hover:bg-green-50 hover:border-green-200 hover:text-green-700 transition"
                onClick={() => downloadTreatmentDoc(inv)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                PDF herunterladen
              </button>
              {onSendTreatmentDoc && (
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#DFE3EB] text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition"
                  onClick={() => onSendTreatmentDoc(inv)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Per E-Mail senden
                </button>
              )}
              <button className="px-3 py-1.5 text-xs rounded border border-[#DFE3EB] text-red-600 hover:bg-red-50 hover:border-red-200 transition" onClick={() => setConfirmDeleteTreatment(inv)}>Behandlung l&ouml;schen</button>
            </div>
          </div>
        </div>

        {/* Quick-Invoice Modal */}
        {quickInvoiceOpen && (() => {
          const qPreisProMl = parseDE(quickInvoicePreisStr);
          const qiIsMedical = false;
          const noMwst = kleinunternehmer || qiIsMedical;
          // The first Präparat is the product line; further Präparate go in as material lines
          const mainT = praepTotals[0];
          const extraT = praepTotals.slice(1).filter((t) => t.units > 0);
          // A Dermalfiller (per the practice's Präparate list) is billed per whole syringe, which the Schnellrechnung cannot do
          const fillerPraep = (practice.praeparate || []).some((s) => s.typ === "filler" && s.name && s.name.trim().toLowerCase() === (praep || "").trim().toLowerCase());
          const qMl = multiPraep ? mainT.units : totalUnits;
          const qEinh = mainT.einheit || einh;
          const extraPrice = (t) => parseDE(quickInvoiceExtraPreis[t.idx] || "");
          const sachkosten = extraT
            .filter((t) => extraPrice(t) > 0)
            .map((t) => ({ description: `${fmtNum(t.units)}${t.einheit} ${t.name || `Präparat ${t.letter}`}`, betragStr: toDE(Math.round(t.units * extraPrice(t) * 100) / 100) }));
          const extrasValid = extraT.every((t) => extraPrice(t) > 0);

          const defaultItems = buildLineItems(praep, qMl, qPreisProMl, [], sachkosten, null, qEinh);
          const defaultNetto = defaultItems.reduce((s, it) => s + it.betrag, 0);
          const defaultGesamt = noMwst ? defaultNetto : Math.round((defaultNetto * 1.19) * 100) / 100;

          const wunschVal = parseDE(quickInvoiceWunschStr);
          const defaultStr = qPreisProMl > 0 ? defaultGesamt.toFixed(2).replace(".", ",") : "";
          const effectiveWunsch = quickInvoiceWunschStr ? wunschVal : (qPreisProMl > 0 ? defaultGesamt : 0);
          const customS = quickInvoiceWunschStr && wunschVal > 0 ? calcWeightedForGesamt(wunschVal, qMl, qPreisProMl, [], sachkosten, noMwst, false) : null;
          const lineItems = effectiveWunsch > 0 ? buildLineItems(praep, qMl, qPreisProMl, [], sachkosten, customS, qEinh, false) : [];
          const gesamt = effectiveWunsch > 0 ? calcGesamt(lineItems, kleinunternehmer, false, qiIsMedical) : 0;
          const effectiveMax = customS != null ? Math.max(customS.s1, customS.s5, customS.s267) : 3.5;
          const materialkosten = Math.round((qMl * qPreisProMl + sachkosten.reduce((s, sk) => s + parseDE(sk.betragStr), 0)) * 100) / 100;
          const netto = lineItems.reduce((s, it) => s + it.betrag, 0);
          const verdienst = netto > 0 ? Math.round((netto - materialkosten) * 100) / 100 : 0;
          // § 12 Abs. 3 GOÄ: between 2,3- and 3,5-fach the doctor writes a Begründung (above 3,5 an HV applies)
          const itemMax = Math.max(0, ...lineItems.filter((it) => it.steigerung != null).map((it) => it.steigerung));
          const needsBegruendung = itemMax > 2.3 && itemMax <= 3.5;
          // § 2 Abs. 2 GOÄ: above 3,5-fach only with an HV signed before the treatment.
          // The Schnellrechnung cannot create one, so it stops at 3,5-fach.
          const aboveHv = itemMax > HV_THRESHOLD;
          const maxOhneHv = aboveHv
            ? maxGesamtWithin((g) => buildLineItems(praep, qMl, qPreisProMl, [], sachkosten, calcWeightedForGesamt(g, qMl, qPreisProMl, [], sachkosten, noMwst, false), qEinh, false), effectiveWunsch)
            : null;
          const isValid = effectiveWunsch > 0 && qPreisProMl > 0 && extrasValid && quickInvoiceNummer.trim() && effectiveMax > 0 && (!aboveHv || quickInvoiceHvVerzicht) && (!needsBegruendung || quickInvoiceBegruendung.trim());

          const realInvoices = invoices.filter(i => i.invoiceMeta?.nummer && i.invoiceMeta.nummer !== "—");
          const latestInv = realInvoices.length > 0 ? realInvoices.reduce((best, i) => { const t = i._createdAt || i.savedAt || ""; const bt = best._createdAt || best.savedAt || ""; return t > bt ? i : best; }, realInvoices[0]) : null;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setQuickInvoiceOpen(false)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 pt-5 pb-3">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Schnellrechnung erstellen</h3>
                  <p className="text-xs text-gray-400 mb-1">{multiPraep ? praepSummary : `${praep} · ${totalUnitsStr} ${einh}`} &middot; {markerCount} {markerCount === 1 ? "Punkt" : "Punkte"}</p>
                  {totalUnits <= 0 && markerCount > 0 && (
                    <p className="text-xs text-amber-600 mb-2">Hinweis: Bitte trage zuerst die Mengen an den Injektionspunkten ein.</p>
                  )}
                  {fillerPraep && (
                    <p className="text-xs text-amber-600 mb-2">Dermalfiller werden pro ganzer Spritze als Auslage berechnet. Die Schnellrechnung rechnet pro {qEinh}; nutze für Filler bitte „Neue Rechnung" mit Behandlungstyp Dermalfiller.</p>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Rechnungsnummer</label>
                      <input
                        type="text"
                        className={inputCls + " w-full"}
                        value={quickInvoiceNummer}
                        onChange={(e) => setQuickInvoiceNummer(e.target.value)}
                      />
                      {latestInv && <p className="text-xs text-gray-400 mt-0.5">Letzte: {latestInv.invoiceMeta.nummer}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Preis pro {qEinh} (&euro;){multiPraep ? ` – ${mainT.name || "Präparat A"} (${fmtNum(qMl)} ${qEinh})` : ""}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={inputCls + " w-full"}
                        placeholder="z.B. 4,50"
                        value={quickInvoicePreisStr}
                        onChange={(e) => setQuickInvoicePreisStr(e.target.value)}
                        autoFocus
                      />
                    </div>
                    {extraT.map((t) => (
                      <div key={t.idx}>
                        <label className="block text-xs font-medium text-gray-500 mb-0.5">Preis pro {t.einheit} (&euro;) &ndash; {t.name || `Präparat ${t.letter}`} ({fmtNum(t.units)} {t.einheit})</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className={inputCls + " w-full"}
                          placeholder="z.B. 4,50"
                          value={quickInvoiceExtraPreis[t.idx] || ""}
                          onChange={(e) => setQuickInvoiceExtraPreis({ ...quickInvoiceExtraPreis, [t.idx]: e.target.value })}
                        />
                      </div>
                    ))}
                    {qPreisProMl > 0 && extrasValid && <p className="text-xs text-gray-400 -mt-1">Materialkosten: {materialkosten.toFixed(2).replace(".", ",")} &euro;{multiPraep ? " (alle Präparate)" : ""}</p>}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Gesamtbetrag (&euro;)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={inputCls + " w-full"}
                        value={quickInvoiceWunschStr}
                        placeholder={qPreisProMl > 0 ? defaultStr : "z.B. 350"}
                        onChange={(e) => setQuickInvoiceWunschStr(e.target.value)}
                      />
                      {qPreisProMl > 0 && (
                        <div className="mt-1.5">
                          <div className="text-xs text-gray-500">
                            <span className="text-gray-400">Max. Steigerungssatz: </span>
                            <span className="font-semibold text-gray-700">{effectiveMax.toFixed(2).replace(".", ",")}x</span>
                            {effectiveMax > 3.5 && <span className="ml-1 text-amber-600 text-xs">nur mit HV</span>}
                          </div>
                          {aboveHv && (
                            <div className={`mt-1.5 px-2.5 py-1.5 border rounded text-xs ${quickInvoiceHvVerzicht ? "bg-gray-50 border-[#DFE3EB] text-gray-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                              &Uuml;ber 3,5-fach nur mit einer Honorarvereinbarung, die vor der Behandlung unterschrieben wurde (&sect; 2 Abs. 2 GO&Auml;). Erstelle die Rechnung dann &uuml;ber &bdquo;+ Rechnung&ldquo; aus der HV.
                              {onStartHvFromValues && (
                                <>
                                  <button
                                    type="button"
                                    className="block mt-1.5 px-2.5 py-1 rounded bg-white border border-amber-300 font-medium text-amber-900 hover:bg-amber-100 transition"
                                    onClick={() => {
                                      setQuickInvoiceOpen(false);
                                      onStartHvFromValues({ behandlungId: inv._behandlungId || null, praeparat: praep, einheit: qEinh, ml: qMl, preisProMl: qPreisProMl, wunschGesamt: effectiveWunsch, treatmentType: fillerPraep ? "filler" : "botox" });
                                      setViewingTreatment(null);
                                      setCenterView("timeline");
                                    }}
                                  >
                                    Honorarvereinbarung erstellen
                                  </button>
                                  {td.behandlungsDatum && td.behandlungsDatum < todayLocal() && (
                                    <span className="block mt-1 text-[11px] opacity-80">Achtung: Die Behandlung vom {fmtDate(td.behandlungsDatum)} liegt bereits zur&uuml;ck. Eine jetzt erstellte HV gilt nur f&uuml;r Behandlungen nach ihrer Unterschrift.</span>
                                  )}
                                </>
                              )}
                              {maxOhneHv > 0 && (
                                <button type="button" className="block mt-1 font-medium underline hover:no-underline" onClick={() => setQuickInvoiceWunschStr(maxOhneHv.toFixed(2).replace(".", ","))}>
                                  Gesamtbetrag auf {maxOhneHv.toFixed(2).replace(".", ",")} &euro; setzen (h&ouml;chstens 3,5-fach)
                                </button>
                              )}
                              <label className="mt-2 pt-2 border-t border-current/10 flex items-start gap-2 cursor-pointer">
                                <span className="flex items-center h-4 flex-shrink-0">
                                  <input type="checkbox" className="m-0 w-3.5 h-3.5 rounded" checked={quickInvoiceHvVerzicht} onChange={(e) => setQuickInvoiceHvVerzicht(e.target.checked)} />
                                </span>
                                <span className="leading-4">{HV_WAIVER_TEXT}</span>
                              </label>
                            </div>
                          )}
                          {effectiveMax <= 0 && quickInvoiceWunschStr && (
                            <div className="text-xs text-red-500 mt-1">Betrag ist zu niedrig f&uuml;r die Materialkosten.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {needsBegruendung && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Begründung gemäß § 12 Abs. 3 GOÄ *</label>
                      <textarea
                        className={inputCls + " w-full resize-none text-xs"}
                        rows={3}
                        value={quickInvoiceBegruendung}
                        onChange={(e) => setQuickInvoiceBegruendung(e.target.value)}
                        placeholder="Über 2,3-fach: Warum ist der erhöhte Satz bei dieser Patient:in gerechtfertigt? Wird auf der Rechnung gedruckt."
                      />
                    </div>
                  )}
                  {qPreisProMl > 0 && gesamt > 0 && (
                    <div className="mt-4 flex justify-between items-center text-sm font-semibold text-green-600">
                      <span>Dein Verdienst</span>
                      <span>{verdienst > 0 ? verdienst.toFixed(2).replace(".", ",") : "–"} &euro;</span>
                    </div>
                  )}

                </div>

                <div className="px-5 pb-5 pt-2 flex gap-2">
                  <button className="flex-1 px-3 py-2 text-xs rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50 transition" onClick={() => setQuickInvoiceOpen(false)}>Abbrechen</button>
                  <button
                    className={`flex-1 px-3 py-2 text-xs rounded text-white transition flex items-center justify-center gap-1.5 ${quickInvoiceSaving ? "bg-blue-400 cursor-not-allowed" : isValid ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-300 cursor-not-allowed"}`}
                    disabled={!isValid || quickInvoiceSaving}
                    onClick={async () => {
                      if (!isValid || quickInvoiceSaving) return;
                      setQuickInvoiceSaving(true);
                      try {
                        if (onQuickInvoice) await onQuickInvoice({
                          treatment: inv,
                          nummer: quickInvoiceNummer.trim(),
                          wunschGesamt: effectiveWunsch,
                          customS,
                          lineItems,
                          gesamt,
                          hasHV: false, // never created with the invoice (§ 2 Abs. 2 GOÄ)
                          begruendung: needsBegruendung ? quickInvoiceBegruendung.trim() : "",
                          hvVerzicht: aboveHv && quickInvoiceHvVerzicht,
                          praeparat: praep,
                          einheit: qEinh,
                          ml: qMl,
                          preisProMl: qPreisProMl,
                          sachkosten,
                        });
                        setQuickInvoiceOpen(false);
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setQuickInvoiceSaving(false);
                      }
                    }}
                  >
                    {quickInvoiceSaving && (
                      <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {quickInvoiceSaving ? "Wird erstellt…" : "Rechnung erstellen"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Point editor: the same editor as in the Behandlungsdoku form (regions, zoom, lines and fans) */}
      {editFace && (
        <TreatmentMap
          markers={inlineTempMarkers}
          setMarkers={setInlineTempMarkers}
          einheit={einh}
          praeparate={praeparate}
          facePhoto={inlineTempPhoto}
          onFacePhotoChange={setInlineTempPhoto}
          autoOpen
          onAutoSave={(ms) => {
            const updatedTd = withPraeparate({ ...inv.treatmentDoc, markers: serializeMarkers(ms), facePhoto: inlineTempPhoto || "" }, praeparate);
            const updated = { ...inv, treatmentDoc: updatedTd, lastModifiedAt: new Date().toISOString() };
            if (onUpdateInvoice) onUpdateInvoice(updated);
            setViewingTreatment(updated);
            setEditFace(false);
          }}
          onAutoCancel={() => setEditFace(false)}
        />
      )}
    </>
  );
}
