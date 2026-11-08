import React, { useState, useEffect, useRef } from "react";
import { fmtPhone, parsePlzOrt, combinePlzOrt, lookupPlz } from "../../utils/helpers";
import { PRIORITY_COUNTRIES, OTHER_COUNTRIES } from "../../constants";

const inputCls = "border border-[#DFE3EB] rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
const valueBtnCls = "-mx-1.5 px-1.5 py-0.5 rounded text-sm text-gray-700 text-right hover:bg-gray-50 hover:text-gray-900 cursor-text transition";
const GESCHLECHT = { w: "Weiblich", m: "Männlich", d: "Divers" };

// Click a value to edit it in place. Enter or leaving the field saves, Escape cancels.
function InlineField({ label, value, display, type = "text", options, placeholder, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const done = useRef(false); // blocks a second save from the blur that follows Enter/Escape
  const start = () => { done.current = false; setDraft(value || ""); setEditing(true); };
  const stop = () => { done.current = true; setEditing(false); };
  const commit = (v = draft) => { if (done.current) return; stop(); if ((v || "") !== (value || "")) onSave(v); };
  const keys = (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") stop(); };
  return (
    <div className="flex justify-between items-center gap-3 min-h-[28px]">
      <span className="text-sm text-gray-400 flex-shrink-0">{label}</span>
      {editing ? (
        options ? (
          <select autoFocus className={inputCls + " bg-white min-w-0"} value={draft} onChange={(e) => commit(e.target.value)} onBlur={stop} onKeyDown={keys}>
            <option value="">--</option>
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : (
          <input autoFocus type={type} className={inputCls + " min-w-0 w-40 text-right"} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit()} onKeyDown={keys} />
        )
      ) : (
        <button type="button" className={valueBtnCls + " min-w-0 break-words"} title="Klicken zum Bearbeiten" onClick={start}>
          {value ? (display ?? value) : <span className="text-gray-300">--</span>}
        </button>
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
    onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") stop(); },
  };
  return { editing, draft, setDraft, start, groupProps };
}

export default function PatientLeftSidebar({
  patient, rawData, email, latestFacePhoto, profilePhotoInputRef, handleProfilePhotoUpload,
  adressdatenOpen, setAdressdatenOpen, medizinischeOpen, setMedizinischeOpen, anamneseOpen, setAnamneseOpen,
  anamnese, onUpdatePatient,
}) {
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
    if (onUpdatePatient) onUpdatePatient({ ...rawData, ...overrides, ...patch });
  };

  const vorname = data.vorname || patient.vorname || "";
  const nachname = data.nachname || patient.nachname || "";
  const shownEmail = "email" in overrides ? overrides.email : (email || data.email || "");
  const name = useGroupEdit({ vorname, nachname }, (d) => { if (d.vorname.trim() && d.nachname.trim()) save(d); });
  const adresse = useGroupEdit({ address1: data.address1 || "", address2: data.address2 || "" }, save);
  const { plz, ort } = parsePlzOrt(adresse.draft.address2);

  return (
    <div className="lg:w-72 xl:w-80 lg:sticky lg:top-0 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
      {/* Patient photo + name */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex flex-col items-center text-center">
          <button
            className="rounded-full overflow-hidden border-2 border-[#DFE3EB] hover:border-blue-300 transition mb-3"
            style={{ width: 72, height: 72 }}
            onClick={() => profilePhotoInputRef.current?.click()}
            title="Foto hochladen"
          >
            {latestFacePhoto ? (
              <img src={latestFacePhoto} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}
          </button>
          <input ref={profilePhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoUpload} />
          {name.editing ? (
            <div className="flex gap-2 w-full" {...name.groupProps}>
              <input autoFocus className={inputCls + " w-full min-w-0"} value={name.draft.vorname} placeholder="Vorname" onChange={(e) => name.setDraft({ ...name.draft, vorname: e.target.value })} />
              <input className={inputCls + " w-full min-w-0"} value={name.draft.nachname} placeholder="Nachname" onChange={(e) => name.setDraft({ ...name.draft, nachname: e.target.value })} />
            </div>
          ) : (
            <button type="button" className="px-2 py-0.5 rounded hover:bg-gray-50 cursor-text transition" title="Klicken zum Bearbeiten" onClick={name.start}>
              <h2 className="text-lg font-semibold text-gray-800">{vorname} {nachname}</h2>
            </button>
          )}
        </div>
      </div>

      {/* Adressdaten section */}
      <div className="border-b border-gray-100">
        <button className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition" onClick={() => setAdressdatenOpen(!adressdatenOpen)}>
          <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Adressdaten</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${adressdatenOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {adressdatenOpen && (
          <div className="px-5 pb-4">
            <div className="space-y-1.5">
              <InlineField label="E-Mail" type="email" value={shownEmail} placeholder="name@beispiel.de" onSave={(v) => save({ email: v })} />
              <InlineField label="Telefon" type="tel" value={data.phone} display={fmtPhone(data.phone || "")} placeholder="+49 123 456789" onSave={(v) => save({ phone: v })} />
              <div className="flex justify-between items-start gap-3 min-h-[28px]">
                <span className="text-sm text-gray-400 flex-shrink-0 pt-0.5">Adresse</span>
                {adresse.editing ? (
                  <div className="space-y-1.5 w-44" {...adresse.groupProps}>
                    <input autoFocus className={inputCls + " w-full"} value={adresse.draft.address1} placeholder="Musterstraße 5" onChange={(e) => adresse.setDraft({ ...adresse.draft, address1: e.target.value })} />
                    <div className="flex gap-1.5">
                      <input
                        className={inputCls + " w-16"} value={plz} placeholder="PLZ" maxLength={5} inputMode="numeric"
                        onChange={(e) => {
                          const v = e.target.value;
                          adresse.setDraft((d) => ({ ...d, address2: combinePlzOrt(v, parsePlzOrt(d.address2).ort) }));
                          if (v.length === 5 && !ort && (!data.country || data.country === "Deutschland")) {
                            lookupPlz(v).then((city) => { if (city) adresse.setDraft((d) => ({ ...d, address2: combinePlzOrt(v, parsePlzOrt(d.address2).ort || city) })); });
                          }
                        }}
                      />
                      <input className={inputCls + " flex-1 min-w-0"} value={ort} placeholder="Ort" onChange={(e) => adresse.setDraft((d) => ({ ...d, address2: combinePlzOrt(parsePlzOrt(d.address2).plz, e.target.value) }))} />
                    </div>
                  </div>
                ) : (
                  <button type="button" className={valueBtnCls} title="Klicken zum Bearbeiten" onClick={adresse.start}>
                    {data.address1 || data.address2 ? [data.address1, data.address2].filter(Boolean).join(", ") : <span className="text-gray-300">--</span>}
                  </button>
                )}
              </div>
              <InlineField label="Land" value={data.country || "Deutschland"} options={[...PRIORITY_COUNTRIES, ...OTHER_COUNTRIES].map((c) => [c, c])} onSave={(v) => save({ country: v || "Deutschland" })} />
            </div>
          </div>
        )}
      </div>

      {/* Medizinische Daten section */}
      <div className="border-b border-gray-100">
        <button className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition" onClick={() => setMedizinischeOpen(!medizinischeOpen)}>
          <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Medizinische Daten</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${medizinischeOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {medizinischeOpen && (
          <div className="px-5 pb-4">
            <div className="space-y-1.5">
              <InlineField label="Geschlecht" value={data.geschlecht} display={GESCHLECHT[data.geschlecht] || data.geschlecht} options={Object.entries(GESCHLECHT)} onSave={(v) => save({ geschlecht: v })} />
              <InlineField label="Geburtsdatum" type="date" value={data.geburtsdatum} display={data.geburtsdatum ? new Date(data.geburtsdatum).toLocaleDateString("de-DE") : ""} onSave={(v) => save({ geburtsdatum: v })} />
              <InlineField label="Größe" type="number" value={data.groesse ? String(data.groesse) : ""} display={`${data.groesse} cm`} placeholder="cm" onSave={(v) => save({ groesse: v })} />
              <InlineField label="Gewicht" type="number" value={data.gewicht ? String(data.gewicht) : ""} display={`${data.gewicht} kg`} placeholder="kg" onSave={(v) => save({ gewicht: v })} />
            </div>
          </div>
        )}
      </div>

      {/* Anamnese section */}
      <div className="border-b border-gray-100">
        <button className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition" onClick={() => setAnamneseOpen(!anamneseOpen)}>
          <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Anamnese</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${anamneseOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {anamneseOpen && (
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
        )}
      </div>
    </div>
  );
}
