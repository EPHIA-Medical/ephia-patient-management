import React, { useState, useEffect } from "react";
import { fmtDate, todayLocal, parseDE, toDE, evalAmount, buildLineItems, calcWeightedForGesamt, calcGesamt, fmtUnits, nextInvoiceNumber, fmtBetrag } from "../../utils/helpers";
import { MarkerDot, serializeMarkers, fmtNum } from "../treatment/markerUtils";
import { getPraeparate, praeparatTotals, praepMengeStr, praepLetter, markerPraepIdx, emptyPraeparat, withPraeparate, praeparateSummary } from "../../utils/praeparate";
import { treatmentDateOf } from "../../utils/copySources";
import { resolveConsentTemplate } from "../consent/consentTemplateStore";
import PraeparatAutocomplete from "../ui/PraeparatAutocomplete";
import Select from "../ui/Select";
import { VectorSummary, VectorLegend } from "../treatment/vectors";
import TreatmentMap from "../treatment/TreatmentMap";
import { ChartFigure } from "../treatment/ChartFigure";
import { CHARTS, markerView, usedViews } from "../treatment/charts";
import { HV_THRESHOLD, maxGesamtWithin, HV_WAIVER_TEXT, hvSignedDate, checkHvForInvoice, hvProblemText } from "../../utils/hvRules";
import { isGuide, treatmentPoints } from "../../utils/markers";

