import React, { useState, useRef, useEffect } from "react";
import { CONSENT_TEMPLATES } from "./consentTemplates";
import { fmtDate, fmtPhone } from "../../utils/helpers";
import SignaturePad from "./SignaturePad";
import PinGate from "./PinGate";
// ═══════════════════ Consent Form Components ═══════════════════

export function ConsentFormView({ template, patient, practice, onComplete, onCancel, kioskPin }) {
  const scrollRef = React.useRef(null);
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const [hasScrolledToEnd, setHasScrolledToEnd] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [showSignature, setShowSignature] = React.useState(false);
  const [sigStep, setSigStep] = React.useState(1); // 1=patient, 2=doctor
  const patientSigRef = React.useRef(null);
  const [refused, setRefused] = React.useState(false);
  const [showHandback, setShowHandback] = React.useState(false);
  const [showPinGate, setShowPinGate] = React.useState(false);

  // Demographics (pre-populate from patient profile if available)
  const _patientRaw = (patient._raw && typeof patient._raw.data === "object" && patient._raw.data) ? patient._raw.data : {};
  const [geburtsdatum, setGeburtsdatum] = React.useState(_patientRaw.geburtsdatum || "");
  const [groesse, setGroesse] = React.useState(_patientRaw.groesse || "");
  const [gewicht, setGewicht] = React.useState(_patientRaw.gewicht || "");
  const [geschlecht, setGeschlecht] = React.useState(_patientRaw.geschlecht || "");

  // Questionnaire answers (yes/no + text)
  const allQ = [...template.questions, ...(template.additionalQuestionsWomen || [])];
  const initAnswers = {};
  allQ.forEach(q => { initAnswers[q.id] = null; initAnswers[q.id + "_text"] = ""; });
  // For q13 sub-question
  initAnswers["q13_komplikationen"] = null; initAnswers["q13_komplikationen_text"] = "";
  const [answers, setAnswers] = React.useState(initAnswers);
  const [doctorNotes, setDoctorNotes] = React.useState("");
  const [treatmentDate, setTreatmentDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [ort, setOrt] = React.useState(practice.city || practice.stadt || practice.ort || "");
  const [validationErrors, setValidationErrors] = React.useState(new Set());

  const setAnswer = (id, val) => {
    setAnswers(prev => ({ ...prev, [id]: val }));
    setValidationErrors(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handleValidateAndSign = () => {
    const errors = new Set();
    // Check demographics
    if (!geburtsdatum.trim()) errors.add("geburtsdatum");
    if (!geschlecht) errors.add("geschlecht");
    if (!groesse.trim()) errors.add("groesse");
    if (!gewicht.trim()) errors.add("gewicht");
    // Check all visible questions
    template.questions.forEach(q => {
      if (answers[q.id] === null) errors.add(q.id);
      if (answers[q.id] === true && q.followUp && !answers[q.id + "_text"]?.trim()) errors.add(q.id + "_text");
      if (q.subQuestion && answers[q.id] === true && answers["q13_komplikationen"] === null) errors.add("q13_komplikationen");
      if (q.subQuestion && answers[q.id] === true && answers["q13_komplikationen"] === true && !answers["q13_komplikationen_text"]?.trim()) errors.add("q13_komplikationen_text");
    });
    // Check women's additional questions if visible
    if (geschlecht === "w" && template.additionalQuestionsWomen) {
      template.additionalQuestionsWomen.forEach(q => {
        if (answers[q.id] === null) errors.add(q.id);
      });
    }
    if (errors.size > 0) {
      setValidationErrors(errors);
      // Scroll to first error
      const firstErr = [...errors][0];
      const el = scrollRef.current?.querySelector(`[data-field="${firstErr}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("animate-pulse");
        setTimeout(() => el.classList.remove("animate-pulse"), 2000);
      }
      return;
    }
    setValidationErrors(new Set());
    setShowSignature(true);
    setSigStep(1);
  };

  const handleScroll = (e) => {
    const el = e.target;
    const pct = (el.scrollTop + el.clientHeight) / el.scrollHeight;
    setScrollProgress(Math.min(pct, 1));
    if (pct >= 0.95) setHasScrolledToEnd(true);
  };

  const handlePatientSign = (dataUrl) => {
    // Save immediately after patient signature; doctor signs later from preview
    const sigs = { patient: dataUrl, doctor: null };
    onComplete({
      templateId: template.id,
      templateVersion: template.version,
      answers: { geburtsdatum, groesse, gewicht, geschlecht, ...answers },
      doctorNotes,
      treatmentDate,
      ort,
      refused,
      _signatures: sigs,
      signedAt: new Date().toISOString(),
    });
  };

  // Keep handleDoctorSign for refusal flow (patient + immediate save)
  const handleDoctorSign = (dataUrl) => {
    const sigs = { patient: patientSigRef.current, doctor: dataUrl };
    onComplete({
      templateId: template.id,
      templateVersion: template.version,
      answers: { geburtsdatum, groesse, gewicht, geschlecht, ...answers },
      doctorNotes,
      treatmentDate,
      ort,
      refused,
      _signatures: sigs,
      signedAt: new Date().toISOString(),
    });
  };

  const handleRefuse = () => {
    setRefused(true);
    setShowSignature(true);
    setSigStep(1);
  };

  if (showSignature) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm md:max-w-md">
          <h3 className="text-sm md:text-base font-semibold text-gray-800 mb-1 text-center">
            {refused ? "Unterschrift Patient:in (Ablehnung)" : "Unterschrift Patient:in"}
          </h3>
          <p className="text-xs text-gray-400 text-center mb-1">{patient.vorname} {patient.nachname}</p>
          {!refused && <p className="text-[10px] text-gray-400 text-center mb-3">Die Unterschrift der Ärztin/des Arztes kann später hinzugefügt werden.</p>}
          <SignaturePad key="consent-patient" label="Unterschrift Patient:in" onSave={refused ? (d) => { patientSigRef.current = d; handleDoctorSign(null); } : handlePatientSign} />
          <div className="mt-3 flex items-center justify-between">
            <button className="text-xs md:text-sm text-gray-400 hover:text-gray-600 py-1 flex items-center gap-1" onClick={() => {
              if (sigStep === 2) { setSigStep(1); patientSigRef.current = null; }
              else { setShowSignature(false); setRefused(false); }
            }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Zurück
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inputCls = "w-full px-3 py-2 md:px-4 md:py-2.5 text-sm md:text-base border border-[#DFE3EB] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div className="fixed inset-0 z-40 bg-white md:bg-gray-50 flex flex-col overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 md:h-1.5 bg-gray-100 flex-shrink-0">
        <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${scrollProgress * 100}%` }} />
      </div>

      {/* Header */}
      <div className="flex-shrink-0 px-4 md:px-8 py-3 md:py-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between">
          <div>
            <h2 className="text-sm md:text-lg font-semibold text-gray-800">{template.name}</h2>
            <p className="text-xs md:text-sm text-gray-500">{patient.vorname} {patient.nachname} · {fmtDate(new Date().toISOString().split("T")[0])}</p>
          </div>
          <button className="p-1.5 md:p-2 text-gray-400 hover:text-gray-600 ml-4" onClick={() => setShowHandback(true)}>
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden" onScroll={handleScroll}>
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">
        {/* Info text */}
        <p className="text-xs md:text-sm text-gray-500 italic">Dieser Aufklärungsbogen dient der Vorbereitung des Aufklärungsgesprächs. Bitte lesen Sie ihn vor dem Gespräch aufmerksam durch und füllen Sie den Fragebogen gewissenhaft aus.</p>

        {template.sections.map((section, i) => (
          <div key={i}>
            <h3 className="text-sm md:text-base font-bold text-teal-700 mb-2 md:mb-3">{section.title}</h3>
            <div className="text-sm md:text-base text-gray-700 leading-relaxed prose prose-sm md:prose-base max-w-none" dangerouslySetInnerHTML={{ __html: section.html }} />
          </div>
        ))}

        {/* Questionnaire */}
        <div className="border-t border-[#DFE3EB] pt-4 md:pt-6">
          <h3 className="text-sm md:text-base font-bold text-teal-700 mb-3">Fragebogen (Anamnese)</h3>
          <p className="text-xs md:text-sm text-gray-500 mb-4">Bitte beantworten Sie die folgenden Fragen sorgfältig, damit wir etwaigen Risiken besser vorbeugen können.</p>

          {/* Demographics */}
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
            <div data-field="geburtsdatum" className="col-span-3 md:col-span-1"><label className={`text-xs md:text-sm mb-1 block ${validationErrors.has("geburtsdatum") ? "text-red-500 font-medium" : "text-gray-500"}`}>Geburtsdatum</label><input type="date" className={inputCls + (validationErrors.has("geburtsdatum") ? " border-red-400 ring-1 ring-red-400" : "")} value={geburtsdatum} onChange={e => { setGeburtsdatum(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete("geburtsdatum"); return n; }); }} /></div>
            <div data-field="geschlecht"><label className={`text-xs md:text-sm mb-1 block ${validationErrors.has("geschlecht") ? "text-red-500 font-medium" : "text-gray-500"}`}>Geschlecht</label>
              <select className={inputCls + (validationErrors.has("geschlecht") ? " border-red-400 ring-1 ring-red-400" : "")} value={geschlecht} onChange={e => { setGeschlecht(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete("geschlecht"); return n; }); }}>
                <option value="">–</option><option value="w">Weiblich</option><option value="m">Männlich</option><option value="d">Divers</option>
              </select>
            </div>
            <div data-field="groesse"><label className={`text-xs md:text-sm mb-1 block ${validationErrors.has("groesse") ? "text-red-500 font-medium" : "text-gray-500"}`}>Größe (cm)</label><input className={inputCls + (validationErrors.has("groesse") ? " border-red-400 ring-1 ring-red-400" : "")} value={groesse} onChange={e => { setGroesse(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete("groesse"); return n; }); }} placeholder="cm" /></div>
            <div data-field="gewicht"><label className={`text-xs md:text-sm mb-1 block ${validationErrors.has("gewicht") ? "text-red-500 font-medium" : "text-gray-500"}`}>Gewicht (kg)</label><input className={inputCls + (validationErrors.has("gewicht") ? " border-red-400 ring-1 ring-red-400" : "")} value={gewicht} onChange={e => { setGewicht(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete("gewicht"); return n; }); }} placeholder="kg" /></div>
          </div>

          {/* Yes/No questions */}
          {template.questions.map((q, qi) => (
            <div key={q.id} data-field={q.id} className={`mb-4 p-3 md:p-4 rounded-lg transition-colors ${validationErrors.has(q.id) ? "bg-red-50 md:bg-red-50 md:border md:border-red-300 ring-1 ring-red-300" : "bg-gray-50 md:bg-white md:border md:border-[#DFE3EB]"}`}>
              <div className="flex items-start gap-2 md:gap-3">
                <span className={`text-xs md:text-sm font-bold mt-0.5 flex-shrink-0 w-5 md:w-6 text-right ${validationErrors.has(q.id) ? "text-red-500" : "text-gray-400"}`}>{qi + 1}.</span>
                <div className="flex-1">
                  <div className="md:flex md:items-start md:justify-between md:gap-4">
                    <div className="flex-1">
                      <p className="text-sm md:text-base text-gray-800 font-medium">{q.label}</p>
                      {q.details && <p className="text-xs md:text-sm text-gray-500 mt-0.5">{q.details}</p>}
                    </div>
                    <div className="flex gap-3 mt-2 md:mt-0 md:flex-shrink-0">
                      <button className={`px-4 md:px-5 py-1.5 md:py-2 text-xs md:text-sm rounded-full border transition ${answers[q.id] === false ? "bg-gray-200 text-gray-700 border-gray-300" : "bg-white text-gray-400 border-[#DFE3EB]"}`} onClick={() => setAnswer(q.id, false)}>Nein</button>
                      <button className={`px-4 md:px-5 py-1.5 md:py-2 text-xs md:text-sm rounded-full border transition ${answers[q.id] === true ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-400 border-[#DFE3EB]"}`} onClick={() => setAnswer(q.id, true)}>Ja</button>
                    </div>
                  </div>
                  {answers[q.id] && q.followUp && (
                    <div className="mt-2 md:mt-3" data-field={q.id + "_text"}>
                      <label className={`text-xs md:text-sm ${validationErrors.has(q.id + "_text") ? "text-red-500 font-medium" : "text-gray-500"}`}>{q.followUp}</label>
                      <input className={inputCls + " mt-1" + (validationErrors.has(q.id + "_text") ? " border-red-400 ring-1 ring-red-400" : "")} value={answers[q.id + "_text"]} onChange={e => setAnswer(q.id + "_text", e.target.value)} />
                    </div>
                  )}
                  {q.subQuestion && answers[q.id] && (
                    <div className={`mt-2 md:mt-3 p-2 md:p-3 rounded border ${validationErrors.has("q13_komplikationen") ? "bg-red-50 border-red-300" : "bg-white md:bg-gray-50 border-[#DFE3EB]"}`} data-field="q13_komplikationen">
                      <p className="text-xs md:text-sm text-gray-700">Gab es dabei Komplikationen?</p>
                      <div className="flex gap-3 mt-1 md:mt-2">
                        <button className={`px-3 md:px-5 py-1 md:py-2 text-xs md:text-sm rounded-full border transition ${answers["q13_komplikationen"] === false ? "bg-gray-200 text-gray-700 border-gray-300" : "bg-white text-gray-400 border-[#DFE3EB]"}`} onClick={() => setAnswer("q13_komplikationen", false)}>Nein</button>
                        <button className={`px-3 md:px-5 py-1 md:py-2 text-xs md:text-sm rounded-full border transition ${answers["q13_komplikationen"] === true ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-400 border-[#DFE3EB]"}`} onClick={() => setAnswer("q13_komplikationen", true)}>Ja</button>
                      </div>
                      {answers["q13_komplikationen"] && (
                        <div data-field="q13_komplikationen_text">
                          <input className={inputCls + " mt-1 md:mt-2" + (validationErrors.has("q13_komplikationen_text") ? " border-red-400 ring-1 ring-red-400" : "")} value={answers["q13_komplikationen_text"]} onChange={e => setAnswer("q13_komplikationen_text", e.target.value)} placeholder="Welche Komplikationen?" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Additional questions for women */}
          {template.additionalQuestionsWomen && (
            <>
              <h4 className="text-xs md:text-sm font-bold text-gray-600 mt-4 mb-2">Zusatzfragen bei Frauen</h4>
              {template.additionalQuestionsWomen.map((q, qi) => (
                <div key={q.id} data-field={q.id} className={`mb-4 p-3 md:p-4 rounded-lg transition-colors ${validationErrors.has(q.id) ? "bg-red-50 md:bg-red-50 md:border md:border-red-300 ring-1 ring-red-300" : "bg-gray-50 md:bg-white md:border md:border-[#DFE3EB]"}`}>
                  <div className="flex items-start gap-2 md:gap-3">
                    <span className={`text-xs md:text-sm font-bold mt-0.5 flex-shrink-0 w-5 md:w-6 text-right ${validationErrors.has(q.id) ? "text-red-500" : "text-gray-400"}`}>{template.questions.length + qi + 1}.</span>
                    <div className="flex-1">
                      <div className="md:flex md:items-start md:justify-between md:gap-4">
                        <div className="flex-1">
                          <p className="text-sm md:text-base text-gray-800 font-medium">{q.label}</p>
                        </div>
                        <div className="flex gap-3 mt-2 md:mt-0 md:flex-shrink-0">
                          <button className={`px-4 md:px-5 py-1.5 md:py-2 text-xs md:text-sm rounded-full border transition ${answers[q.id] === false ? "bg-gray-200 text-gray-700 border-gray-300" : "bg-white text-gray-400 border-[#DFE3EB]"}`} onClick={() => setAnswer(q.id, false)}>Nein</button>
                          <button className={`px-4 md:px-5 py-1.5 md:py-2 text-xs md:text-sm rounded-full border transition ${answers[q.id] === true ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-400 border-[#DFE3EB]"}`} onClick={() => setAnswer(q.id, true)}>Ja</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Doctor notes */}
        <div className="border-t border-[#DFE3EB] pt-4 md:pt-6">
          <h3 className="text-sm md:text-base font-bold text-teal-700 mb-2 md:mb-3">Vermerke der Ärztin/des Arztes zum Aufklärungsgespräch</h3>
          <textarea className={inputCls + " h-24 md:h-32"} value={doctorNotes} onChange={e => setDoctorNotes(e.target.value)} placeholder="Erörtert wurden z.B.: Ziel der Behandlung, Wahl des Verfahrens, Risiken und mögliche Komplikationen, Erfolgsaussichten..." />
        </div>

        {/* Treatment date */}
        <div>
          <h3 className="text-sm md:text-base font-bold text-teal-700 mb-2 md:mb-3">Vorgesehene Behandlung</h3>
          <p className="text-sm md:text-base text-gray-700 mb-2">{template.plannedTreatment}</p>
          <div className="flex flex-col md:flex-row gap-3 md:gap-6">
            <div>
              <label className="text-xs md:text-sm text-gray-500">Vorgesehener Behandlungsbeginn</label>
              <input type="date" className={inputCls + " mt-1 block"} value={treatmentDate} onChange={e => setTreatmentDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs md:text-sm text-gray-500">Ort</label>
              <input type="text" className={inputCls + " mt-1 block"} value={ort} onChange={e => setOrt(e.target.value)} placeholder="z.B. Basel" />
            </div>
          </div>
        </div>

        {/* Consent text */}
        <div className="border-t border-[#DFE3EB] pt-4 md:pt-6">
          <h3 className="text-sm md:text-base font-bold text-teal-700 mb-2 md:mb-3">Einwilligung</h3>
          <div className="text-sm md:text-base text-gray-700 leading-relaxed whitespace-pre-line">{template.consentText}</div>
        </div>

        {/* Spacer so user can scroll to show the bottom bar */}
        <div className="h-6 md:h-8" />
        </div>
      </div>

      {/* Bottom sticky bar */}
      <div className="flex-shrink-0 border-t border-[#DFE3EB] bg-white px-4 md:px-8 py-3 md:py-4">
        <div className="max-w-3xl mx-auto space-y-3">
        <label className={`flex items-start gap-2 md:gap-3 ${hasScrolledToEnd ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 md:mt-1 rounded md:w-5 md:h-5" disabled={!hasScrolledToEnd} />
          <span className="text-xs md:text-sm text-gray-700">Ich habe den Aufklärungsbogen vollständig gelesen und verstanden.</span>
        </label>
        <div className="flex gap-2 md:gap-3">
          <button
            className={`flex-1 py-2.5 md:py-3 text-sm md:text-base font-medium rounded-lg transition ${confirmed ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
            disabled={!confirmed}
            onClick={handleValidateAndSign}
          >
            Unterschreiben
          </button>
          <button className="px-4 md:px-6 py-2.5 md:py-3 text-xs md:text-sm text-gray-400 hover:text-gray-600 border border-[#DFE3EB] rounded-lg transition" onClick={() => setShowHandback(true)}>
            Ablehnen
          </button>
        </div>
        </div>
      </div>

      {/* Handback modal */}
      {showHandback && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 md:p-8 text-center">
            <div className="text-4xl mb-4">
              <svg className="w-12 h-12 md:w-16 md:h-16 mx-auto text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-base md:text-lg font-semibold text-gray-800 mb-2">Bitte geben Sie das Gerät an Ihre:n Ärzt:in zurück</h3>
            <p className="text-xs md:text-sm text-gray-500 mb-6">Der Aufklärungsbogen wurde nicht abgeschlossen. Ihre:e Ärzt:in wird den Vorgang fortsetzen.</p>
            <button
              className="w-full py-3 text-sm md:text-base font-medium rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition"
              onClick={() => { if (kioskPin) { setShowPinGate(true); } else { onCancel(); } }}
            >
              Weiter als Ärzt:in
            </button>
            <button className="mt-2 w-full py-2 text-xs md:text-sm text-gray-400 hover:text-gray-600 transition" onClick={() => setShowHandback(false)}>
              Zurück zum Aufklärungsbogen
            </button>
          </div>
        </div>
      )}

      {/* PIN gate: exiting the kiosk view requires the practice PIN */}
      {showPinGate && (
        <PinGate
          pin={kioskPin}
          subtitle="Zum Verlassen des Aufklärungsbogens bitte die Praxis-PIN eingeben."
          onSuccess={() => { setShowPinGate(false); onCancel(); }}
          onCancel={() => setShowPinGate(false)}
        />
      )}
    </div>
  );
}

// Consent Form Preview for PDF generation
export default function ConsentFormPreview({ template, consentData, patient, practice, onDoctorSign }) {
  const a = consentData.answers || {};
  const datumStr = fmtDate(consentData.treatmentDate || new Date().toISOString().split("T")[0]);
  const ortStr = consentData.ort || practice.city || practice.stadt || practice.ort || "";

  const measRefA = React.useRef(null);
  const measRefB = React.useRef(null);
  const measRefC = React.useRef(null);
  const [pagesA, setPagesA] = React.useState(1);
  const [pagesB, setPagesB] = React.useState(1);
  const [pagesC, setPagesC] = React.useState(1);

  const baseFont = { fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: "11px", lineHeight: "1.55", color: "#1a1a1a", textAlign: "justify" };

  React.useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.id = "consent-justify-styles";
    styleEl.textContent = `.consent-section-html, .consent-section-html p, .consent-section-html li, .consent-section-html div, .consent-section-html ul, .consent-section-html ol { text-align: justify !important; hyphens: auto !important; -webkit-hyphens: auto !important; -ms-hyphens: auto !important; }`;
    document.head.appendChild(styleEl);
    return () => { const el = document.getElementById("consent-justify-styles"); if (el) el.remove(); };
  }, []);
  const pageStyle = { ...baseFont, width: "210mm", height: "297mm", background: "white", position: "relative", boxSizing: "border-box", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", borderRadius: "2px" };
  const h2Style = { fontSize: "12px", fontWeight: "700", color: "#222", margin: "14px 0 6px" };
  const h3Style = { fontSize: "11px", fontWeight: "600", color: "#444", margin: "10px 0 4px" };
  const bodyText = { fontSize: "9.5px", lineHeight: "1.55", color: "#333", textAlign: "justify", hyphens: "auto" };
  const hiddenMeas = { position: "absolute", left: "-9999px", top: 0, visibility: "hidden", ...baseFont, width: "calc(210mm - 88px)" };

  const CONTENT_H = 893;

  // Split template.sections at "Erfolgsaussichten"
  const erfIdx = template.sections.findIndex(s => s.title === "Erfolgsaussichten");
  const sectionsGroupA = erfIdx >= 0 ? template.sections.slice(0, erfIdx) : template.sections;
  const sectionsGroupB = erfIdx >= 0 ? template.sections.slice(erfIdx) : [];

  // Measure each content group independently
  React.useLayoutEffect(() => {
    if (measRefA.current) setPagesA(Math.max(1, Math.ceil(measRefA.current.scrollHeight / CONTENT_H)));
    if (measRefB.current) setPagesB(Math.max(1, Math.ceil(measRefB.current.scrollHeight / CONTENT_H)));
    if (measRefC.current) setPagesC(Math.max(1, Math.ceil(measRefC.current.scrollHeight / CONTENT_H)));
  }, [template, consentData]);

  const totalPages = pagesA + pagesB + pagesC;

  // Build question rows (isJa = true for "Ja" answers to highlight risks)
  const questionRows = [];
  template.questions.forEach((q, qi) => {
    const isJa = a[q.id] === true;
    questionRows.push({ type: "q", num: qi + 1, label: q.label, answer: isJa ? "Ja" : a[q.id] === false ? "Nein" : "–", isJa });
    if (isJa && a[q.id + "_text"]) questionRows.push({ type: "detail", text: a[q.id + "_text"], isJa: true });
    if (q.subQuestion && isJa) {
      const subJa = a["q13_komplikationen"] === true;
      questionRows.push({ type: "sub", label: "Komplikationen?", answer: subJa ? "Ja" : a["q13_komplikationen"] === false ? "Nein" : "–", isJa: subJa });
      if (subJa && a["q13_komplikationen_text"]) questionRows.push({ type: "detail", text: a["q13_komplikationen_text"], isJa: true });
    }
  });
  const hasRiskAnswers = questionRows.some(r => r.isJa);
  let nextNum = template.questions.length + 1;
  if (a.geschlecht === "w" && template.additionalQuestionsWomen) {
    template.additionalQuestionsWomen.forEach(q => {
      const isJa = a[q.id] === true;
      questionRows.push({ type: "q", num: nextNum++, label: q.label, answer: isJa ? "Ja" : a[q.id] === false ? "Nein" : "–", isJa });
    });
  }

  const PageHeader = ({ pageNum }) => (
    <div style={{ padding: "30px 44px 0 44px", marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          {practice.logo && !practice.logoReplacesName && (
            <img src={practice.logo} alt="Logo" style={{ maxHeight: "44px", maxWidth: "140px", objectFit: "contain", marginBottom: "4px", display: "block" }} />
          )}
          {practice.logo && practice.logoReplacesName ? (
            <img src={practice.logo} alt="Logo" style={{ maxHeight: "44px", maxWidth: "140px", objectFit: "contain", display: "block", marginBottom: "4px" }} />
          ) : (
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#222", marginBottom: "4px" }}>{practice.name || "Praxis"}</div>
          )}
          <div style={{ fontSize: "9.5px", color: "#444" }}>
            <div>{practice.address1}</div>
            <div>{practice.address2}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "9px", color: "#999", marginBottom: "2px" }}>Seite {pageNum} von {totalPages}</div>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#222" }}>Aufklärungsbogen</div>
        </div>
      </div>
    </div>
  );

  const PageFooter = () => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#888", borderTop: "1px solid #ccc", paddingTop: "8px", position: "absolute", bottom: "30px", left: "44px", right: "44px" }}>
      <div>
        {practice.phone && <div>{fmtPhone(practice.phone)}</div>}
        {practice.email && <div>{practice.email}</div>}
      </div>
      <div style={{ textAlign: "center", fontSize: "7.5px", color: "#aaa" }}>
        {consentData.pdfHash ? `SHA-256: ${consentData.pdfHash.substring(0, 16)}…` : ""}
      </div>
      <div style={{ textAlign: "right" }}>
        {practice.bankName && <div>{practice.bankName}</div>}
        {practice.iban && <div>IBAN: {practice.iban}</div>}
        {practice.bic && <div>BIC: {practice.bic}</div>}
      </div>
    </div>
  );

  const justifyHtml = (html) => html
    .replace(/<p(\s|>)/g, '<p style="text-align:justify;hyphens:auto;-webkit-hyphens:auto;" $1')
    .replace(/<li(\s|>)/g, '<li style="text-align:justify;hyphens:auto;-webkit-hyphens:auto;" $1');

  const sectionHtml = (sections) => sections.map((section, i) => (
    <div key={i}>
      <div style={h2Style}>{section.title}</div>
      <div className="consent-section-html" style={bodyText} dangerouslySetInnerHTML={{ __html: justifyHtml(section.html) }} />
    </div>
  ));

  const cssReset = <style>{`.consent-section-html p, .consent-section-html ul, .consent-section-html ol, .consent-section-html li, .consent-section-html div, .consent-section-html blockquote { margin-left: 0; padding-left: 0; } .consent-section-html p { margin-top: 0.4em; margin-bottom: 0.4em; }`}</style>;

  // ── Group A: Template name + sections before Erfolgsaussichten ──
  const ContentA = () => (
    <div style={{ ...baseFont, width: "calc(210mm - 88px)" }}>
      <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "12px", color: "#222" }}>{template.name}</div>
      {sectionHtml(sectionsGroupA)}
      {cssReset}
    </div>
  );

  // ── Group B: Erfolgsaussichten + remaining sections + questionnaire ──
  const ContentB = () => (
    <div style={{ ...baseFont, width: "calc(210mm - 88px)" }}>
      {sectionHtml(sectionsGroupB)}
      {cssReset}

      <div style={h2Style}>Fragebogen (Anamnese)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "4px 12px", fontSize: "10px", marginBottom: "12px", padding: "8px 10px", background: "#f8f8f8", borderRadius: "4px" }}>
        <div>Alter: <strong>{a.geburtsdatum ? (() => { const b = new Date(a.geburtsdatum); const t = new Date(); let age = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--; return age; })() : (a.alter || "–")}</strong></div>
        <div>Geschlecht: <strong>{a.geschlecht === "w" ? "Weiblich" : a.geschlecht === "m" ? "Männlich" : a.geschlecht === "d" ? "Divers" : "–"}</strong></div>
        <div>Größe: <strong>{a.groesse || "–"}</strong> cm</div>
        <div>Gewicht: <strong>{a.gewicht || "–"}</strong> kg</div>
      </div>
      <table style={{ width: "100%", fontSize: "9.5px", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 6px 4px 0", fontWeight: "600", borderBottom: "1.5px solid #222", width: "24px" }}>#</th>
            <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: "600", borderBottom: "1.5px solid #222" }}>Frage</th>
            <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: "600", borderBottom: "1.5px solid #222", width: "50px" }}>Antwort</th>
          </tr>
        </thead>
        <tbody>
          {questionRows.map((row, i) => {
            if (row.type === "q") return (
              <tr key={i} className={row.isJa ? "risk-highlight" : ""} style={{ borderBottom: "0.5px solid #e5e5e5", ...(row.isJa ? { background: "#fef3c7" } : {}) }}>
                <td style={{ padding: "4px 6px 4px 0", verticalAlign: "top", color: "#888" }}>{row.num || ""}</td>
                <td style={{ padding: "4px 6px" }}>{row.label}</td>
                <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: "600", ...(row.isJa ? { color: "#b45309" } : {}) }}>{row.answer}</td>
              </tr>
            );
            if (row.type === "sub") return (
              <tr key={i} className={row.isJa ? "risk-highlight" : ""} style={{ borderBottom: "0.5px solid #e5e5e5", background: row.isJa ? "#fef3c7" : "#fafafa" }}>
                <td style={{ padding: "3px 6px 3px 0" }}></td>
                <td style={{ padding: "3px 6px", fontSize: "9px", color: "#555" }}>↳ {row.label}</td>
                <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: "600", fontSize: "9px", ...(row.isJa ? { color: "#b45309" } : {}) }}>{row.answer}</td>
              </tr>
            );
            if (row.type === "detail") return (
              <tr key={i} className={row.isJa ? "risk-highlight" : ""} style={{ borderBottom: "0.5px solid #e5e5e5", ...(row.isJa ? { background: "#fef3c7" } : {}) }}>
                <td></td>
                <td colSpan={2} style={{ padding: "2px 6px", fontStyle: "italic", color: row.isJa ? "#92400e" : "#666", fontSize: "9px" }}>→ {row.text}</td>
              </tr>
            );
            return null;
          })}
        </tbody>
      </table>
      {consentData.doctorNotes && (
        <div style={{ marginTop: "14px" }}>
          <div style={h3Style}>Vermerke der Ärztin/des Arztes</div>
          <div style={{ fontSize: "9.5px", whiteSpace: "pre-wrap", padding: "6px 8px", border: "1px solid #ddd", borderRadius: "4px", background: "#fafafa", minHeight: "15mm" }}>{consentData.doctorNotes}</div>
        </div>
      )}
    </div>
  );

  // ── Group C: Vorgesehene Behandlung + Consent/Refusal + Signatures ──
  const ContentC = () => (
    <div style={{ ...baseFont, width: "calc(210mm - 88px)" }}>
      <div style={{ marginBottom: "16px" }}>
        <div style={h2Style}>Vorgesehene Behandlung</div>
        <div style={bodyText}>{template.plannedTreatment}</div>
        <div style={{ fontSize: "10px", marginTop: "6px" }}>
          <strong>Vorgesehener Behandlungsbeginn:</strong> {datumStr}
        </div>
        {ortStr && (
          <div style={{ fontSize: "10px", marginTop: "4px" }}>
            <strong>Ort:</strong> {ortStr}
          </div>
        )}
      </div>
      <div style={{ border: "1.5px solid #222", borderRadius: "4px", padding: "14px 16px", marginBottom: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: "700", color: "#222", marginBottom: "8px" }}>{consentData.refused ? "Ablehnung der Behandlung" : "Einwilligungserklärung"}</div>
        <div style={{ ...bodyText, whiteSpace: "pre-line" }}>
          {consentData.refused ? template.refusalText : template.consentText}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: "30px" }}>
        <div style={{ textAlign: "center", minWidth: "160px" }}>
          {consentData._signatures?.patient && (
            <img src={consentData._signatures.patient} alt="Patient" style={{ height: "55px", display: "block", margin: "0 auto 6px" }} />
          )}
          <div style={{ borderTop: "1.5px solid #222", paddingTop: "6px", fontSize: "10px" }}>
            <div style={{ fontWeight: "600" }}>{patient.vorname} {patient.nachname}</div>
            <div style={{ fontSize: "9px", color: "#888" }}>Patient:in</div>
          </div>
        </div>
        {!consentData.refused && (
          <div
            style={{ textAlign: "center", minWidth: "160px", ...(onDoctorSign && !consentData._signatures?.doctor ? { cursor: "pointer", borderRadius: "6px", padding: "8px", border: "2px dashed #93c5fd", background: "#eff6ff" } : {}) }}
            onClick={onDoctorSign && !consentData._signatures?.doctor ? onDoctorSign : undefined}
            title={onDoctorSign && !consentData._signatures?.doctor ? "Klicken zum Unterschreiben" : undefined}
          >
            {consentData._signatures?.doctor ? (
              <img src={consentData._signatures.doctor} alt="Arzt" style={{ height: "55px", display: "block", margin: "0 auto 6px" }} />
            ) : onDoctorSign ? (
              <div style={{ height: "55px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "10px", color: "#3b82f6" }}>Hier unterschreiben</span>
              </div>
            ) : null}
            <div style={{ borderTop: "1.5px solid #222", paddingTop: "6px", fontSize: "10px" }}>
              <div style={{ fontWeight: "600" }}>{practice.name || "Ärzt:in"}</div>
              <div style={{ fontSize: "9px", color: "#888" }}>Ärzt:in</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ textAlign: "center", fontSize: "9px", color: "#888", marginTop: "16px" }}>
        {consentData.refused ? "Abgelehnt" : "Unterschrieben"} am {new Date(consentData.signedAt).toLocaleString("de-DE")}{ortStr ? ` · ${ortStr}` : ""}
      </div>
    </div>
  );

  // Helper to render clipped pages for a content group
  const renderPages = (ContentComp, groupPages, pageOffset) =>
    Array.from({ length: groupPages }).map((_, i) => (
      <div key={pageOffset + i} data-pdf-page={pageOffset + i + 1} style={pageStyle}>
        <PageHeader pageNum={pageOffset + i + 1} />
        <div style={{ height: CONTENT_H, overflow: "hidden", padding: "0 44px" }}>
          <div style={{ marginTop: -(i * CONTENT_H) }}>
            <ContentComp />
          </div>
        </div>
        <PageFooter />
      </div>
    ));

  return (
    <>
      {/* Hidden measurement divs */}
      <div ref={measRefA} style={hiddenMeas}><ContentA /></div>
      <div ref={measRefB} style={hiddenMeas}><ContentB /></div>
      <div ref={measRefC} style={hiddenMeas}><ContentC /></div>

      {/* Visible A4 pages */}
      <div id="consent-form-pdf-target" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {renderPages(ContentA, pagesA, 0)}
        {renderPages(ContentB, pagesB, pagesA)}
        {renderPages(ContentC, pagesC, pagesA + pagesB)}
      </div>
    </>
  );
}

