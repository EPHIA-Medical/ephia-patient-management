import React from "react";
import { AGB_VERSION, AGB_DATE, AGB_SECTIONS } from "./agbText";
import { fmtDate } from "../../utils/helpers";

// ═══════════════════ AGB / Terms & Conditions ═══════════════════

// The terms body, shared by the page and the acceptance screen.
export function AGBBody({ acceptance }) {
  return (
    <div className="text-gray-700 text-sm leading-relaxed space-y-5">
      {AGB_SECTIONS.map((s) => (
        <section key={s.heading}>
          <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">{s.heading}</h2>
          {s.body.map((p, i) => <p key={i} className="mb-2">{p}</p>)}
        </section>
      ))}
      {acceptance && (
        <section className="mt-6 p-3 rounded-lg bg-gray-50 text-xs text-gray-600">
          Bestätigt am {fmtDate(acceptance.accepted_at)} um {new Date(acceptance.accepted_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr · Version {acceptance.version} · Prüfsumme {String(acceptance.document_sha256).slice(0, 16)}…
        </section>
      )}
    </div>
  );
}

export default function AGBPage({ onBack, acceptance }) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 print:bg-white print:py-0" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow border border-[#DFE3EB] p-8 print:shadow-none print:border-0">
        <div className="flex items-center justify-between mb-6 print:hidden">
          {onBack ? <button onClick={onBack} className="text-xs text-blue-600 hover:text-blue-700 font-medium">&larr; Zurück</button> : <span />}
          <button onClick={() => window.print()} className="text-xs px-3 py-1.5 rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50">Als PDF speichern</button>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">Allgemeine Geschäftsbedingungen (AGB)</h1>
        <p className="text-xs text-gray-400 mb-6">EPHIA Medical GmbH · Version {AGB_VERSION} · Stand: {AGB_DATE}</p>
        <AGBBody acceptance={acceptance} />
      </div>
    </div>
  );
}
