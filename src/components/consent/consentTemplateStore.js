// ═══════════════════ Consent template store ═══════════════════
//
// Built-in templates live in consentTemplates.js. A practice can adapt them:
// its own templates are stored plaintext in practice_data.consentTemplates
// (the doctor's own content, no patient data). A practice template that was
// adapted from a built-in one carries `basedOn` and replaces that built-in in
// the list of available templates.
//
// Signed consent forms keep a frozen copy of the template in
// consentData.templateSnapshot, so later edits never change what a patient
// signed. Forms from before snapshots existed resolve to the built-in by id.

import { CONSENT_TEMPLATES } from "./consentTemplates";

const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI"]);
const DROP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "SVG", "MATH"]);

// Allowlist sanitizer for the rich-text sections: keeps basic formatting,
// strips every attribute, unwraps unknown elements, turns <div> into <p>.
export function sanitizeConsentHtml(html) {
  if (!html || typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out = doc.createElement("div");
  const walk = (src, dest) => {
    for (const node of Array.from(src.childNodes)) {
      if (node.nodeType === 3) { dest.appendChild(doc.createTextNode(node.textContent)); continue; }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName;
      if (DROP_TAGS.has(tag)) continue;
      if (ALLOWED_TAGS.has(tag) || tag === "DIV") {
        const el = doc.createElement(tag === "DIV" ? "p" : tag.toLowerCase());
        walk(node, el);
        dest.appendChild(el);
      } else {
        walk(node, dest);
      }
    }
  };
  walk(doc.body, out);
  // Drop empty paragraphs left behind by the editor
  return out.innerHTML.replace(/<p>(\s|<br>)*<\/p>/g, "").trim();
}

const cleanTemplate = (tpl) => ({
  ...tpl,
  sections: (tpl.sections || []).map((s) => ({ ...s, html: sanitizeConsentHtml(s.html) })),
  questions: tpl.questions || [],
  additionalQuestionsWomen: tpl.additionalQuestionsWomen || [],
});

export const isBuiltinTemplate = (tpl) => !!tpl && CONSENT_TEMPLATES.some((b) => b.id === tpl.id);

export function getPracticeTemplates(practice) {
  return Array.isArray(practice?.consentTemplates) ? practice.consentTemplates : [];
}

// Templates a doctor can start a consent form with: own templates first,
// then built-ins that the practice has not adapted.
export function getAvailableConsentTemplates(practice) {
  const own = getPracticeTemplates(practice).map(cleanTemplate);
  const overridden = new Set(own.map((t) => t.basedOn).filter(Boolean));
  // Retired built-ins (older versions) only render existing forms, they are not offered anymore
  return [...own, ...CONSENT_TEMPLATES.filter((b) => !b.retired && !overridden.has(b.id))];
}

// The template a stored consent form must be rendered with.
export function resolveConsentTemplate(consentData, practice) {
  const cd = consentData || {};
  if (cd.templateSnapshot && Array.isArray(cd.templateSnapshot.sections)) return cleanTemplate(cd.templateSnapshot);
  const builtin = CONSENT_TEMPLATES.find((t) => t.id === cd.templateId);
  if (builtin) return builtin;
  const own = getPracticeTemplates(practice).find((t) => t.id === cd.templateId);
  if (own) return cleanTemplate(own);
  return CONSENT_TEMPLATES[0];
}

// Short label for lists and file names
export function consentTemplateLabel(tpl) {
  if (!tpl) return "";
  return tpl.shortName || (tpl.title || "").replace("Aufklärungsbogen — ", "") || tpl.name || "";
}

const randomId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, "").slice(0, 12);
export const newQuestionId = () => "q_" + randomId();

// Copy a template into a practice-owned, editable template
export function copyTemplateForPractice(source, { asAdaptation = true } = {}) {
  const copy = JSON.parse(JSON.stringify(source));
  const builtin = isBuiltinTemplate(source);
  return {
    ...copy,
    id: "custom_" + randomId(),
    basedOn: builtin && asAdaptation ? source.id : null,
    basedOnVersion: builtin ? source.version : (source.basedOnVersion || null),
    version: "1",
    shortName: builtin && asAdaptation ? copy.shortName : `${copy.shortName || ""} (Kopie)`.trim(),
    updatedAt: new Date().toISOString(),
  };
}

export function emptyPracticeTemplate() {
  return {
    id: "custom_" + randomId(),
    basedOn: null,
    version: "1",
    name: "",
    shortName: "",
    title: "",
    plannedTreatment: "",
    sections: [{ type: "info", title: "", html: "" }],
    questions: [],
    additionalQuestionsWomen: [],
    consentText: CONSENT_TEMPLATES[0].consentText,
    refusalText: CONSENT_TEMPLATES[0].refusalText,
    updatedAt: new Date().toISOString(),
  };
}

// Before saving: derive the title, sanitize, and bump the version of every
// template whose content changed compared to the stored one.
export function finalizePracticeTemplates(nextTemplates, prevTemplates) {
  const prevById = new Map((prevTemplates || []).map((t) => [t.id, t]));
  const contentKey = ({ version, updatedAt, ...rest }) => JSON.stringify(rest);
  return (nextTemplates || []).map((raw) => {
    const t = cleanTemplate(raw);
    t.title = `Aufklärungsbogen — ${(t.shortName || t.name || "").trim()}`;
    const prev = prevById.get(t.id);
    if (!prev) return { ...t, version: t.version || "1", updatedAt: new Date().toISOString() };
    if (contentKey(prev) === contentKey(t)) return { ...t, version: prev.version, updatedAt: prev.updatedAt };
    return { ...t, version: String((parseInt(prev.version, 10) || 1) + 1), updatedAt: new Date().toISOString() };
  });
}

// Returns a German error message for the first problem, or null
export function validatePracticeTemplate(t) {
  if (!(t.name || "").trim()) return "Bitte gib dem Aufklärungsbogen einen Namen.";
  if (!(t.shortName || "").trim()) return "Bitte gib eine Kurzbezeichnung an.";
  if ((t.sections || []).some((s) => !(s.title || "").trim())) return "Jeder Abschnitt braucht eine Überschrift.";
  if ([...(t.questions || []), ...(t.additionalQuestionsWomen || [])].some((q) => !(q.label || "").trim())) return "Jede Frage braucht einen Text.";
  if (!(t.consentText || "").trim()) return "Der Einwilligungstext darf nicht leer sein.";
  return null;
}

// Practice copy that is embedded in each document: templates do not belong there.
export function practiceForDocument(practice) {
  const { consentTemplates, ...rest } = practice || {};
  return { ...rest, logo: rest.logo || "" };
}
