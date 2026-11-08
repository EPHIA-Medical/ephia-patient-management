import React, { useState } from "react";
import { PrimaryButton, ListSearch, thCls } from "../ui/ListCard";
import { fmtDate, fmt, evalAmount } from "../../utils/helpers";
import { resolveConsentTemplate, consentTemplateLabel } from "../consent/consentTemplateStore";
import { spawnConfetti } from "../ui/ConfettiBurst";
import { invoiceGesamt } from "../../utils/invoiceTotals";
import { getPraeparate } from "../../utils/praeparate";

// All Präparate of a document, e.g. "Bocouture, Relfydess"
const praepNames = (inv) => {
  const td = inv.treatmentDoc;
  const names = td ? getPraeparate(td).map((p) => p.name).filter(Boolean) : [];
  return names.length > 0 ? names.join(", ") : (inv.praeparat || "");
};

// ═══════════════════ Invoice List View ═══════════════════

export default function InvoiceListView({ invoices, kleinunternehmer, onView, onViewHV, onViewTD, onDelete, onPrint, onPrintHV, onPrintTD, onDownload, onDownloadHV, onDownloadTD, onDownloadConsent, onBack, onUpdateInvoice, patients, onNewForPatient, onNewHVForPatient, onNewConsentForPatient, initialTab, onTabChange }) {
  const [tab, setTab] = React.useState(initialTab || "rechnungen");
  const [sortKey, setSortKey] = React.useState(null);
  const [sortDir, setSortDir] = React.useState("asc");
  const [search, setSearch] = React.useState("");
  const [showNewPicker, setShowNewPicker] = React.useState(false);
  const [newPickerSearch, setNewPickerSearch] = React.useState("");
  const newPickerRef = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => { if (newPickerRef.current && !newPickerRef.current.contains(e.target)) setShowNewPicker(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fullName = (p) => [p?.vorname, p?.nachname].filter(Boolean).join(" ") || p?.name || "";
  const safePatient = (inv) => inv.patient || {};

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#DFE3EB] p-8 text-center">
        <div className="text-gray-300 text-4xl mb-3"></div>
        <p className="text-sm text-gray-500 mb-1">Noch keine Dokumente erstellt.</p>
        <p className="text-xs text-gray-400">Erstelle Deine erste Rechnung, um sie hier zu sehen.</p>
        <button className="mt-4 px-4 py-2 text-sm rounded-lg border border-[#DFE3EB] text-gray-600 hover:bg-gray-50" onClick={onBack}>
          ← Neue Rechnung erstellen
        </button>
      </div>
    );
  }

  const hvInvoices = invoices.filter((inv) => !inv._standalone && !inv._consentForm && (inv.hasHV != null ? inv.hasHV : (inv.lineItems || []).some((it) => it.steigerung != null && it.steigerung > 3.5)));

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key) => {
    if (sortKey !== key) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const sortedList = (list, getters) => {
    if (!sortKey || !getters[sortKey]) return list;
    const getter = getters[sortKey];
    return [...list].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
  };

  const thClsR = "text-right px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 select-none whitespace-nowrap";

  const tabBtnCls = (active) =>
    `px-3 py-2 text-sm font-medium border-b-2 rounded-t transition outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
      active ? "border-blue-500 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300"
    }`;

  const parseNummer = (nr) => { const m = String(nr || "").match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; };
  const rechnungGetters = {
    vorname: (inv) => safePatient(inv).vorname || (safePatient(inv).name || "").split(" ")[0] || "",
    nachname: (inv) => safePatient(inv).nachname || (safePatient(inv).name || "").split(" ").slice(1).join(" ") || "",
    nummer: (inv) => parseNummer(inv.invoiceMeta.nummer),
    datum: (inv) => inv.invoiceMeta.datum || "",
    betrag: (inv) => { const zw = (inv.lineItems || []).reduce((s, it) => s + (it.betrag || 0), 0); const invMed = !!(inv.invoiceMeta && inv.invoiceMeta.diagnose); const invK = inv._kleinunternehmer != null ? inv._kleinunternehmer : kleinunternehmer; const noMwst = invK || invMed; return zw + (noMwst ? 0 : Math.round(zw * 0.19 * 100) / 100); },
    status: (inv) => inv.paymentStatus || "ausstehend",
  };

  const hvGetters = {
    vorname: (inv) => safePatient(inv).vorname || (safePatient(inv).name || "").split(" ")[0] || "",
    nachname: (inv) => safePatient(inv).nachname || (safePatient(inv).name || "").split(" ").slice(1).join(" ") || "",
    erstelltAm: (inv) => inv._createdAt || inv.savedAt || "",
    datum: (inv) => inv.invoiceMeta.datum || "",
    nummer: (inv) => parseNummer(inv.invoiceMeta.nummer),
  };

  const matchInvoice = (inv, s) => {
    const p = safePatient(inv);
    const vorname = (p.vorname || (p.name || "").split(" ")[0] || "").toLowerCase();
    const nachname = (p.nachname || (p.name || "").split(" ").slice(1).join(" ") || "").toLowerCase();
    const nummer = (inv.invoiceMeta.nummer || "").toLowerCase();
    const datum = inv.invoiceMeta.datum ? fmtDate(inv.invoiceMeta.datum).toLowerCase() : "";
    const datumRaw = (inv.invoiceMeta.datum || "").toLowerCase();
    const createdAt = inv._createdAt ? fmtDate(inv._createdAt.slice(0, 10)).toLowerCase() : (inv.savedAt ? fmtDate(inv.savedAt.slice(0, 10)).toLowerCase() : "");
    return vorname.includes(s) || nachname.includes(s) || nummer.includes(s) || datum.includes(s) || datumRaw.includes(s) || createdAt.includes(s);
  };

  const rechnungenOnly = invoices.filter(inv => !inv._hvOnly && !inv._standalone && !inv._consentForm);
  const searchFiltered = search.trim()
    ? rechnungenOnly.filter((inv) => matchInvoice(inv, search.toLowerCase()))
    : rechnungenOnly;

  const hvSearchFiltered = search.trim()
    ? hvInvoices.filter((inv) => matchInvoice(inv, search.toLowerCase()))
    : hvInvoices;

  const tdInvoices = invoices.filter((inv) => inv.treatmentDoc && !inv._consentForm);
  const tdSearchFiltered = search.trim()
    ? tdInvoices.filter((inv) => matchInvoice(inv, search.toLowerCase()))
    : tdInvoices;

  const consentListInvoices = invoices.filter((inv) => inv._consentForm);
  const consentSearchFiltered = search.trim()
    ? consentListInvoices.filter((inv) => matchInvoice(inv, search.toLowerCase()))
    : consentListInvoices;

  const tdGetters = {
    vorname: (inv) => safePatient(inv).vorname || (safePatient(inv).name || "").split(" ")[0] || "",
    nachname: (inv) => safePatient(inv).nachname || (safePatient(inv).name || "").split(" ").slice(1).join(" ") || "",
    behandlungsDatum: (inv) => (inv.treatmentDoc || {}).behandlungsDatum || inv.invoiceMeta.datum || "",
    praeparat: (inv) => praepNames(inv),
    nummer: (inv) => parseNummer(inv.invoiceMeta.nummer),
    erstelltAm: (inv) => inv._createdAt || inv.savedAt || "",
  };

  return (
    <div className="bg-white rounded-lg border border-[#DFE3EB]">
      <div className="px-3 sm:px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 relative z-10">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto hide-scrollbar">
          <button className={tabBtnCls(tab === "rechnungen") + " whitespace-nowrap flex-shrink-0"} onClick={() => { setTab("rechnungen"); setSortKey(null); if (onTabChange) onTabChange("rechnungen"); }}>
            Rechnungen
          </button>
          <button className={tabBtnCls(tab === "hv") + " whitespace-nowrap flex-shrink-0"} onClick={() => { setTab("hv"); setSortKey(null); if (onTabChange) onTabChange("hv"); }}>
            <span className="xl:hidden">HV</span><span className="hidden xl:inline">Honorarvereinbarungen</span>
          </button>
          <button className={tabBtnCls(tab === "td") + " whitespace-nowrap flex-shrink-0"} onClick={() => { setTab("td"); setSortKey(null); if (onTabChange) onTabChange("td"); }}>
            <span className="xl:hidden">Behandl.</span><span className="hidden xl:inline">Behandlungsdokumentationen</span>
          </button>
          <button className={tabBtnCls(tab === "consent") + " whitespace-nowrap flex-shrink-0"} onClick={() => { setTab("consent"); setSortKey(null); if (onTabChange) onTabChange("consent"); }}>
            <span className="xl:hidden">Aufkl.</span><span className="hidden xl:inline">Aufklärungsbögen</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {patients && patients.length > 0 && (tab === "rechnungen" || tab === "hv" || tab === "consent") && (
            <div ref={newPickerRef} className="relative">
              <PrimaryButton onClick={() => { setShowNewPicker(!showNewPicker); setNewPickerSearch(""); }}>Neu</PrimaryButton>
              {showNewPicker && (() => {
                const filtered = (patients || []).filter(p => {
                  if (!newPickerSearch.trim()) return true;
                  const s = newPickerSearch.toLowerCase();
                  const d = p.data || p._raw?.data || p;
                  return (d.vorname || "").toLowerCase().includes(s) || (d.nachname || "").toLowerCase().includes(s);
                });
                return (
                  <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1 w-64 bg-white border border-[#DFE3EB] rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                      <input
                        autoFocus
                        className="w-full px-2.5 py-1.5 text-xs border border-[#DFE3EB] rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="Patient suchen..."
                        value={newPickerSearch}
                        onChange={(e) => setNewPickerSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filtered.slice(0, 20).map((p, i) => {
                        const d = p.data || p._raw?.data || p;
                        return (
                          <button
                            key={p.id || i}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setShowNewPicker(false);
                              if (tab === "consent") onNewConsentForPatient(p);
                              else if (tab === "hv") onNewHVForPatient(p);
                              else onNewForPatient(p);
                            }}
                          >
                            <span className="font-medium">{d.vorname} {d.nachname}</span>
                          </button>
                        );
                      })}
                      {filtered.length === 0 && (
                        <p className="text-xs text-gray-400 px-3 py-2">Kein Patient gefunden</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <ListSearch value={search} onChange={setSearch} />
        </div>
      </div>

      {tab === "rechnungen" && (
        <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className={thCls} onClick={() => handleSort("vorname")}>Vorname{sortIndicator("vorname")}</th>
              <th className={thCls} onClick={() => handleSort("nachname")}>Nachname{sortIndicator("nachname")}</th>
              <th className={thCls} onClick={() => handleSort("nummer")}>Rechnungsnr.{sortIndicator("nummer")}</th>
              <th className={thCls} onClick={() => handleSort("datum")}>Rechnungsdatum{sortIndicator("datum")}</th>
              <th className={thCls} onClick={() => handleSort("betrag")}>Betrag{sortIndicator("betrag")}</th>
              <th className={thCls} onClick={() => handleSort("status")}>Status{sortIndicator("status")}</th>
              <th className="text-right px-5 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide" style={{ width: "140px" }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {sortedList(searchFiltered, rechnungGetters).map((inv) => {
              const p = safePatient(inv);
              const vorname = p.vorname || (p.name || "").split(" ")[0] || "";
              const nachname = p.nachname || (p.name || "").split(" ").slice(1).join(" ") || "";
              const isPaid = inv.paymentStatus === "bezahlt";
              const gesamt = invoiceGesamt(inv, kleinunternehmer);
              return (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-blue-50 transition cursor-pointer" onClick={() => onView(inv)}>
                  <td className="px-3 py-3 align-middle">
                    <span className="text-sm text-gray-700">{vorname}</span>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span className="text-sm font-medium text-gray-700">{nachname}</span>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span className="text-sm text-gray-500">{inv.invoiceMeta.nummer}</span>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span className="text-sm text-gray-500">{fmtDate(inv.invoiceMeta.datum)}</span>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span className="text-sm text-gray-700">{fmt(gesamt)} €</span>
                  </td>
                  <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${isPaid ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}
                      style={{ minWidth: 80 }}
                      title={isPaid ? `Bezahlt${inv.paidAt ? ` am ${fmtDate(inv.paidAt)}` : ""}. Klicken, um als ausstehend zu markieren` : "Als bezahlt markieren (Zahlungseingang heute)"}
                      onClick={(e) => { if (!isPaid) spawnConfetti(e.currentTarget); if (onUpdateInvoice) onUpdateInvoice({ ...inv, paymentStatus: isPaid ? "ausstehend" : "bezahlt" }); }}
                    >
                      {isPaid ? "Bezahlt" : "Ausstehend"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition" title="PDF herunterladen" onClick={() => onDownload(inv)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                      </button>
                      <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition" title="Drucken" onClick={() => onPrint(inv)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      </button>
                      <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition" title="Löschen" onClick={() => onDelete(inv.id)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {tab === "hv" && (
        hvInvoices.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-500">Keine Honorarvereinbarungen vorhanden.</p>
            <p className="text-xs text-gray-400 mt-1">Honorarvereinbarungen werden automatisch erstellt, wenn der Steigerungssatz über 3,5 liegt.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className={thCls} onClick={() => handleSort("vorname")}>Vorname{sortIndicator("vorname")}</th>
                <th className={thCls} onClick={() => handleSort("nachname")}>Nachname{sortIndicator("nachname")}</th>
                <th className={thCls} onClick={() => handleSort("nummer")}>Rechnungsnr.{sortIndicator("nummer")}</th>
                <th className={thCls} onClick={() => handleSort("datum")}>Rechnungsdatum{sortIndicator("datum")}</th>
                <th className={thCls} onClick={() => handleSort("erstelltAm")}>Erstellt am{sortIndicator("erstelltAm")}</th>
                <th className="text-right px-5 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide" style={{ width: "140px" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {sortedList(hvSearchFiltered, hvGetters).map((inv) => {
                const createdAt = inv._createdAt ? fmtDate(inv._createdAt.slice(0, 10)) : (inv.savedAt ? fmtDate(inv.savedAt.slice(0, 10)) : "–");
                const p = safePatient(inv);
                const vorname = p.vorname || (p.name || "").split(" ")[0] || "";
                const nachname = p.nachname || (p.name || "").split(" ").slice(1).join(" ") || "";
                return (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-blue-50 transition cursor-pointer" onClick={() => onViewHV(inv)}>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-sm text-gray-700">{vorname}</span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-sm font-medium text-gray-700">{nachname}</span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-sm text-gray-500">{inv.invoiceMeta.nummer}</span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-sm text-gray-500">{fmtDate(inv.invoiceMeta.datum)}</span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-xs text-gray-400">{createdAt}</span>
                    </td>
                    <td className="px-5 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition" title="PDF herunterladen" onClick={() => onDownloadHV(inv)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                        </button>
                        <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition" title="Drucken" onClick={() => onPrintHV(inv)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        </button>
                        <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition" title="Löschen" onClick={() => onDelete(inv.id)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )
      )}

      {tab === "td" && (
        tdInvoices.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-500">Keine Behandlungsdokumentationen vorhanden.</p>
            <p className="text-xs text-gray-400 mt-1">Behandlungsdokumentationen werden auf der Patient:innenebene erstellt.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className={thCls} onClick={() => handleSort("vorname")}>Vorname{sortIndicator("vorname")}</th>
                <th className={thCls} onClick={() => handleSort("nachname")}>Nachname{sortIndicator("nachname")}</th>
                <th className={thCls} onClick={() => handleSort("behandlungsDatum")}>Behandlungsdatum{sortIndicator("behandlungsDatum")}</th>
                <th className={thCls} onClick={() => handleSort("praeparat")}>Präparat{sortIndicator("praeparat")}</th>
                <th className={thCls} onClick={() => handleSort("nummer")}>Rechnungsnr.{sortIndicator("nummer")}</th>
                <th className={thCls} onClick={() => handleSort("erstelltAm")}>Erstellt am{sortIndicator("erstelltAm")}</th>
                <th className="text-right px-5 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide" style={{ width: "140px" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {sortedList(tdSearchFiltered, tdGetters).map((inv) => {
                const td = inv.treatmentDoc || {};
                const p = safePatient(inv);
                const vorname = p.vorname || (p.name || "").split(" ")[0] || "";
                const nachname = p.nachname || (p.name || "").split(" ").slice(1).join(" ") || "";
                const datumStr = td.behandlungsDatum ? fmtDate(td.behandlungsDatum) : fmtDate(inv.invoiceMeta.datum);
                const praep = praepNames(inv) || "–";
                const hasInvoice = inv.invoiceMeta.nummer && inv.invoiceMeta.nummer !== "—";
                const createdAt = inv._createdAt ? fmtDate(inv._createdAt.slice(0, 10)) : (inv.savedAt ? fmtDate(inv.savedAt.slice(0, 10)) : "–");
                return (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-blue-50 transition cursor-pointer" onClick={() => onViewTD(inv)}>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-sm text-gray-700">{vorname}</span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-sm font-medium text-gray-700">{nachname}</span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-sm text-gray-500">{datumStr}</span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-sm text-gray-500">{praep}</span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {hasInvoice ? <span className="text-sm text-gray-500">{inv.invoiceMeta.nummer}</span> : <span className="text-xs text-gray-400">–</span>}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="text-xs text-gray-400">{createdAt}</span>
                    </td>
                    <td className="px-5 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition" title="PDF herunterladen" onClick={() => onDownloadTD(inv)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                        </button>
                        <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition" title="Drucken" onClick={() => onPrintTD(inv)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        </button>
                        <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition" title="Löschen" onClick={() => onDelete(inv.id)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )
      )}

      {tab === "consent" && (
        consentSearchFiltered.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-500">Keine Aufklärungsbögen vorhanden.</p>
            <p className="text-xs text-gray-400 mt-1">Aufklärungsbögen werden auf der Patient:innenebene erstellt.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className={thCls}>Vorname</th>
                <th className={thCls}>Nachname</th>
                <th className={thCls}>Vorlage</th>
                <th className={thCls}>Datum</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Erstellt am</th>
                <th className="text-right px-5 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide" style={{ width: "100px" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {consentSearchFiltered.map((inv) => {
                const p = safePatient(inv);
                const vorname = p.vorname || (p.name || "").split(" ")[0] || "";
                const nachname = p.nachname || (p.name || "").split(" ").slice(1).join(" ") || "";
                const cd = inv.consentData || {};
                const templateName = consentTemplateLabel(resolveConsentTemplate(cd)).substring(0, 30) || "–";
                const createdAt = inv._createdAt ? fmtDate(inv._createdAt.slice(0, 10)) : (inv.savedAt ? fmtDate(inv.savedAt.slice(0, 10)) : "–");
                const isRefused = cd.refused;
                const hasPatientSig = !!cd._signatures?.patient;
                const hasDoctorSig = !!cd._signatures?.doctor;
                const consentStatus = isRefused ? "refused" : (hasPatientSig && hasDoctorSig) ? "complete" : hasPatientSig ? "pending_doctor" : "draft";
                return (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-blue-50 transition cursor-pointer" onClick={() => onView(inv)}>
                    <td className="px-3 py-3 align-middle"><span className="text-sm text-gray-700">{vorname}</span></td>
                    <td className="px-3 py-3 align-middle"><span className="text-sm font-medium text-gray-700">{nachname}</span></td>
                    <td className="px-3 py-3 align-middle"><span className="text-sm text-gray-500">{templateName}</span></td>
                    <td className="px-3 py-3 align-middle"><span className="text-sm text-gray-500">{fmtDate(inv.invoiceMeta.datum)}</span></td>
                    <td className="px-3 py-3 align-middle">
                      {consentStatus === "refused"
                        ? <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded">Abgelehnt</span>
                        : consentStatus === "complete"
                        ? <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">Vollständig</span>
                        : consentStatus === "pending_doctor"
                        ? <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">Ärzt:in fehlt</span>
                        : <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded">Entwurf</span>
                      }
                    </td>
                    <td className="px-3 py-3 align-middle"><span className="text-xs text-gray-400">{createdAt}</span></td>
                    <td className="px-5 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition" title="PDF herunterladen" onClick={() => onDownloadConsent && onDownloadConsent(inv)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                        </button>
                        <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition" title="Löschen" onClick={() => onDelete(inv.id)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )
      )}
    </div>
  );
}

