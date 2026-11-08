import React, { useState, useRef, useEffect } from "react";
import { fmtDate, parseDE, toDE, evalAmount, buildLineItems, calcWeightedForGesamt, calcGesamt, fmtUnits, nextInvoiceNumber, fmtBetrag } from "../../utils/helpers";
import { FACE_IMAGE_B64 } from "../../constants";
import { MarkerDot, ColorSwatches, PraeparatChips, PraeparatBadge, serializeMarkers, markerColor, nextMarkerColor, fmtNum, DEFAULT_MARKER_COLOR } from "../treatment/markerUtils";
import { getPraeparate, praeparatTotals, praepMengeStr, praepLetter, markerPraepIdx, emptyPraeparat, withPraeparate } from "../../utils/praeparate";
import PraeparatAutocomplete from "../ui/PraeparatAutocomplete";

export default function BehandlungDetailPanel({
  viewingTreatment, setViewingTreatment,
  setCenterView,
  patient, rawData, invoices, kleinunternehmer, practice,
  onUpdateInvoice, onQuickInvoice,
  setConfirmDeleteTreatment,
  downloadTreatmentDoc,
  pendingQuickInvoice, setPendingQuickInvoice,
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
  const [inlineEditColor, setInlineEditColor] = useState(DEFAULT_MARKER_COLOR);
  const [inlineEditPraep, setInlineEditPraep] = useState(0);
  const [inlineTempMarkers, setInlineTempMarkers] = useState([]);
  const faceModalRef = useRef(null);

  // Quick-invoice modal states (local to this component)
  const [quickInvoiceOpen, setQuickInvoiceOpen] = useState(false);
  const [quickInvoiceNummer, setQuickInvoiceNummer] = useState("");
  const [quickInvoiceWunschStr, setQuickInvoiceWunschStr] = useState("");
  const [quickInvoicePreisStr, setQuickInvoicePreisStr] = useState("");
  const [quickInvoiceExtraPreis, setQuickInvoiceExtraPreis] = useState({});
  const [quickInvoiceSaving, setQuickInvoiceSaving] = useState(false);

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
  const markerCount = (td.markers || []).length;
  const totalUnits = Math.round((td.markers || []).reduce((s, m) => s + evalAmount(m.amount), 0) * 100) / 100;
  const totalUnitsStr = fmtUnits(td.markers || []);
  const sameEinh = praepTotals.every((t) => t.einheit === praepTotals[0].einheit);
  const praepSummary = praepTotals.map((t) => [t.name || `Präparat ${t.letter}`, praepMengeStr(t)].filter(Boolean).join(" ")).join(" · ");

  const pencilIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
  );
  const editBtnCls = "p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition";
  const inputCls = "border border-[#DFE3EB] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";

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
          <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => { setViewingTreatment(null); setCenterView("timeline"); }}>&larr; Zur&uuml;ck zur &Uuml;bersicht</button>
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
            <div className="relative">
              {markerCount > 0 ? (
                <div className="relative border border-[#DFE3EB] rounded-lg overflow-hidden select-none" style={{ width: 500, maxWidth: "100%", aspectRatio: "1", background: "#fafafa" }}>
                  <img src={td.facePhoto || FACE_IMAGE_B64} alt="Gesicht" className="w-full h-full object-contain pointer-events-none" draggable={false} />
                  {(td.markers || []).map((m, idx) => (
                    <div key={idx} className="absolute flex items-center justify-center" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)", zIndex: 10 }}>
                      <MarkerDot marker={m} idx={idx} size={26} fontSize={12} shadow praepCount={praepCount} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center border border-[#DFE3EB] rounded-lg" style={{ width: 500, maxWidth: "100%", aspectRatio: "1", background: "#fafafa" }}>
                  <p className="text-xs text-gray-400">Keine Injektionspunkte dokumentiert</p>
                </div>
              )}
              <button className="absolute bottom-3 right-3 p-1.5 bg-white rounded border border-[#DFE3EB] shadow-sm text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition" title="Injektionspunkte bearbeiten" onClick={() => { setInlineTempMarkers((td.markers || []).map((m, i) => ({ id: Date.now() + i, ...m }))); setEditFace(true); }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
            </div>
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
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800">Behandlung vom {datumStr}</h3>
                  <button className={editBtnCls} title="Datum bearbeiten" onClick={() => { setInlineTempDate(td.behandlungsDatum || ""); setEditDate(true); }}>{pencilIcon}</button>
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
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{multiPraep ? "Präparate" : "Präparat"}</span>
                {!editPraep ? (
                  <div className="flex items-start gap-2 mt-0.5">
                    <div className="text-sm text-gray-700 space-y-0.5">
                      {praepTotals.map((t) => (
                        <p key={t.idx} className="flex items-center gap-2">
                          {multiPraep && <span className="text-[10px] font-bold rounded bg-gray-800 text-white text-center flex-shrink-0" style={{ width: 18, height: 18, lineHeight: "18px" }}>{t.letter}</span>}
                          <span>{t.name || "—"}{multiPraep && praepMengeStr(t) ? <span className="text-gray-400"> &middot; {praepMengeStr(t)}</span> : null}</span>
                        </p>
                      ))}
                    </div>
                    <button className={editBtnCls + " flex-shrink-0"} title="Pr&auml;parat bearbeiten" onClick={startEditPraep}>{pencilIcon}</button>
                  </div>
                ) : (
                  <div className="mt-0.5 space-y-1.5">
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
                        <select className={inputCls + " bg-white"} value={p.einheit} onChange={(e) => setInlineTempPraeparate(inlineTempPraeparate.map((q, i) => (i === idx ? { ...q, einheit: e.target.value } : q)))}>
                          <option value="ml">ml</option><option value="SE">SE</option><option value="IE">IE</option>
                        </select>
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
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Injektionspunkte</span>
                    <button className={editBtnCls} title="Injektionspunkte bearbeiten" onClick={() => { setInlineTempMarkers((td.markers || []).map((m, i) => ({ id: Date.now() + i, ...m }))); setEditFace(true); }}>{pencilIcon}</button>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {(td.markers || []).map((m, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-4 text-right flex-shrink-0">{idx + 1}.</span>
                        <MarkerDot marker={m} idx={idx} size={22} fontSize={11} praepCount={praepCount} />
                        <span className="text-sm text-gray-700">{m.amount}{String(m.amount).match(/[xX×*]/) ? ` = ${evalAmount(m.amount)}` : ""} {unitFor(m)}</span>
                        {multiPraep && <span className="text-xs text-gray-400">{praeparate[markerPraepIdx(m, praepCount)]?.name || `Präparat ${praepLetter(markerPraepIdx(m, praepCount))}`}</span>}
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
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Hinweis f&uuml;r Patient:in</span>
                {!editHinweis ? (
                  <div className="flex items-start gap-2 mt-0.5">
                    <div className="text-sm text-gray-600">
                      <p className="whitespace-pre-wrap">{td.patientHinweis || "—"}</p>
                      {td.patientBetrag && <p className="mt-0.5 font-medium text-gray-700">Betrag: {fmtBetrag(td.patientBetrag)} &euro;</p>}
                    </div>
                    <button className={editBtnCls + " flex-shrink-0 mt-0.5"} title="Hinweis bearbeiten" onClick={() => { setInlineTempHinweis(td.patientHinweis || ""); setInlineTempBetrag(td.patientBetrag || ""); setEditHinweis(true); }}>{pencilIcon}</button>
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <textarea className={inputCls + " w-full"} rows={3} placeholder="Erscheint auf dem PDF" value={inlineTempHinweis} onChange={(e) => setInlineTempHinweis(e.target.value)} />
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
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Notizen (intern)</span>
                {!editNotes ? (
                  <div className="flex items-start gap-2 mt-0.5">
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{td.notes || "—"}</p>
                    <button className={editBtnCls + " flex-shrink-0 mt-0.5"} title="Notizen bearbeiten" onClick={() => { setInlineTempNotes(td.notes || ""); setEditNotes(true); }}>{pencilIcon}</button>
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <textarea className={inputCls + " w-full"} rows={3} value={inlineTempNotes} onChange={(e) => setInlineTempNotes(e.target.value)} />
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
              <button className="px-3 py-1.5 text-xs rounded border border-[#DFE3EB] text-red-600 hover:bg-red-50 hover:border-red-200 transition" onClick={() => setConfirmDeleteTreatment(inv)}>Behandlung l&ouml;schen</button>
            </div>
          </div>
        </div>

        {/* Quick-Invoice Modal */}
        {quickInvoiceOpen && (() => {
          const qPreisProMl = parseDE(quickInvoicePreisStr);
          const isAusland = (patient._raw?.data?.country || patient.country || "Deutschland") !== "Deutschland";
          const qiIsMedical = false;
          const noMwst = kleinunternehmer || isAusland || qiIsMedical;
          // The first Präparat is the product line; further Präparate go in as material lines
          const mainT = praepTotals[0];
          const extraT = praepTotals.slice(1).filter((t) => t.units > 0);
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
          const gesamt = effectiveWunsch > 0 ? calcGesamt(lineItems, kleinunternehmer, isAusland, qiIsMedical) : 0;
          const effectiveMax = customS != null ? Math.max(customS.s1, customS.s5, customS.s267) : 3.5;
          const materialkosten = Math.round((qMl * qPreisProMl + sachkosten.reduce((s, sk) => s + parseDE(sk.betragStr), 0)) * 100) / 100;
          const netto = lineItems.reduce((s, it) => s + it.betrag, 0);
          const verdienst = netto > 0 ? Math.round((netto - materialkosten) * 100) / 100 : 0;
          const isValid = effectiveWunsch > 0 && qPreisProMl > 0 && extrasValid && quickInvoiceNummer.trim() && effectiveMax > 0;

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
                            {effectiveMax > 3.5 && <span className="ml-1 text-gray-400 text-xs">&sect;2 GO&Auml;</span>}
                          </div>
                          {effectiveMax > 3.5 && (
                            <div className="mt-1.5 px-2.5 py-1.5 bg-gray-50 border border-[#DFE3EB] rounded text-xs text-gray-500">
                              &Uuml;ber 3,5-fach: Eine Honorarvereinbarung gem&auml;&szlig; &sect;2 GO&Auml; wird zus&auml;tzlich erstellt.
                            </div>
                          )}
                          {effectiveMax <= 0 && quickInvoiceWunschStr && (
                            <div className="text-xs text-red-500 mt-1">Betrag ist zu niedrig f&uuml;r die Materialkosten.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

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
                          hasHV: lineItems.some((it) => it.steigerung != null && it.steigerung > 3.5),
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
                    {quickInvoiceSaving ? "Wird erstellt…" : (effectiveMax > 3.5 ? "Dokumente erstellen" : "Rechnung erstellen")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Face Edit Modal */}
      {editFace && (() => {
        const isMobileFE = typeof window !== "undefined" && window.innerWidth < 640;
        const faceSzFE = isMobileFE ? "min(85vw, 340px)" : "min(85vh - 100px, 700px)";
        const handleFaceClickFE = (e) => {
          if (!faceModalRef.current) return;
          const rect = faceModalRef.current.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          const hit = inlineTempMarkers.find((m) => Math.abs(m.x - x) < 3.5 && Math.abs(m.y - y) < 3.5);
          if (hit) { setInlineTempMarkers(inlineTempMarkers.filter((m) => m.id !== hit.id)); return; }
          const tooClose = inlineTempMarkers.some((m) => Math.abs(m.x - x) < 2 && Math.abs(m.y - y) < 2);
          if (tooClose) return;
          const point = { id: Date.now(), x, y, amount: "", color: inlineEditColor };
          if (multiPraep && inlineEditPraep > 0) point.p = inlineEditPraep;
          setInlineTempMarkers([...inlineTempMarkers, point]);
        };
        const saveFaceMarkers = () => {
          const updatedTd = withPraeparate({ ...inv.treatmentDoc, markers: serializeMarkers(inlineTempMarkers) }, praeparate);
          const updated = { ...inv, treatmentDoc: updatedTd, lastModifiedAt: new Date().toISOString() };
          if (onUpdateInvoice) onUpdateInvoice(updated);
          setViewingTreatment(updated);
          setEditFace(false);
        };
        return (
          <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={() => setEditFace(false)}>
            <div className="bg-white rounded-xl shadow-2xl p-4 sm:p-5 flex flex-col w-full" style={{ maxWidth: 1100, maxHeight: "95vh" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Injektionspunkte setzen</h3>
                <button className="p-1 text-gray-400 hover:text-gray-600" onClick={() => setEditFace(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-1">Klicke auf das Gesicht, um Injektionspunkte zu setzen.</p>
              <p className="text-xs text-amber-500 mb-2">Die eingegebenen Mengen werden automatisch als Gesamtmenge des Pr&auml;parats &uuml;bernommen. In den Punkten werden die Einheiten angezeigt.</p>
              {multiPraep && <div className="mb-2"><PraeparatChips praeparate={praeparate} value={inlineEditPraep} onChange={setInlineEditPraep} /></div>}
              <div className="mb-3"><ColorSwatches value={inlineEditColor} onChange={setInlineEditColor} /></div>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 overflow-y-auto">
                <div className="flex-shrink-0">
                  <div className="relative border border-[#DFE3EB] rounded-lg overflow-hidden select-none" style={{ width: faceSzFE, height: faceSzFE, cursor: "crosshair", background: "#fafafa" }}>
                    <div ref={faceModalRef} onClick={handleFaceClickFE} className="relative w-full h-full">
                      <img src={td.facePhoto || FACE_IMAGE_B64} alt="Gesicht" className="w-full h-full object-contain pointer-events-none" draggable={false} />
                      {inlineTempMarkers.map((m, idx) => (
                        <div key={m.id} className="absolute flex items-center justify-center" style={{ left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)", zIndex: 10 }}>
                          <MarkerDot marker={m} idx={idx} size={21} fontSize={11} shadow praepCount={praepCount} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 overflow-y-auto" style={{ width: multiPraep ? 250 : 220, maxHeight: faceSzFE }}>
                  <div className="space-y-1.5">
                    {inlineTempMarkers.map((m, idx) => (
                      <div key={m.id} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 w-4 text-right flex-shrink-0">{idx + 1}.</span>
                        <button type="button" className="flex-shrink-0 rounded-full" title="Farbe ändern (klicken)" onClick={() => setInlineTempMarkers(inlineTempMarkers.map((mk) => mk.id === m.id ? { ...mk, color: nextMarkerColor(markerColor(mk)) } : mk))}>
                          <MarkerDot marker={m} idx={idx} size={18} fontSize={9} praepCount={praepCount} />
                        </button>
                        <PraeparatBadge marker={m} praeparate={praeparate} onCycle={(p) => setInlineTempMarkers(inlineTempMarkers.map((mk) => mk.id === m.id ? { ...mk, p } : mk))} />
                        <input type="text" inputMode="text" className="w-20 px-2 py-1 text-sm border border-[#DFE3EB] rounded focus:outline-none focus:ring-1 focus:ring-blue-400" value={m.amount} placeholder={idx % 2 === 0 ? "z.B. 1,90" : "z.B. 2x3"} onChange={(e) => setInlineTempMarkers(inlineTempMarkers.map((mk) => mk.id === m.id ? { ...mk, amount: e.target.value } : mk))} />
                        <span className="text-xs text-gray-400">{unitFor(m)}</span>
                        <button className="p-1 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition" onClick={() => setInlineTempMarkers(inlineTempMarkers.filter((mk) => mk.id !== m.id))} title="L&ouml;schen">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-4 pt-3 border-t border-gray-100">
                <button className="px-4 py-1.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition" onClick={saveFaceMarkers}>Speichern</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
