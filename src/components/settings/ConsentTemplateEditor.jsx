import React from "react";
import RichTextField from "./RichTextField";
import InfoTooltip from "../ui/InfoTooltip";
import { newQuestionId } from "../consent/consentTemplateStore";

const inputCls = "w-full border border-[#DFE3EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-600";
const labelCls = "block text-xs font-medium text-gray-500 mb-1";

const move = (arr, i, dir) => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

function RowActions({ index, count, onMove, onRemove, removeLabel }) {
  const btn = "p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button type="button" className={btn} disabled={index === 0} onClick={() => onMove(-1)} title="Nach oben">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
      </button>
      <button type="button" className={btn} disabled={index === count - 1} onClick={() => onMove(1)} title="Nach unten">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      <button type="button" className={btn + " hover:!text-red-500"} onClick={onRemove} title={removeLabel}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </div>
  );
}

function Block({ title, hint, children }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-1.5 mb-1">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      {hint && <p className="text-xs text-gray-400 mb-4">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

function QuestionList({ questions, onChange, readOnly, numberOffset = 0, addLabel }) {
  const update = (i, patch) => onChange(questions.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <div key={q.id} className="rounded-lg bg-gray-50 p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <span className="text-xs font-semibold text-gray-400 w-6 text-right pt-2.5 flex-shrink-0">{numberOffset + i + 1}.</span>
            <div className="flex-1 min-w-0 space-y-2">
              <input className={inputCls} disabled={readOnly} value={q.label || ""} placeholder="Frage, z.B. Besteht eine Allergie?" onChange={(e) => update(i, { label: e.target.value })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={inputCls + " text-xs"} disabled={readOnly} value={q.details || ""} placeholder="Erläuterung (optional)" onChange={(e) => update(i, { details: e.target.value })} />
                <input className={inputCls + " text-xs"} disabled={readOnly} value={q.followUp || ""} placeholder="Rückfrage bei „Ja“ (optional), z.B. Wenn ja, welche?" onChange={(e) => update(i, { followUp: e.target.value })} />
              </div>
            </div>
            {!readOnly && (
              <RowActions index={i} count={questions.length} removeLabel="Frage entfernen"
                onMove={(dir) => onChange(move(questions, i, dir))}
                onRemove={() => onChange(questions.filter((_, k) => k !== i))} />
            )}
          </div>
        </div>
      ))}
      {!readOnly && (
        <button type="button" className="text-sm text-blue-600 hover:text-blue-700 font-medium transition" onClick={() => onChange([...questions, { id: newQuestionId(), label: "", details: "", followUp: "" }])}>
          + {addLabel}
        </button>
      )}
    </div>
  );
}

export default function ConsentTemplateEditor({ template, onChange, readOnly = false }) {
  const t = template;
  const set = (patch) => onChange({ ...t, ...patch });
  const sections = t.sections || [];
  const updateSection = (i, patch) => set({ sections: sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  return (
    <div>
      <Block title="Allgemein">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Name (Überschrift des Bogens)</label>
            <input className={inputCls} disabled={readOnly} value={t.name || ""} placeholder="z.B. Injektion von Hyaluronsäure zur Faltenkorrektur" onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
              Kurzbezeichnung
              <InfoTooltip>Erscheint in Listen, in der Auswahl beim Start eines Bogens und im Dateinamen der PDF.</InfoTooltip>
            </label>
            <input className={inputCls} disabled={readOnly} value={t.shortName || ""} placeholder="z.B. Hyaluron Faltenkorrektur" onChange={(e) => set({ shortName: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Geplante Behandlung</label>
            <input className={inputCls} disabled={readOnly} value={t.plannedTreatment || ""} placeholder="z.B. Injektion von Hyaluronsäure." onChange={(e) => set({ plannedTreatment: e.target.value })} />
          </div>
        </div>
      </Block>

      <Block title="Aufklärungstext" hint="Die Abschnitte, die Patient:innen vor dem Fragebogen lesen.">
        <div className="space-y-5">
          {sections.map((s, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 mb-2">
                <input className={inputCls + " font-medium"} disabled={readOnly} value={s.title || ""} placeholder="Überschrift des Abschnitts" onChange={(e) => updateSection(i, { title: e.target.value })} />
                {!readOnly && (
                  <RowActions index={i} count={sections.length} removeLabel="Abschnitt entfernen"
                    onMove={(dir) => set({ sections: move(sections, i, dir) })}
                    onRemove={() => set({ sections: sections.filter((_, k) => k !== i) })} />
                )}
              </div>
              <RichTextField value={s.html || ""} readOnly={readOnly} onChange={(html) => updateSection(i, { html })} />
            </div>
          ))}
          {!readOnly && (
            <button type="button" className="text-sm text-blue-600 hover:text-blue-700 font-medium transition" onClick={() => set({ sections: [...sections, { type: "info", title: "", html: "" }] })}>
              + Abschnitt hinzufügen
            </button>
          )}
        </div>
      </Block>

      <Block title="Fragebogen" hint="Ja/Nein-Fragen. Mit „Ja“ beantwortete Fragen landen automatisch in der Anamnese der Patient:in.">
        <QuestionList questions={t.questions || []} readOnly={readOnly} addLabel="Frage hinzufügen" onChange={(questions) => set({ questions })} />
      </Block>

      <Block title="Zusatzfragen für Patientinnen" hint="Werden nur gestellt, wenn als Geschlecht „weiblich“ angegeben ist.">
        <QuestionList questions={t.additionalQuestionsWomen || []} readOnly={readOnly} numberOffset={(t.questions || []).length} addLabel="Zusatzfrage hinzufügen" onChange={(additionalQuestionsWomen) => set({ additionalQuestionsWomen })} />
      </Block>

      <Block title="Einwilligung">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Einwilligungserklärung</label>
            <textarea className={inputCls + " leading-relaxed"} rows={9} disabled={readOnly} value={t.consentText || ""} onChange={(e) => set({ consentText: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Ablehnungserklärung</label>
            <textarea className={inputCls + " leading-relaxed"} rows={3} disabled={readOnly} value={t.refusalText || ""} onChange={(e) => set({ refusalText: e.target.value })} />
          </div>
        </div>
      </Block>
    </div>
  );
}