export default function BehandlungDetailPanel({
  viewingTreatment, setViewingTreatment,
  setCenterView,
  patient, rawData, invoices, kleinunternehmer, practice,
  onUpdateInvoice, onQuickInvoice,
  setConfirmDeleteTreatment,
  downloadTreatmentDoc, onSendTreatmentDoc,
  pendingQuickInvoice, setPendingQuickInvoice, inModal = false, onStartHvFromValues,
  // Context for the header, documents and earlier treatments (all optional)
  behandlung = null, patientDocs = [], copySourceDocs = [], getDocLabel, getDocStatus, onOpenDoc, onStartConsent,
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
  // Date the HV outside EPHIA was signed (must be on or before the Behandlung, § 2 Abs. 2 GOÄ)
  const [quickInvoiceHvExternDatum, setQuickInvoiceHvExternDatum] = useState("");

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

  // ── Schnellrechnung helpers ──
  // Auslagen may only be billed at the actual Einkaufspreis (§ 10 GOÄ); it is kept per Präparat
  // in the Praxis settings and prefilled from there.
  const storedPreisStr = (name, einheit) => {
    const n = (name || "").trim().toLowerCase();
    if (!n) return "";
    const s = (practice.praeparate || []).find((x) => (x.name || "").trim().toLowerCase() === n && (!x.einheit || !einheit || x.einheit === einheit));
    return s && parseDE(s.preisStr || "") > 0 ? s.preisStr.trim() : "";
  };
  const isFillerSession = (practice.praeparate || []).some((s) => s.typ === "filler" && s.name && s.name.trim().toLowerCase() === (praep || "").trim().toLowerCase());
  const qMainUnits = multiPraep ? (praepTotals[0]?.units || 0) : totalUnits;
  const qMainEinh = praepTotals[0]?.einheit || einh;
  // Further Präparate go in as Sachkosten lines
  const sachkostenFor = (priceOf) => praepTotals.slice(1)
    .filter((t) => t.units > 0 && priceOf(t) > 0)
    .map((t) => ({ description: `${fmtNum(t.units)}${t.einheit} ${t.name || `Präparat ${t.letter}`}`, betragStr: toDE(Math.round(t.units * priceOf(t) * 100) / 100) }));
  // Highest Gesamtbetrag (brutto unless Kleinunternehmer) that stays within 3,5-fach
  const maxOhneHvFor = (preis, sk) => (preis > 0 && qMainUnits > 0
    ? maxGesamtWithin((g) => buildLineItems(praep, qMainUnits, preis, [], sk, calcWeightedForGesamt(g, qMainUnits, preis, [], sk, kleinunternehmer, false), qMainEinh, false), 100000)
    : null);

  // Open the quick invoice modal
  const openQuickInvoiceModal = () => {
    const ri = invoices.filter(i => i.invoiceMeta?.nummer && i.invoiceMeta.nummer !== "—");
    const latest = ri.length > 0 ? ri.reduce((best, i) => { const t = i._createdAt || i.savedAt || ""; const bt = best._createdAt || best.savedAt || ""; return t > bt ? i : best; }, ri[0]) : null;
    setQuickInvoiceNummer(latest ? nextInvoiceNumber(latest.invoiceMeta.nummer) || latest.invoiceMeta.nummer : "");
    setQuickInvoiceWunschStr("");
    setQuickInvoicePreisStr(storedPreisStr(praepTotals[0]?.name || praep, qMainEinh));
    setQuickInvoiceExtraPreis(Object.fromEntries(praepTotals.slice(1).map((t) => [t.idx, storedPreisStr(t.name, t.einheit)]).filter(([, v]) => v)));
    setQuickInvoiceBegruendung("");
    setQuickInvoiceHvVerzicht(false);
    setQuickInvoiceHvExternDatum("");
    setQuickInvoiceOpen(true);
  };

  // Auto-open quick invoice modal after saving treatment with "Speichern & Schnellrechnung"
  useEffect(() => {
    if (pendingQuickInvoice && viewingTreatment) {
      openQuickInvoiceModal();
      setPendingQuickInvoice(false);
    }
  }, [pendingQuickInvoice, viewingTreatment]);

  // ═══════════ Layout: Vorbereitung · Durchführung · Abschluss, billing in its own column ═══════════
  // Abgeschlossen = the clinical record is locked; corrections only as Nachtrag (§ 630f Abs. 1 BGB).
  // Billing (Rechnung, Hinweis für Patient:in) stays editable after the lock.
  const locked = !!td.abgeschlossenAm;
  const [openSec, setOpenSec] = useState(() => ({ prep: !locked, proc: true, close: !locked }));
  const toggleSec = (k) => setOpenSec((s) => ({ ...s, [k]: !s[k] }));
  const [menuOpen, setMenuOpen] = useState(false);
  const [editKey, setEditKey] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [confirmLock, setConfirmLock] = useState(false);
  const [nachtragOpen, setNachtragOpen] = useState(false);
  const [nachtragText, setNachtragText] = useState("");

  const saveTd = (patch) => {
    const updated = { ...inv, treatmentDoc: { ...td, ...patch }, lastModifiedAt: new Date().toISOString() };
    if (onUpdateInvoice) onUpdateInvoice(updated);
    setViewingTreatment(updated);
  };
  const edit = (open) => (locked ? {} : clickEdit(open));
  const edCls = locked ? "block -mx-2 px-2 py-1" : editableCls;
  const lblCls = "text-xs font-medium text-gray-400 uppercase tracking-wide";
  const lbl = (text, editable = !locked) => (editable ? fieldLabel(text) : <span className={lblCls}>{text}</span>);
  const emptyTxt = <span className="text-gray-400">{locked ? "Nicht dokumentiert" : "Hinzufügen …"}</span>;
  const btnSave = "px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition";
  const btnCancel = "px-2 py-1 text-xs rounded border border-[#DFE3EB] text-gray-500 hover:bg-gray-50 transition";
  const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "");
  const fmtMonth = (v) => (/^\d{4}-\d{2}$/.test(v || "") ? `${v.slice(5)}/${v.slice(0, 4)}` : v || "");

  // One text field of the record: click to edit, Speichern/Abbrechen
  const textField = (key, label, placeholder, multiline = true) => (
    <div key={key} className="min-w-0">
      {editKey !== key ? (
        <div {...edit(() => { setEditKey(key); setEditVal(td[key] || ""); })} className={edCls}>
          {lbl(label)}
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mt-0.5">{td[key] || emptyTxt}</p>
        </div>
      ) : (
        <div>
          <span className={lblCls}>{label}</span>
          {multiline
            ? <textarea autoFocus className={inputCls + " w-full mt-0.5"} rows={2} placeholder={placeholder} value={editVal} onChange={(e) => setEditVal(e.target.value)} />
            : <input autoFocus className={inputCls + " w-full mt-0.5"} placeholder={placeholder} value={editVal} onChange={(e) => setEditVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { saveTd({ [key]: editVal.trim() }); setEditKey(null); } }} />}
          <div className="flex gap-2 mt-1">
            <button className={btnSave} onClick={() => { saveTd({ [key]: editVal.trim() }); setEditKey(null); }}>Speichern</button>
            <button className={btnCancel} onClick={() => setEditKey(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );

  // Collapsible section card (a plain function, not a component, so inputs inside keep focus)
  const section = (id, n, title, summary, done, body) => (
    <div className="bg-white rounded-lg shadow-sm">
      <button type="button" className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left" aria-expanded={openSec[id]} onClick={() => toggleSec(id)}>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>{done ? "✓" : n}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-base font-semibold text-gray-800">{title}</span>
          {summary && <span className="block text-xs text-gray-500 mt-0.5">{summary}</span>}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${openSec[id] ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {openSec[id] && <div className="px-4 sm:px-5 pb-5 space-y-5">{body}</div>}
    </div>
  );

  // Vorbereitung: the Anamnese comes from the Aufklärungsbogen (its questionnaire), not from a
  // second form here. The Bogen of this Termin wins; otherwise the patient's latest one is shown.
  const isConsent = (d) => d._consentForm || d._docType === "aufklaerung";
  const consentDate = (d) => (d._createdAt || d.savedAt || "").slice(0, 10);
  const terminConsent = (patientDocs || []).filter((d) => isConsent(d) && inv._behandlungId && d._behandlungId === inv._behandlungId)
    .sort((x, y) => consentDate(y).localeCompare(consentDate(x)))[0] || null;
  const latestConsent = terminConsent || (patientDocs || []).filter(isConsent).sort((x, y) => consentDate(y).localeCompare(consentDate(x)))[0] || null;
  const consentFromOtherTermin = !!latestConsent && !terminConsent;
  const consentSigs = latestConsent?.consentData?._signatures;
  const consentRefused = !!latestConsent?.consentData?.refused;
  const consentSigned = !!(consentSigs?.patient && consentSigs?.doctor);
  const consentStatus = !latestConsent ? null : consentRefused ? "Abgelehnt" : consentSigned ? "Unterschrieben" : consentSigs?.patient ? "Ärzt:in fehlt" : "Entwurf";
  // Questions answered with "Ja", with the patient's own details
  const consentFindings = (() => {
    if (!latestConsent) return [];
    const a = latestConsent.consentData?.answers || latestConsent.consentData || {};
    const tpl = resolveConsentTemplate(latestConsent.consentData, practice);
    if (!tpl) return [];
    const qs = [...(tpl.questions || []), ...(a.geschlecht === "w" ? tpl.additionalQuestionsWomen || [] : [])];
    return qs.filter((q) => a[q.id] === true).map((q) => ({
      id: q.id, label: q.label,
      text: [a[q.id + "_text"], q.subQuestion && a.q13_komplikationen === true ? `Komplikationen: ${a.q13_komplikationen_text || "ja"}` : ""].filter(Boolean).join(" · "),
    }));
  })();
  const prepSummary = [
    !latestConsent ? "Kein Aufklärungsbogen" : `Aufklärung vom ${fmtDate(consentDate(latestConsent))}: ${consentStatus}`,
    latestConsent && !consentRefused ? (consentFindings.length ? `${consentFindings.length} ${consentFindings.length === 1 ? "Auffälligkeit" : "Auffälligkeiten"}` : "Anamnese unauffällig") : null,
    td.indikation ? "Indikation dokumentiert" : null,
  ].filter(Boolean).join(" · ");
  const prepDone = consentSigned && !consentRefused && !!td.indikation;

  // Abschluss
  const VERTRAEGLICHKEIT = [["keine", "Keine Auffälligkeiten"], ["haematom", "Hämatom"], ["schwellung", "Schwellung"], ["vasovagal", "Vasovagale Reaktion"], ["sonstiges", "Sonstiges"]];
  const NACHSORGE = [
    ["aufrecht", "4 Stunden aufrecht bleiben, nicht hinlegen"],
    ["sport", "24 Stunden kein Sport, keine Sauna, kein Alkohol"],
    ["massage", "Behandelte Areale nicht massieren oder reiben"],
    ["warnzeichen", "Warnzeichen und Kontaktweg besprochen"],
    ["blatt", "Nachsorgeblatt mitgegeben"],
  ];
  const nachsorge = td.nachsorge || [];
  const toggleNachsorge = (k) => { if (!locked) saveTd({ nachsorge: nachsorge.includes(k) ? nachsorge.filter((x) => x !== k) : [...nachsorge, k] }); };
  const vtLabel = (VERTRAEGLICHKEIT.find(([k]) => k === td.vertraeglichkeit) || [])[1];
  const plusDays = (iso, n) => { const d = new Date((iso || todayLocal()) + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const closeSummary = [vtLabel || "Verträglichkeit offen", `Nachsorge ${nachsorge.length}/${NACHSORGE.length}`, td.kontrollDatum ? `Kontrolle ${fmtDate(td.kontrollDatum)}` : null].filter(Boolean).join(" · ");
  const nachtraege = td.nachtraege || [];

  // Documents of the same Behandlung, earlier treatments of this patient
  const idOf = (d) => d._supabaseId || d.id;
  const behDocs = inv._behandlungId ? (patientDocs || []).filter((d) => d._behandlungId === inv._behandlungId && idOf(d) !== idOf(inv)) : [];
  // Honorarvereinbarung of this Termin: counts only when fully signed on or before the Behandlung
  const terminHvs = behDocs.filter((d) => d._hvOnly || d._docType === "hv");
  const signedHvBefore = terminHvs.find((h) => { const on = hvSignedDate(h); return !!on && (!td.behandlungsDatum || on <= td.behandlungsDatum); }) || null;
  const hvForCheck = signedHvBefore || terminHvs[0] || null;
  // Limit without HV from the stored Einkaufspreise, shown in Vorbereitung
  const storedMainPreis = parseDE(storedPreisStr(praepTotals[0]?.name || praep, qMainEinh));
  const extrasStored = praepTotals.slice(1).filter((t) => t.units > 0).every((t) => parseDE(storedPreisStr(t.name, t.einheit)) > 0);
  const prepMaxOhneHv = !isFillerSession && extrasStored ? maxOhneHvFor(storedMainPreis, sachkostenFor((t) => parseDE(storedPreisStr(t.name, t.einheit)))) : null;
  const startHv = () => {
    if (!onStartHvFromValues) return;
    onStartHvFromValues({ behandlungId: inv._behandlungId || null, praeparat: praep, einheit: qMainEinh, ml: qMainUnits, preisProMl: storedMainPreis || 0, wunschGesamt: 0, treatmentType: isFillerSession ? "filler" : "botox" });
    setViewingTreatment(null);
    setCenterView("timeline");
  };
  const earlier = (copySourceDocs || []).filter((d) => idOf(d) !== idOf(inv) && treatmentDateOf(d) < (td.behandlungsDatum || "9999"));
  const prev = earlier[0];
  const prevSummary = (d) => (d.treatmentDoc ? praeparateSummary(d.treatmentDoc) : [d.praeparat, d.einheit].filter(Boolean).join(" ")) || "Ohne Präparat";
  const prevTotals = prev?.treatmentDoc ? praeparatTotals(prev.treatmentDoc) : [];
  const prevDiff = !multiPraep && prevTotals.length === 1 && prevTotals[0].units > 0 && totalUnits > 0 && prevTotals[0].einheit === einh
    ? Math.round((totalUnits - prevTotals[0].units) * 100) / 100 : null;
  const openDoc = (d) => { if (onOpenDoc) onOpenDoc(d); };

  const title = (behandlung?.titel || "").trim() || praepSummary.replace(/ \d.*$/, "") || "Behandlung";
  const pill = (done, label, onClick) => (
    <button type="button" key={label} onClick={onClick} disabled={!onClick}
      className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${done ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"} ${onClick ? "hover:brightness-95" : "cursor-default"}`}>
      {done ? "✓ " : ""}{label}
    </button>
  );

  return (
    <>
      <div className="space-y-4">
        {!inModal && <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => { setViewingTreatment(null); setCenterView("timeline"); }}>&larr; Zur&uuml;ck zur &Uuml;bersicht</button>}

        {/* ── Summary header ── */}
        <div className="bg-white rounded-lg shadow-sm px-4 sm:px-5 py-4 flex flex-wrap gap-4 items-start justify-between">
          <div className="min-w-0 flex-1" style={{ flexBasis: 360 }}>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${locked ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{locked ? "Abgeschlossen" : "Dokumentiert"}</span>
              {inv.lastModifiedAt && inv.lastModifiedAt !== inv.savedAt && (
                <span className="text-[11px] text-gray-400" title={`Zuletzt geändert: ${new Date(inv.lastModifiedAt).toLocaleString("de-DE")}`}>Ge&auml;ndert {new Date(inv.lastModifiedAt).toLocaleDateString("de-DE")}</span>
              )}
            </div>
            <div className="mt-1">
              {!editDate ? (
                <div {...edit(() => { setInlineTempDate(td.behandlungsDatum || ""); setEditDate(true); })} className={edCls + " !inline-flex items-center gap-2 text-sm text-gray-600"}>
                  <span>{datumStr}{behandlung?.zeit ? ` · ${behandlung.zeit} Uhr` : ""}</span>
                  {!locked && editHint}
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <input type="date" className={inputCls + " bg-white"} style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light" }} value={inlineTempDate} onChange={(e) => setInlineTempDate(e.target.value)} />
                    <button className={btnSave} onClick={() => { saveInlineField("date", inlineTempDate); setEditDate(false); }}>{"✓"}</button>
                    <button className={btnCancel} onClick={() => setEditDate(false)}>{"✕"}</button>
                  </div>
                  {inv._behandlungId && <p className="text-[10px] text-gray-400 mt-1">Der Behandlungstermin in der &Uuml;bersicht wird mit angepasst.</p>}
                </div>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap mt-2.5">
              {behDocs.map((d) => { const st = getDocStatus ? getDocStatus(d) : { label: "", done: true }; const l = getDocLabel ? getDocLabel(d) : "Dokument"; return pill(!!st.done, `${l}${st.label && st.label !== "—" ? `: ${st.label}` : ""}`, () => openDoc(d)); })}
              {pill(hasInvoice, hasInvoice ? `Rechnung ${inv.invoiceMeta.nummer}` : "Keine Rechnung")}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap relative">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50 transition" onClick={() => downloadTreatmentDoc(inv)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
              PDF herunterladen
            </button>
            {onSendTreatmentDoc && (
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50 transition" onClick={() => onSendTreatmentDoc(inv)}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                Per E-Mail senden
              </button>
            )}
            <button type="button" aria-label="Weitere Aktionen" className="w-8 h-8 inline-flex items-center justify-center rounded border border-[#DFE3EB] text-gray-500 hover:bg-gray-50" onClick={() => setMenuOpen(!menuOpen)}>&#8943;</button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-10 z-20 w-64 bg-white rounded-lg shadow-lg border border-[#DFE3EB] py-1">
                  <button type="button" disabled={locked} title={locked ? "Abgeschlossene Behandlungen bleiben erhalten (§ 630f Abs. 3 BGB)" : undefined}
                    className={`w-full text-left px-3 py-2 text-sm ${locked ? "text-gray-400 cursor-not-allowed" : "text-red-600 hover:bg-red-50"}`}
                    onClick={() => { setMenuOpen(false); setConfirmDeleteTreatment(inv); }}>
                    {locked ? "Löschen nach Abschluss nicht möglich" : "Behandlung löschen"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {locked && (
          <div className="rounded-lg bg-blue-50 text-blue-900 px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M8 11V7a4 4 0 018 0v4" /></svg>
            <span className="flex-1" style={{ minWidth: 240 }}>Abgeschlossen am {fmtDT(td.abgeschlossenAm)}. Die Dokumentation ist gesperrt, Korrekturen gehen nur als Nachtrag (&sect; 630f BGB).</span>
            <button type="button" className="px-3 py-1.5 text-xs font-medium rounded bg-white text-blue-700 hover:bg-blue-100 transition" onClick={() => setNachtragOpen(true)}>Nachtrag hinzuf&uuml;gen</button>
          </div>
        )}

        <div className="flex flex-wrap gap-4 items-start">
          {/* ── Clinical record ── */}
          <div className="min-w-0 space-y-3" style={{ flex: "999 1 560px" }}>

            {section("prep", 1, "Vorbereitung", prepSummary, prepDone, <>
              <div>
                {lbl("Aufklärung und Anamnese", false)}
                {!latestConsent ? (
                  <div className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 flex items-center gap-3 flex-wrap">
                    <span className="flex-1" style={{ minWidth: 220 }}>Für diese Patient:in gibt es noch keinen Aufklärungsbogen. Die Anamnese wird dort erfasst.</span>
                    {onStartConsent && !locked && <button type="button" className="px-3 py-1.5 text-xs font-medium rounded bg-white text-amber-900 hover:bg-amber-100" onClick={() => onStartConsent(inv._behandlungId || null)}>Aufklärungsbogen erstellen</button>}
                  </div>
                ) : (
                  <div className="mt-1.5 rounded-lg bg-gray-50 px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" className="text-sm font-medium text-gray-800 hover:text-blue-600 text-left" onClick={() => openDoc(latestConsent)}>
                        Aufklärungsbogen vom {fmtDate(consentDate(latestConsent))}
                      </button>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${consentRefused ? "bg-red-50 text-red-700" : consentSigned ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{consentStatus}</span>
                      {consentFromOtherTermin && <span className="text-xs text-gray-500">aus einem früheren Termin</span>}
                    </div>
                    {consentRefused ? (
                      <p className="text-sm text-red-700">Die Patient:in hat die Einwilligung abgelehnt.</p>
                    ) : consentFindings.length === 0 ? (
                      <p className="text-sm text-gray-600">Anamnese unauffällig, alle Fragen mit Nein beantwortet.</p>
                    ) : (
                      <ul className="space-y-1">
                        {consentFindings.map((f) => (
                          <li key={f.id} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-amber-600 font-semibold flex-shrink-0">Ja</span>
                            <span>{f.label}{f.text ? <span className="text-gray-500"> {f.text}</span> : null}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {consentFromOtherTermin && onStartConsent && !locked && (
                      <p className="text-xs text-gray-500">
                        Hat sich seit dem {fmtDate(consentDate(latestConsent))} etwas geändert?{" "}
                        <button type="button" className="text-blue-600 hover:text-blue-700 font-medium" onClick={() => onStartConsent(inv._behandlungId || null)}>Neuen Aufklärungsbogen für diesen Termin</button>
                      </p>
                    )}
                  </div>
                )}
              </div>
              {!hasInvoice && (signedHvBefore || prepMaxOhneHv > 0 || (qMainUnits > 0 && !isFillerSession && !storedMainPreis)) && (
                <div>
                  {lbl("Honorar", false)}
                  {signedHvBefore ? (
                    <div className="mt-1.5 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-800">
                      Honorarvereinbarung am {fmtDate(hvSignedDate(signedHvBefore))} unterschrieben. Die Schnellrechnung kann bis zu den dort vereinbarten Sätzen abrechnen.
                    </div>
                  ) : prepMaxOhneHv > 0 ? (
                    <div className="mt-1.5 rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-700 flex items-center gap-3 flex-wrap">
                      <span className="flex-1" style={{ minWidth: 220 }}>
                        Ohne Honorarvereinbarung h&ouml;chstens <span className="font-semibold">{fmtBetrag(toDE(prepMaxOhneHv))} &euro;</span> (3,5-fach, {fmtNum(qMainUnits)} {qMainEinh} zum Einkaufspreis).
                        {" "}F&uuml;r mehr braucht es eine HV, die vor der Behandlung unterschrieben wird.
                      </span>
                      {onStartHvFromValues && !locked && <button type="button" className="px-3 py-1.5 text-xs font-medium rounded border border-[#DFE3EB] bg-white text-gray-700 hover:bg-gray-100" onClick={startHv}>Honorarvereinbarung erstellen</button>}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-gray-500">Hinterlege den Einkaufspreis f&uuml;r {praepTotals[0]?.name || praep} in den Praxis-Einstellungen, dann siehst Du hier den H&ouml;chstbetrag ohne Honorarvereinbarung.</p>
                  )}
                </div>
              )}
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {textField("wunsch", "Wunsch der Patient:in", "z.B. weniger müder Blick, Stirn soll beweglich bleiben")}
                {textField("befund", "Befund", "z.B. dynamische Glabellafalten Grad 3")}
                {textField("indikation", "Indikation", "z.B. ästhetisch, keine Kontraindikation")}
              </div>
            </>)}

            {section("proc", 2, "Durchführung",
              [praepSummary || "Kein Präparat", markerCount > 0 ? `${markerCount} ${markerCount === 1 ? "Stelle" : "Stellen"}` : null].filter(Boolean).join(" · "),
              markerCount > 0 && !!praep, <>
              {/* Präparate */}
              <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                {!editPraep ? (
                  <div {...edit(startEditPraep)} className={edCls}>
                    {lbl(multiPraep ? "Präparate" : "Präparat")}
                    <div className="mt-1 space-y-1">
                      {praepTotals.map((t) => (
                        <div key={t.idx} className="flex items-center gap-x-4 gap-y-0.5 flex-wrap text-sm">
                          <span className="flex items-center gap-2 font-medium text-gray-800">
                            {multiPraep && <span className="text-[10px] font-bold rounded bg-gray-800 text-white text-center flex-shrink-0" style={{ width: 18, height: 18, lineHeight: "18px" }}>{t.letter}</span>}
                            {t.name || "Ohne Namen"}{praepMengeStr(t) ? <span className="font-normal text-gray-500">{praepMengeStr(t)}</span> : null}
                          </span>
                          <span className="text-gray-500">Ch. {t.charge || <span className="text-gray-400">offen</span>}</span>
                          <span className="text-gray-500">Verf. {t.verfall ? fmtMonth(t.verfall) : <span className="text-gray-400">offen</span>}</span>
                          {t.rekonstitution && <span className="text-gray-500">{t.rekonstitution}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className={lblCls}>{inlineTempPraeparate.length > 1 ? "Präparate" : "Präparat"}</span>
                    {inlineTempPraeparate.map((p, idx) => {
                      const set = (patch) => setInlineTempPraeparate(inlineTempPraeparate.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
                      return (
                        <div key={idx} className="flex items-center gap-2 flex-wrap">
                          {inlineTempPraeparate.length > 1 && <span className="text-[10px] font-bold rounded bg-gray-800 text-white text-center flex-shrink-0" style={{ width: 18, height: 18, lineHeight: "18px" }}>{praepLetter(idx)}</span>}
                          <div className="w-40">
                            <PraeparatAutocomplete className={inputCls + " w-full bg-white"} value={p.name} placeholder="z.B. Bocouture"
                              suggestions={(practice.praeparate || []).filter((s) => s.name)}
                              onChange={(v) => set({ name: v })}
                              onSelect={(s) => set({ name: s.name, ...(s.einheit ? { einheit: s.einheit } : {}) })} />
                          </div>
                          <Select className={inputCls + " bg-white"} value={p.einheit} onChange={(e) => set({ einheit: e.target.value })}>
                            <option value="ml">ml</option><option value="SE">SE</option><option value="IE">IE</option>
                          </Select>
                          <input className={inputCls + " w-24 bg-white"} value={p.charge || ""} placeholder="Charge" title="Chargennummer" onChange={(e) => set({ charge: e.target.value })} />
                          <input type="month" className={inputCls + " w-36 bg-white"} value={p.verfall || ""} title="Verfallsdatum" aria-label="Verfallsdatum" onChange={(e) => set({ verfall: e.target.value })} />
                          <input className={inputCls + " w-56 bg-white"} value={p.rekonstitution || ""} placeholder="Rekonstitution, z.B. 50 SE in 1,25 ml" title="Rekonstitution" onChange={(e) => set({ rekonstitution: e.target.value })} />
                          {inlineTempPraeparate.length > 1 && (
                            <button type="button" className="p-1 rounded text-gray-300 hover:text-red-500 transition" title="Präparat entfernen" onClick={() => setInlineTempPraeparate(inlineTempPraeparate.filter((_, i) => i !== idx))}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <button type="button" className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => setInlineTempPraeparate([...inlineTempPraeparate, emptyPraeparat(inlineTempPraeparate[0]?.einheit || einh)])}>+ Weiteres Pr&auml;parat</button>
                    {inlineTempPraeparate.length > 1 && <p className="text-[10px] text-gray-400">Welches Pr&auml;parat an welchem Punkt verwendet wurde, legst Du beim Bearbeiten der Injektionspunkte fest (Buchstabe am Punkt).</p>}
                    <div className="flex gap-2">
                      <button className={btnSave} onClick={savePraep}>Speichern</button>
                      <button className={btnCancel} onClick={() => setEditPraep(false)}>Abbrechen</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                {textField("nadel", "Nadel / Kanüle", "z.B. 30G, 4 mm", false)}
                {textField("anaesthesie", "Anästhesie", "z.B. keine, Kühlung, EMLA", false)}
                {textField("technik", "Technik / Tiefe", "z.B. i.m., Frontalis oberflächlich", false)}
              </div>

              {/* Chart + points */}
              <div className="flex flex-wrap gap-5 items-start">
                <div style={{ flex: "0 1 420px", minWidth: 0, maxWidth: "100%" }}>
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
                      <ChartFigure markers={td.markers || []} view={shownView} facePhoto={td.facePhoto} size={420} dotSize={24} fontSize={11} praepCount={praepCount} onClick={locked ? undefined : openFaceEditor} />
                    ) : (
                      <div className={`flex items-center justify-center border border-[#DFE3EB] rounded-lg transition ${locked ? "" : "cursor-pointer hover:border-blue-200"}`} style={{ width: 420, maxWidth: "100%", aspectRatio: "1", background: "#fafafa" }} onClick={locked ? undefined : openFaceEditor}>
                        <p className="text-xs text-gray-400 px-6 text-center">{locked ? "Keine Injektionspunkte dokumentiert." : "Keine Injektionspunkte dokumentiert. Klicke, um welche zu setzen."}</p>
                      </div>
                    )}
                    {!locked && (
                      <button className="absolute bottom-3 right-3 p-1.5 bg-white rounded border border-[#DFE3EB] shadow-sm text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition" title="Injektionspunkte bearbeiten" onClick={openFaceEditor}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    )}
                  </div>
                  <VectorLegend markers={(td.markers || []).filter((m) => markerView(m) === shownView)} className="mt-2" />
                </div>

                <div className="min-w-0 space-y-3" style={{ flex: "1 1 260px" }}>
                  <div {...edit(openFaceEditor)} className={edCls}>
                    {lbl("Injektionspunkte")}
                    {markerCount > 0 ? (
                      <div className="mt-1.5 grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                        {(td.markers || []).map((m, idx) => !isGuide(m) && (
                          <div key={idx} className="flex items-center gap-2 flex-wrap">
                            <MarkerDot marker={m} idx={idx} size={22} fontSize={11} praepCount={praepCount} />
                            <span className="text-sm text-gray-700">{m.amount}{String(m.amount).match(/[xX×*]/) ? ` = ${evalAmount(m.amount)}` : ""} {unitFor(m)}</span>
                            {multiPraep && <span className="text-xs text-gray-400">{praeparate[markerPraepIdx(m, praepCount)]?.name || `Präparat ${praepLetter(markerPraepIdx(m, praepCount))}`}</span>}
                            <VectorSummary marker={m} className="text-xs text-gray-500" />
                            {detailViews.length > 1 && <span className="text-[11px] text-gray-400">{CHARTS.find((c) => c.id === markerView(m))?.label}</span>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-sm mt-0.5">{td.amount ? `Menge: ${td.amount} ${einh}` : emptyTxt}</p>}
                    {markerCount > 0 && (
                      <p className="text-sm font-medium text-gray-800 mt-2 pt-2 border-t border-gray-100">
                        {multiPraep ? praepSummary : `Gesamt: ${totalUnitsStr} ${einh}`} an {markerCount} {markerCount === 1 ? "Stelle" : "Stellen"}
                      </p>
                    )}
                  </div>
                  {prev && (
                    <button type="button" className="w-full text-left rounded-lg bg-gray-50 hover:bg-gray-100 transition px-3 py-2" onClick={() => openDoc(prev)}>
                      <span className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide">Letzte Behandlung, {fmtDate(treatmentDateOf(prev))}</span>
                      <span className="block text-sm text-gray-700 mt-0.5">
                        {prevSummary(prev)}
                        {prevDiff != null && <span className={`ml-1.5 font-medium ${prevDiff === 0 ? "text-gray-400" : "text-amber-700"}`}>{prevDiff === 0 ? "gleiche Menge" : `${prevDiff > 0 ? "+" : ""}${fmtNum(prevDiff)} ${einh} heute`}</span>}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </>)}

            {section("close", 3, "Abschluss", closeSummary, locked, <>
              <div>
                {lbl("Verträglichkeit", false)}
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  {VERTRAEGLICHKEIT.map(([k, label]) => {
                    const on = td.vertraeglichkeit === k;
                    return (
                      <button key={k} type="button" disabled={locked} aria-pressed={on} onClick={() => saveTd({ vertraeglichkeit: on ? "" : k })}
                        className={`px-3 py-1.5 text-xs rounded-full font-medium transition ${on ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} ${locked ? "cursor-default" : ""}`}>{label}</button>
                    );
                  })}
                </div>
                {td.vertraeglichkeit && td.vertraeglichkeit !== "keine" && <div className="mt-2">{textField("vertraeglichkeitNotiz", "Details und Maßnahmen", "z.B. Hämatom lateral rechts, gekühlt")}</div>}
              </div>
              <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
                <div>
                  {lbl("Nachsorge besprochen", false)}
                  <div className="mt-1.5 space-y-1">
                    {NACHSORGE.map(([k, label]) => (
                      <label key={k} className={`flex items-start gap-2.5 text-sm text-gray-700 py-0.5 ${locked ? "" : "cursor-pointer"}`}>
                        <input type="checkbox" className="mt-0.5 w-4 h-4 rounded" checked={nachsorge.includes(k)} disabled={locked} onChange={() => toggleNachsorge(k)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={lblCls}>Kontrolltermin <span className="normal-case tracking-normal font-normal">(optional)</span></span>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {locked
                      ? <p className="text-sm text-gray-700">{td.kontrollDatum ? fmtDate(td.kontrollDatum) : <span className="text-gray-400">Kein Kontrolltermin</span>}</p>
                      : <input type="date" className={inputCls + " bg-white"} style={{ colorScheme: "light" }} value={td.kontrollDatum || ""} onChange={(e) => saveTd({ kontrollDatum: e.target.value })} />}
                    {!locked && !td.kontrollDatum && <button type="button" className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => saveTd({ kontrollDatum: plusDays(td.behandlungsDatum, 14) })}>+14 Tage</button>}
                    {!locked && td.kontrollDatum && <button type="button" className="text-xs text-gray-500 hover:text-red-600 font-medium" onClick={() => saveTd({ kontrollDatum: "" })}>Entfernen</button>}
                  </div>
                </div>
              </div>
              {/* Notizen (intern) */}
              <div>
                {!editNotes ? (
                  <div {...edit(() => { setInlineTempNotes(td.notes || ""); setEditNotes(true); })} className={edCls}>
                    {lbl("Notizen (intern)")}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">{td.notes || emptyTxt}</p>
                  </div>
                ) : (
                  <div>
                    <span className={lblCls}>Notizen (intern)</span>
                    <textarea autoFocus className={inputCls + " w-full mt-0.5"} rows={3} value={inlineTempNotes} onChange={(e) => setInlineTempNotes(e.target.value)} />
                    <div className="flex gap-2 mt-1">
                      <button className={btnSave} onClick={() => { saveInlineField("notes", inlineTempNotes); setEditNotes(false); }}>Speichern</button>
                      <button className={btnCancel} onClick={() => setEditNotes(false)}>Abbrechen</button>
                    </div>
                  </div>
                )}
              </div>
              {!locked && (
                !confirmLock ? (
                  <div className="flex items-center gap-3 flex-wrap pt-1">
                    <button type="button" className="px-4 py-2 text-sm font-semibold rounded bg-blue-500 text-white hover:bg-blue-600 transition" onClick={() => setConfirmLock(true)}>Behandlung abschlie&szlig;en</button>
                    <span className="text-xs text-gray-500">Danach ist die Dokumentation gesperrt, Korrekturen nur als Nachtrag.</span>
                  </div>
                ) : (
                  <div className="rounded-lg bg-blue-50 px-3 py-3 text-sm text-blue-900">
                    <p>Nach dem Abschlie&szlig;en kannst Du Anamnese, Pr&auml;parate, Punkte und Notizen nicht mehr &auml;ndern, nur Nachtr&auml;ge erg&auml;nzen. Rechnung und Hinweis f&uuml;r Patient:in bleiben bearbeitbar.</p>
                    <div className="flex gap-2 mt-2">
                      <button type="button" className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-500 text-white hover:bg-blue-600" onClick={() => { saveTd({ abgeschlossenAm: new Date().toISOString() }); setConfirmLock(false); setOpenSec({ prep: false, proc: true, close: false }); }}>Jetzt abschlie&szlig;en</button>
                      <button type="button" className={btnCancel + " bg-white"} onClick={() => setConfirmLock(false)}>Abbrechen</button>
                    </div>
                  </div>
                )
              )}
            </>)}

            {(nachtraege.length > 0 || nachtragOpen) && (
              <div className="bg-white rounded-lg shadow-sm px-4 sm:px-5 py-4 space-y-2">
                <span className={lblCls}>Nachtr&auml;ge</span>
                {nachtraege.map((n, i) => (
                  <div key={i} className="rounded-md bg-gray-50 px-3 py-2">
                    <p className="text-[11px] text-gray-400">{fmtDT(n.at)}</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">{n.text}</p>
                  </div>
                ))}
                {nachtragOpen ? (
                  <div>
                    <textarea autoFocus className={inputCls + " w-full"} rows={3} placeholder="z.B. Telefonische Rückmeldung nach 3 Tagen: kleines Hämatom, rückläufig." value={nachtragText} onChange={(e) => setNachtragText(e.target.value)} />
                    <div className="flex gap-2 mt-1">
                      <button className={btnSave} disabled={!nachtragText.trim()} onClick={() => { saveTd({ nachtraege: [...nachtraege, { at: new Date().toISOString(), text: nachtragText.trim() }] }); setNachtragText(""); setNachtragOpen(false); }}>Nachtrag speichern</button>
                      <button className={btnCancel} onClick={() => { setNachtragText(""); setNachtragOpen(false); }}>Abbrechen</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="text-xs text-blue-500 hover:text-blue-700 font-medium" onClick={() => setNachtragOpen(true)}>+ Nachtrag</button>
                )}
              </div>
            )}
          </div>

          {/* ── Side column: billing, documents, history. One column next to the record,
               two-up underneath it on tablets ── */}
          <div className="min-w-0 grid gap-3 items-start" style={{ flex: "1 1 280px", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            <div className="bg-white rounded-lg shadow-sm px-4 py-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Abrechnung</h3>
              {hasInvoice ? (
                <p className="text-sm text-gray-700">Rechnung {inv.invoiceMeta.nummer} vom {fmtDate(inv.invoiceMeta.datum)}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Noch keine Rechnung zu dieser Behandlung.</p>
                  <button
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded transition ${markerCount > 0 && praep ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                    disabled={!(markerCount > 0 && praep)}
                    title={markerCount > 0 && praep ? undefined : "Erst Präparat und Injektionspunkte dokumentieren"}
                    onClick={openQuickInvoiceModal}
                  >
                    Rechnung erstellen
                  </button>
                </>
              )}
              {/* Hinweis für Patient:in (printed on the PDF), billing: stays editable after the lock */}
              <div className="pt-3 border-t border-gray-100">
                {!editHinweis ? (
                  <div {...clickEdit(() => { setInlineTempHinweis(td.patientHinweis || ""); setInlineTempBetrag(td.patientBetrag || ""); setEditHinweis(true); })} className={editableCls}>
                    {fieldLabel("Hinweis für Patient:in")}
                    <div className="text-sm text-gray-600 mt-0.5">
                      <p className="whitespace-pre-wrap">{td.patientHinweis || <span className="text-gray-400">Hinzufügen …</span>}</p>
                      {td.patientBetrag && <p className="mt-0.5 font-medium text-gray-700">Betrag: {fmtBetrag(td.patientBetrag)} &euro;</p>}
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className={lblCls}>Hinweis f&uuml;r Patient:in</span>
                    <textarea autoFocus className={inputCls + " w-full mt-0.5"} rows={3} placeholder="Erscheint auf dem PDF" value={inlineTempHinweis} onChange={(e) => setInlineTempHinweis(e.target.value)} />
                    <div className="relative w-36 mt-1.5">
                      <input type="text" inputMode="decimal" className={inputCls + " w-full pr-7"} placeholder="Betrag, z.B. 45,00" value={inlineTempBetrag} onChange={(e) => setInlineTempBetrag(e.target.value)} />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">&euro;</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Mit Betrag werden Deine Bankdaten aus den Praxis-Einstellungen mitgedruckt.</p>
                    <div className="flex gap-2 mt-1">
                      <button className={btnSave} onClick={() => { saveInlineField("hinweis", { text: inlineTempHinweis, betrag: inlineTempBetrag }); setEditHinweis(false); }}>Speichern</button>
                      <button className={btnCancel} onClick={() => setEditHinweis(false)}>Abbrechen</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {behDocs.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm px-4 py-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Dokumente dieses Termins</h3>
                <div className="-mx-2">
                  {behDocs.map((d) => {
                    const st = getDocStatus ? getDocStatus(d) : { label: "", done: true };
                    return (
                      <button key={idOf(d)} type="button" className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 text-left" onClick={() => openDoc(d)}>
                        <span className="text-sm text-gray-700 truncate">{getDocLabel ? getDocLabel(d) : "Dokument"}{d.invoiceMeta?.nummer && d.invoiceMeta.nummer !== "—" ? <span className="text-xs text-gray-400"> {d.invoiceMeta.nummer}</span> : null}</span>
                        {st.label && st.label !== "—" && <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${st.done ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{st.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {earlier.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm px-4 py-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Fr&uuml;here Behandlungen</h3>
                <div className="-mx-2">
                  {earlier.slice(0, 4).map((d) => (
                    <button key={idOf(d)} type="button" className="w-full text-left px-2 py-2 rounded-md hover:bg-gray-50" onClick={() => openDoc(d)}>
                      <span className="block text-xs text-gray-400">{fmtDate(treatmentDateOf(d))}</span>
                      <span className="block text-sm text-gray-700">{prevSummary(d)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm px-4 py-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Verlauf</h3>
              <div className="space-y-1.5 text-xs">
                {[
                  [inv._createdAt || inv.savedAt, "Angelegt"],
                  [inv.lastModifiedAt && inv.lastModifiedAt !== inv.savedAt ? inv.lastModifiedAt : null, "Zuletzt geändert"],
                  [td.abgeschlossenAm, "Abgeschlossen"],
                  ...nachtraege.map((n) => [n.at, "Nachtrag"]),
                ].filter(([t]) => t).map(([t, l], i) => (
                  <div key={i} className="flex gap-3"><span className="text-gray-400 whitespace-nowrap">{fmtDT(t)}</span><span className="text-gray-700">{l}</span></div>
                ))}
              </div>
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
          // Shown from the start, not only once the amount is too high
          const maxOhneHvAlways = !fillerPraep && qPreisProMl > 0 && extrasValid ? maxOhneHvFor(qPreisProMl, sachkosten) : null;
          // A signed HV of this Termin covers rates above 3,5-fach up to the agreed ones
          const hvCheck = aboveHv && hvForCheck ? checkHvForInvoice(hvForCheck, td.behandlungsDatum, lineItems) : null;
          const hvCovers = !!hvCheck?.ok;
          // Einkaufspreis differs from the Praxis settings (§ 10 GOÄ)
          const storedMain = storedPreisStr(mainT.name || praep, qEinh);
          const preisAbweichung = storedMain && qPreisProMl > 0 && Math.abs(parseDE(storedMain) - qPreisProMl) > 0.005;
          const externDatumOk = !!quickInvoiceHvExternDatum && (!td.behandlungsDatum || quickInvoiceHvExternDatum <= td.behandlungsDatum);
          const hvOk = !aboveHv || hvCovers || (quickInvoiceHvVerzicht && externDatumOk);
          const isValid = effectiveWunsch > 0 && qPreisProMl > 0 && extrasValid && quickInvoiceNummer.trim() && effectiveMax > 0 && hvOk && (!needsBegruendung || quickInvoiceBegruendung.trim());

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
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Einkaufspreis pro {qEinh} (&euro;){multiPraep ? ` – ${mainT.name || "Präparat A"} (${fmtNum(qMl)} ${qEinh})` : ""}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={inputCls + " w-full"}
                        placeholder="z.B. 4,50"
                        value={quickInvoicePreisStr}
                        onChange={(e) => setQuickInvoicePreisStr(e.target.value)}
                        autoFocus
                      />
                      {preisAbweichung ? (
                        <p className="text-xs text-amber-700 mt-0.5">Weicht vom hinterlegten Einkaufspreis ab ({storedMain} &euro;). Nach &sect; 10 GO&Auml; darfst Du nur den tats&auml;chlichen Einkaufspreis berechnen.</p>
                      ) : !storedMain ? (
                        <p className="text-xs text-gray-400 mt-0.5">Tats&auml;chlicher Einkaufspreis (&sect; 10 GO&Auml;). Hinterlege ihn in den Praxis-Einstellungen, dann wird er vorausgef&uuml;llt.</p>
                      ) : null}
                    </div>
                    {extraT.map((t) => (
                      <div key={t.idx}>
                        <label className="block text-xs font-medium text-gray-500 mb-0.5">Einkaufspreis pro {t.einheit} (&euro;) &ndash; {t.name || `Präparat ${t.letter}`} ({fmtNum(t.units)} {t.einheit})</label>
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
                      {maxOhneHvAlways > 0 && !hvForCheck && (
                        <p className="text-xs text-gray-500 mt-1">Ohne Honorarvereinbarung h&ouml;chstens {fmtBetrag(toDE(maxOhneHvAlways))} &euro;</p>
                      )}
                      {qPreisProMl > 0 && (
                        <div className="mt-1.5">
                          <div className="text-xs text-gray-500">
                            <span className="text-gray-400">Max. Steigerungssatz: </span>
                            <span className="font-semibold text-gray-700">{effectiveMax.toFixed(2).replace(".", ",")}x</span>
                            {effectiveMax > 3.5 && <span className="ml-1 text-amber-600 text-xs">nur mit HV</span>}
                          </div>
                          {aboveHv && hvCovers && (
                            <div className="mt-1.5 px-2.5 py-1.5 border rounded text-xs bg-green-50 border-green-200 text-green-800">
                              Abgedeckt durch die Honorarvereinbarung, unterschrieben am {fmtDate(hvCheck.signedOn)}. Die Rechnung wird mit ihr verkn&uuml;pft.
                            </div>
                          )}
                          {aboveHv && !hvCovers && (
                            <div className={`mt-1.5 px-2.5 py-1.5 border rounded text-xs ${quickInvoiceHvVerzicht && externDatumOk ? "bg-gray-50 border-[#DFE3EB] text-gray-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                              {hvCheck && hvCheck.reason !== "missing" && <p className="mb-1.5 font-medium">{hvProblemText(hvCheck, td.behandlungsDatum)}</p>}
                              &Uuml;ber 3,5-fach nur mit einer Honorarvereinbarung, die vor der Behandlung unterschrieben wurde (&sect; 2 Abs. 2 GO&Auml;). Erstelle die Rechnung dann &uuml;ber &bdquo;+ Rechnung&ldquo; aus der HV.
                              {onStartHvFromValues && !hvForCheck && (
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
                              <div className="mt-2 pt-2 border-t border-current/10">
                                <p className="font-medium mb-1">Honorarvereinbarung au&szlig;erhalb von EPHIA</p>
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <span className="flex items-center h-4 flex-shrink-0">
                                    <input type="checkbox" className="m-0 w-3.5 h-3.5 rounded" checked={quickInvoiceHvVerzicht} onChange={(e) => setQuickInvoiceHvVerzicht(e.target.checked)} />
                                  </span>
                                  <span className="leading-4">{HV_WAIVER_TEXT}</span>
                                </label>
                                {quickInvoiceHvVerzicht && (
                                  <label className="mt-2 flex items-center gap-2 flex-wrap">
                                    <span>Unterschrieben am</span>
                                    <input type="date" className={inputCls + " bg-white text-xs"} style={{ colorScheme: "light" }} max={td.behandlungsDatum || undefined} value={quickInvoiceHvExternDatum} onChange={(e) => setQuickInvoiceHvExternDatum(e.target.value)} />
                                    {quickInvoiceHvExternDatum && !externDatumOk && <span className="w-full text-red-600">Die HV muss vor der Behandlung ({fmtDate(td.behandlungsDatum)}) unterschrieben sein.</span>}
                                  </label>
                                )}
                              </div>
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
                          // Never creates an HV (§ 2 Abs. 2 GOÄ); links the signed HV of this Termin when it covers the rates
                          hasHV: aboveHv && hvCovers,
                          fromHvId: aboveHv && hvCovers ? (hvForCheck.id || null) : null,
                          begruendung: needsBegruendung ? quickInvoiceBegruendung.trim() : "",
                          hvVerzicht: aboveHv && !hvCovers && quickInvoiceHvVerzicht,
                          hvExternSignedOn: aboveHv && !hvCovers && quickInvoiceHvVerzicht ? quickInvoiceHvExternDatum : "",
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
