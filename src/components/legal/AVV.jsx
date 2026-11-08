import React, { useState } from "react";
import { AVV_VERSION, AVV_DATE, AVV_PROVIDER, AVV_SECTIONS } from "./avvText";
import { fmtDate } from "../../utils/helpers";

// ═══════════════════ Auftragsverarbeitungsvertrag ═══════════════════

function practiceLine(practice) {
  const parts = [practice?.name, practice?.address1, practice?.address2, practice?.address3].map((s) => (s || "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// The contract body, shared by the page and the acceptance screen.
export function AVVBody({ practice, acceptance }) {
  const party = practiceLine(practice);
  return (
    <div className="text-gray-700 text-sm leading-relaxed space-y-5">
      <section>
        <h2 className="text-sm font-semibold text-gray-800 mt-2 mb-2">Parteien</h2>
        <p>Diese Vereinbarung regelt die datenschutzrechtlichen Pflichten zwischen den nachstehenden Parteien:</p>
        <p className="mt-2"><strong>Verantwortlicher</strong> (nachfolgend „Auftraggeber"): {party || <span className="text-amber-700">[Praxisdaten noch nicht hinterlegt, bitte unter Praxis-Einstellungen ergänzen]</span>}. Die Angaben entsprechen den Praxisdaten, die der Auftraggeber in der App unter „Praxis-Einstellungen" hinterlegt hat.</p>
        <p className="mt-2"><strong>Auftragsverarbeiter</strong> (nachfolgend „Auftragnehmer"): {AVV_PROVIDER.name}, {AVV_PROVIDER.address}, {AVV_PROVIDER.represented}, {AVV_PROVIDER.register}.</p>
        <p className="mt-2"><strong>Hauptvertrag:</strong> der Nutzungsvertrag über die Web-Anwendung „EPHIA Patient:innenmanagement" (invoicing.ephia.de) auf Grundlage der Allgemeinen Geschäftsbedingungen des Auftragnehmers in der bei Abschluss gültigen Fassung.</p>
        <p className="mt-2">Diese Vereinbarung wird gemäß Art. 28 Abs. 9 DSGVO in elektronischer Form geschlossen (Ziffer 11). Sie wird dem Auftraggeber in der App als lesbare und speicherbare Fassung bereitgestellt.</p>
      </section>

      {AVV_SECTIONS.map((s) => (
        <section key={s.heading}>
          <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">{s.heading}</h2>
          {s.body.map((b, i) => {
            if (typeof b === "string") return <p key={i} className="mb-2">{b}</p>;
            if (b.items) return <ul key={i} className="list-disc pl-5 mb-2 space-y-1">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
            if (b.table) return (
              <div key={i} className="overflow-x-auto mb-2">
                <table className="w-full text-xs border-collapse">
                  {b.table.head && <thead><tr>{b.table.head.map((h, j) => <th key={j} className="text-left align-top p-2 border-b border-[#DFE3EB] font-semibold text-gray-600">{h}</th>)}</tr></thead>}
                  <tbody>{b.table.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className={`align-top p-2 border-b border-gray-100 ${k === 0 && !b.table.head ? "font-semibold text-gray-600 whitespace-nowrap" : ""}`}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
            return null;
          })}
        </section>
      ))}

      {acceptance && (
        <section className="mt-6 p-3 rounded-lg bg-gray-50 text-xs text-gray-600">
          Abgeschlossen am {fmtDate(acceptance.accepted_at)} um {new Date(acceptance.accepted_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr · Version {acceptance.version} · Prüfsumme {String(acceptance.document_sha256).slice(0, 16)}…
        </section>
      )}
    </div>
  );
}

export default function AVVPage({ onBack, practice, acceptance }) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 print:bg-white print:py-0" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow border border-[#DFE3EB] p-8 print:shadow-none print:border-0">
        <div className="flex items-center justify-between mb-6 print:hidden">
          {onBack ? <button onClick={onBack} className="text-xs text-blue-600 hover:text-blue-700 font-medium">&larr; Zurück</button> : <span />}
          <button onClick={() => window.print()} className="text-xs px-3 py-1.5 rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50">Als PDF speichern</button>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">Vereinbarung über die Verarbeitung personenbezogener Daten im Auftrag</h1>
        <p className="text-xs text-gray-400 mb-6">Auftragsverarbeitung gemäß Art. 28 DSGVO · Version {AVV_VERSION} · Stand: {AVV_DATE}</p>
        <AVVBody practice={practice} acceptance={acceptance} />
      </div>
    </div>
  );
}

// Blocking screen shown after login until the current version is accepted.
export function AVVAcceptScreen({ practice, email, onAccept, onLogout, isLoading, error, onboarding }) {
  const [checked, setChecked] = useState(false);
  const party = practiceLine(practice);
  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-10 px-4" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow border border-[#DFE3EB] p-6 sm:p-8 mb-4">
          <div className="mb-3 flex justify-center"><img src="/logo-centered.svg" alt="EPHIA by Dr. Sophia" style={{ width: "128px" }} /></div>
          <h1 className="text-lg font-bold text-gray-800 text-center mb-2">Auftragsverarbeitungsvertrag</h1>
          {onboarding && <p className="text-xs text-gray-400 text-center mb-2">Praxisdaten gespeichert. Noch ein Schritt, dann geht es los.</p>}
          <p className="text-sm text-gray-600 text-center">{onboarding ? "Zum Start schließen" : "Bevor Du weiterarbeitest, schließen"} wir den Auftragsverarbeitungsvertrag nach Art. 28 DSGVO ab. Er regelt, wie EPHIA die Daten Deiner Patient:innen für Dich verarbeitet. Lies ihn in Ruhe; Du findest ihn später jederzeit unter Praxis-Einstellungen.</p>
        </div>

        <div className="bg-white rounded-lg shadow border border-[#DFE3EB] p-6 sm:p-8 mb-4 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-gray-400 mb-4">Version {AVV_VERSION} · Stand: {AVV_DATE}</p>
          <AVVBody practice={practice} />
        </div>

        <div className="bg-white rounded-lg shadow border border-[#DFE3EB] p-6 sm:p-8">
          {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={isLoading} />
            <span className="text-sm text-gray-700">
              Ich schließe den Auftragsverarbeitungsvertrag (Version {AVV_VERSION}) {party ? <>für <strong>{party}</strong></> : "für meine Praxis"} mit der EPHIA Medical GmbH ab. Konto: {email}.
            </span>
          </label>
          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <button className="text-xs text-gray-500 hover:text-gray-700" onClick={onLogout} disabled={isLoading}>Jetzt nicht, abmelden</button>
            <button
              className="bg-gray-800 text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onAccept}
              disabled={!checked || isLoading}
            >
              {isLoading ? "Wird gespeichert..." : "Vertrag abschließen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
