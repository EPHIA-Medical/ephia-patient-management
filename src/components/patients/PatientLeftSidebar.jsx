import React, { useState, useEffect, useRef } from "react";
import { fmtPhone, parsePlzOrt, combinePlzOrt, lookupPlz } from "../../utils/helpers";
import { PRIORITY_COUNTRIES, OTHER_COUNTRIES } from "../../constants";
import { showToast } from "../../utils/toast";
import Select from "../ui/Select";
import CopyButton from "../ui/CopyButton";

const inputCls = "border border-[#DFE3EB] rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
const valueBtnCls = "-mx-1.5 px-1.5 py-0.5 rounded text-sm text-gray-900 text-left hover:bg-gray-50 cursor-text transition";
const GESCHLECHT = { w: "Weiblich", m: "Männlich", d: "Divers" };

// Label above the value, both left-aligned. Click the value to edit it in place:
// Enter or leaving the field saves, Escape cancels.
// options: [[value, label], ...]; null renders a separator line.
function InlineField({ label, value, display, type = "text", options, allowEmpty = true, placeholder, onSave, copyable = false, sanitize, inputMode, maxLength }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const done = useRef(false); // blocks a second save from the blur that follows Enter/Escape
  const start = () => { done.current = false; setDraft(value || ""); setEditing(true); };
  const stop = () => { done.current = true; setEditing(false); };
  const commit = (v = draft) => { if (done.current) return; stop(); if ((v || "") !== (value || "")) onSave(v); };
  const keys = (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") stop(); };
  return (
    <div className="py-1.5">
      <div className="text-[13px] text-gray-500 mb-0.5">{label}</div>
      {editing ? (
        options ? (
          <Select autoFocus className={inputCls + " bg-white w-full"} value={draft} onChange={(e) => commit(e.target.value)} onBlur={stop} onKeyDown={keys}>
            {allowEmpty && <option value="">--</option>}
            {options.map((o, i) => (o ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={"sep" + i} disabled>{"────────────"}</option>))}
          </Select>
        ) : (
          <input
            autoFocus type={type} inputMode={inputMode} maxLength={maxLength}
            className={inputCls + " w-full"} value={draft} placeholder={placeholder}
            onChange={(e) => setDraft(sanitize ? sanitize(e.target.value) : e.target.value)}
            onBlur={() => commit()} onKeyDown={keys}
          />
        )
      ) : (
        <div className="flex items-start gap-1 min-w-0">
          <button type="button" className={valueBtnCls + " min-w-0 break-words"} title="Klicken zum Bearbeiten" onClick={start}>
            {value ? (display ?? value) : <span className="text-gray-300">--</span>}
          </button>
          {copyable && value && <CopyButton value={display ?? value} label={`${label} kopieren`} className="mt-0.5" />}
        </div>
      )}
    </div>
  );
}

// Several inputs edited together; saves when focus leaves the group.
function useGroupEdit(initial, onSave) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const done = useRef(false);
  const start = () => { done.current = false; setDraft(initial); setEditing(true); };
  const stop = () => { done.current = true; setEditing(false); };
  const commit = () => { if (done.current) return; stop(); if (JSON.stringify(draft) !== JSON.stringify(initial)) onSave(draft); };
  const groupProps = {
    onBlur: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) commit(); },
    onKeyDown: (e) => {
      if (e.defaultPrevented) return; // handled by a child, e.g. choosing in the Select list
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") stop();
    },
  };
  return { editing, draft, setDraft, start, groupProps };
}

