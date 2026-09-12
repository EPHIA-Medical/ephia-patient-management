import React, { useState } from "react";
import { fmtDate } from "../../utils/helpers";

// ═══════════════════ Patient List View ═══════════════════

export default function PatientListView({ patients, invoices, kleinunternehmer, onSelectPatient, onDeletePatient, onBack, onAddPatient }) {
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState("nachname");
  const [sortDir, setSortDir] = React.useState("asc");

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

  // Build patient list from patients table, enriched with invoice counts
  // Safely handle both decrypted (object) and still-encrypted (string) patient data
  const patientList = patients.map((p) => {
    const d = (typeof p.data === "object" && p.data !== null) ? p.data : {};
    const email = (d.email || "").toLowerCase();
    const dbId = p.id;
    const matchingInvoices = invoices.filter((inv) => {
      if (inv._standalone) return false;
      if (inv._patientDbId && dbId) return inv._patientDbId === dbId;
      const invEmail = ((inv.patient || {}).email || "").toLowerCase();
      return email && invEmail && invEmail === email;
    });
    const hvCount = matchingInvoices.filter((inv) => inv.hasHV != null ? inv.hasHV : (inv.lineItems || []).some((it) => it.steigerung != null && it.steigerung > 3.5)).length;
    const currentYear = new Date().getFullYear();
    const thisYearInvoices = matchingInvoices.filter((inv) => {
      const d2 = inv.invoiceMeta?.datum || inv.savedAt || "";
      return d2.startsWith(String(currentYear));
    });
    const invoiceGesamt = (inv) => {
      const netto = (inv.lineItems || []).reduce((s, it) => s + (it.betrag || 0), 0);
      const isAusland = (inv.patient || {}).country && (inv.patient || {}).country !== "Deutschland";
      const invIsMedical = !!(inv.invoiceMeta && inv.invoiceMeta.diagnose) || inv.indicationType === "medical";
      const invKlein = inv._kleinunternehmer != null ? inv._kleinunternehmer : kleinunternehmer;
      const noMwst = invKlein || isAusland || invIsMedical;
      const mwst = noMwst ? 0 : Math.round(netto * 0.19 * 100) / 100;
      return Math.round((netto + mwst) * 100) / 100;
    };
    const outstandingInvs = thisYearInvoices.filter((inv) => inv.paymentStatus !== "bezahlt" && !inv._hvOnly && !inv._standalone);
    const paidInvs = thisYearInvoices.filter((inv) => inv.paymentStatus === "bezahlt" && !inv._hvOnly && !inv._standalone);
    const offen = outstandingInvs.reduce((s, inv) => s + invoiceGesamt(inv), 0);
    const paidThisYear = paidInvs.reduce((s, inv) => s + invoiceGesamt(inv), 0);
    return {
      email,
      vorname: d.vorname || "",
      nachname: d.nachname || "",
      invoiceCount: matchingInvoices.filter((inv) => !inv._hvOnly && !inv._consentForm).length,
      hvCount,
      offen: Math.round(offen * 100) / 100,
      paidThisYear: Math.round(paidThisYear * 100) / 100,
      lastInvoiceDate: matchingInvoices.length > 0 ? matchingInvoices.sort((a, b) => (b.invoiceMeta.datum || "").localeCompare(a.invoiceMeta.datum || ""))[0].invoiceMeta.datum : null,
      _raw: p,
    };
  });

  const filtered = search.trim()
    ? patientList.filter((p) => {
        const s = search.toLowerCase();
        return p.vorname.toLowerCase().includes(s) || p.nachname.toLowerCase().includes(s) || p.email.toLowerCase().includes(s) || String(p.invoiceCount).includes(s) || (p.lastInvoiceDate ? fmtDate(p.lastInvoiceDate).toLowerCase().includes(s) : false);
      })
    : patientList;

  const getters = {
    vorname: (p) => p.vorname || null,
    nachname: (p) => p.nachname || null,
    email: (p) => p.email || null,
    invoiceCount: (p) => p.invoiceCount,
    offen: (p) => p.offen,
    paidThisYear: (p) => p.paidThisYear,
    lastDate: (p) => p.lastInvoiceDate || "",
  };

  const sorted = (() => {
    if (!sortKey || !getters[sortKey]) return filtered;
    const getter = getters[sortKey];
    return [...filtered].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "de", { sensitivity: "base" });
      if (cmp === 0 && sortKey !== "nachname") cmp = a.nachname.localeCompare(b.nachname, "de", { sensitivity: "base" });
      if (cmp === 0 && sortKey !== "vorname") cmp = a.vorname.localeCompare(b.vorname, "de", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  })();

  const thCls = "text-left px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 select-none whitespace-nowrap";

  if (patients.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#DFE3EB] p-8 text-center">
        <div className="text-gray-300 text-4xl mb-3">👤</div>
        <p className="text-sm text-gray-500 mb-1">Noch keine Patient:innen vorhanden.</p>
        <p className="text-xs text-gray-400 mb-3">Patient:innen werden automatisch beim Erstellen einer Rechnung angelegt.</p>
        <div className="flex items-center justify-center gap-3">
          <button className="px-4 py-2 text-sm rounded-lg border border-[#DFE3EB] text-gray-600 hover:bg-gray-50" onClick={onBack}>
            ← Neue Rechnung erstellen
          </button>
          {onAddPatient && <button className="px-4 py-2 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition" onClick={onAddPatient}>+ Patient:in hinzufügen</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#DFE3EB] overflow-hidden">
      <div className="px-3 sm:px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-800">Patient:innen</h2>
          {onAddPatient && <button className="text-xs text-blue-500 hover:text-blue-700 font-medium transition" onClick={onAddPatient}>+ Patient:in hinzufügen</button>}
        </div>
        <div className="relative">
          <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            className="pl-8 pr-3 py-1.5 text-xs border border-[#DFE3EB] rounded focus:outline-none focus:ring-1 focus:ring-blue-400 w-full sm:w-56"
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className={thCls} onClick={() => handleSort("vorname")}>Vorname{sortIndicator("vorname")}</th>
            <th className={thCls} onClick={() => handleSort("nachname")}>Nachname{sortIndicator("nachname")}</th>
            <th className={thCls} onClick={() => handleSort("email")}>E-Mail{sortIndicator("email")}</th>
            <th className={thCls + " hidden sm:table-cell"} onClick={() => handleSort("invoiceCount")}>Rechnungen{sortIndicator("invoiceCount")}</th>
            <th className={thCls + " hidden md:table-cell"} onClick={() => handleSort("offen")}>Offen{sortIndicator("offen")}</th>
            <th className={thCls + " hidden md:table-cell"} onClick={() => handleSort("paidThisYear")}>Bezahlt {new Date().getFullYear()}{sortIndicator("paidThisYear")}</th>
            <th className={thCls + " hidden lg:table-cell"} onClick={() => handleSort("lastDate")}>Letzte Rechnung{sortIndicator("lastDate")}</th>
            <th className="px-3 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p._raw.id || p.email} className="border-b border-gray-50 hover:bg-blue-50 transition cursor-pointer" onClick={() => onSelectPatient(p)}>
              <td className="px-3 py-3 align-middle"><span className="text-sm text-gray-700">{p.vorname}</span></td>
              <td className="px-3 py-3 align-middle"><span className="text-sm font-medium text-gray-700">{p.nachname}</span></td>
              <td className="px-3 py-3 align-middle"><span className="text-sm text-gray-500 break-all">{p.email}</span></td>
              <td className="px-3 py-3 align-middle hidden sm:table-cell"><span className="text-sm text-gray-500">{p.invoiceCount}</span></td>
              <td className="px-3 py-3 align-middle hidden md:table-cell"><span className={`text-sm ${p.offen > 0 ? "text-amber-600 font-medium" : "text-gray-400"}`}>{p.offen > 0 ? p.offen.toFixed(2).replace(".", ",") + " €" : "–"}</span></td>
              <td className="px-3 py-3 align-middle hidden md:table-cell"><span className={`text-sm ${p.paidThisYear > 0 ? "text-green-600" : "text-gray-400"}`}>{p.paidThisYear > 0 ? p.paidThisYear.toFixed(2).replace(".", ",") + " €" : "–"}</span></td>
              <td className="px-3 py-3 align-middle hidden lg:table-cell"><span className="text-sm text-gray-500">{p.lastInvoiceDate ? fmtDate(p.lastInvoiceDate) : "–"}</span></td>
              <td className="px-3 py-3 align-middle">
                <button className="p-1.5 rounded border border-[#DFE3EB] text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition" title="Löschen" onClick={(e) => { e.stopPropagation(); onDeletePatient(p._raw); }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