export default function PatientLeftSidebar({
  patient, rawData, email, latestFacePhoto, profilePhotoInputRef, handleProfilePhotoUpload,
  anamnese, onUpdatePatient,
  // Phone layout: the card collapses to one row; stats and Historie live in that row
  createdAt, behCount, lastActivityDate, onOpenHistorie,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false); // only used below lg
  // The parent re-fetches after encrypting and saving, which takes a moment. Show saved values
  // right away and build every save on top of earlier unsynced edits so none get lost.
  const [overrides, setOverrides] = useState({});
  useEffect(() => {
    setOverrides((o) => {
      const rest = Object.fromEntries(Object.entries(o).filter(([k, v]) => (rawData[k] ?? "") !== v));
      return Object.keys(rest).length === Object.keys(o).length ? o : rest;
    });
  }, [rawData]);
  const data = { ...rawData, ...overrides };
  const save = (patch) => {
    setOverrides((o) => ({ ...o, ...patch }));
    if (onUpdatePatient) {
      Promise.resolve(onUpdatePatient({ ...rawData, ...overrides, ...patch })).catch((e) => {
        showToast("Änderung konnte nicht gespeichert werden: " + (e?.message || e), { error: true });
      });
    }
  };

  const vorname = data.vorname || patient.vorname || "";
  const nachname = data.nachname || patient.nachname || "";
  const shownEmail = "email" in overrides ? overrides.email : (email || data.email || "");
  const name = useGroupEdit({ vorname, nachname }, (d) => { if (d.vorname.trim() && d.nachname.trim()) save(d); });
  // Address is stored as address1 (Straße) and address2 ("PLZ Ort"), as on all documents;
  // here it is shown and edited as separate fields.
  const { plz, ort } = parsePlzOrt(data.address2 || "");
  const country = data.country || "Deutschland";
  const savePlz = async (v) => {
    let city = ort;
    if (!city && v.length === 5 && country === "Deutschland") city = (await lookupPlz(v)) || "";
    save({ address2: combinePlzOrt(v, city) });
  };
  const fullAddress = [data.address1, data.address2, country].filter(Boolean).join("\n");
  const countryOptions = [...PRIORITY_COUNTRIES.map((c) => [c, c]), null, ...OTHER_COUNTRIES.map((c) => [c, c])];

  return (
    <div className="lg:w-72 xl:w-80 lg:sticky lg:top-0 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
      {/* Patient photo + name. Below lg one compact row; the details fold out on demand. */}
      <div className={`px-4 py-3 lg:px-5 lg:py-5 border-gray-100 ${detailsOpen ? "border-b" : "border-b-0 lg:border-b"}`}>
        <div className="flex flex-row lg:flex-col items-center gap-3 lg:gap-0 lg:text-center">
          <button
            className="rounded-full overflow-hidden border-2 border-[#DFE3EB] hover:border-blue-300 transition flex-shrink-0 w-12 h-12 lg:w-[72px] lg:h-[72px] lg:mb-3"
            onClick={() => profilePhotoInputRef.current?.click()}
            title="Foto hochladen"
          >
            {latestFacePhoto ? (
              <img src={latestFacePhoto} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                <svg className="w-6 h-6 lg:w-8 lg:h-8 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}
          </button>
          <input ref={profilePhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoUpload} />
          <div className="flex-1 min-w-0 lg:w-full">
            {name.editing ? (
              <div className="flex gap-2 w-full" {...name.groupProps}>
                <input autoFocus className={inputCls + " w-full min-w-0"} value={name.draft.vorname} placeholder="Vorname" onChange={(e) => name.setDraft({ ...name.draft, vorname: e.target.value })} />
                <input className={inputCls + " w-full min-w-0"} value={name.draft.nachname} placeholder="Nachname" onChange={(e) => name.setDraft({ ...name.draft, nachname: e.target.value })} />
              </div>
            ) : (
              <button type="button" className="-ml-1.5 lg:ml-0 px-1.5 lg:px-2 py-0.5 rounded hover:bg-gray-50 cursor-text transition max-w-full text-left lg:text-center" title="Klicken zum Bearbeiten" onClick={name.start}>
                <h2 className="text-base lg:text-lg font-semibold text-gray-800 truncate">{vorname} {nachname}</h2>
              </button>
            )}
            {behCount != null && (
              <p className="lg:hidden text-xs text-gray-400 truncate">
                {behCount} {behCount === 1 ? "Behandlung" : "Behandlungen"}{lastActivityDate ? ` · zuletzt ${lastActivityDate}` : ""}
              </p>
            )}
          </div>
          {onOpenHistorie && (
            <button className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition flex-shrink-0" onClick={onOpenHistorie} title="Historie" aria-label="Historie">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
          )}
          <button
            className="lg:hidden p-2 -mr-2 rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition flex-shrink-0"
            onClick={() => setDetailsOpen(!detailsOpen)}
            aria-expanded={detailsOpen}
            aria-label={detailsOpen ? "Details ausblenden" : "Details anzeigen"}
            title={detailsOpen ? "Details ausblenden" : "Details anzeigen"}
          >
            <svg className={`w-5 h-5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>
      </div>

      <div className={detailsOpen ? "" : "hidden lg:block"}>
      {/* Adressdaten section */}
      <div className="border-b border-gray-100">
        <div className="px-5 pt-3.5 pb-1 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Adressdaten</h3>
          {(data.address1 || data.address2) && <CopyButton value={fullAddress} label="Ganze Adresse kopieren" />}
        </div>
        <div className="px-5 pb-3">
          <InlineField copyable label="E-Mail" type="email" value={shownEmail} placeholder="name@beispiel.de" onSave={(v) => save({ email: v })} />
          <InlineField copyable label="Telefon" type="tel" value={data.phone} display={fmtPhone(data.phone || "")} placeholder="+49 123 456789" onSave={(v) => save({ phone: v })} />
          <InlineField copyable label="Straße und Hausnummer" value={data.address1} placeholder="Musterstraße 5" onSave={(v) => save({ address1: v })} />
          <InlineField copyable label="PLZ" value={plz} placeholder="10115" inputMode="numeric" maxLength={5} sanitize={(v) => v.replace(/\D/g, "")} onSave={savePlz} />
          <InlineField copyable label="Ort" value={ort} placeholder="Berlin" onSave={(v) => save({ address2: combinePlzOrt(plz, v.trim()) })} />
          <InlineField label="Land" value={country} options={countryOptions} allowEmpty={false} onSave={(v) => save({ country: v || "Deutschland" })} />
        </div>
      </div>

      {/* Medizinische Daten section */}
      <div className="border-b border-gray-100">
        <h3 className="px-5 pt-3.5 pb-1 text-sm font-semibold text-gray-500 uppercase tracking-wider">Medizinische Daten</h3>
        <div className="px-5 pb-3">
          <div>
            <InlineField label="Geschlecht" value={data.geschlecht} display={GESCHLECHT[data.geschlecht] || data.geschlecht} options={Object.entries(GESCHLECHT)} onSave={(v) => save({ geschlecht: v })} />
            <InlineField label="Geburtsdatum" type="date" value={data.geburtsdatum} display={data.geburtsdatum ? new Date(data.geburtsdatum).toLocaleDateString("de-DE") : ""} onSave={(v) => save({ geburtsdatum: v })} />
            <InlineField label="Größe" type="number" value={data.groesse ? String(data.groesse) : ""} display={`${data.groesse} cm`} placeholder="cm" onSave={(v) => save({ groesse: v })} />
            <InlineField label="Gewicht" type="number" value={data.gewicht ? String(data.gewicht) : ""} display={`${data.gewicht} kg`} placeholder="kg" onSave={(v) => save({ gewicht: v })} />
          </div>
        </div>
      </div>

      {/* Anamnese section */}
      <div className="border-b border-gray-100">
        <h3 className="px-5 py-3.5 text-sm font-semibold text-gray-500 uppercase tracking-wider">Anamnese</h3>
        <div className="px-5 pb-4">
          {anamnese.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Noch keine Einträge. Einträge werden automatisch aus ausgefüllten Aufklärungsbögen übernommen.</p>
          ) : (
            <div className="space-y-0">
              {anamnese.map((entry, i) => (
                <div key={entry.questionId || i} className="py-3.5 border-b border-gray-100 last:border-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs text-gray-400">
                      {entry.addedAt ? new Date(entry.addedAt).toLocaleDateString("de-DE") : "--"}
                    </span>
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 mt-0.5" title="Positiver Befund" />
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{entry.questionLabel}</p>
                  {entry.detailText && (
                    <p className="text-sm text-amber-700 mt-1 leading-relaxed">{entry.detailText}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
        {createdAt && <p className="lg:hidden px-5 py-3 text-xs text-gray-400">Erstellt am {createdAt}</p>}
      </div>
    </div>
  );
}
