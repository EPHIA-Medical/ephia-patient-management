// ═══════════════════ Critical Anamnese findings ═══════════════════
//
// Picks the Anamnese entries a doctor must see before every treatment and shows
// them at the top of the patient view. Built-in questions match by id; questions
// from a practice's own templates fall back to their label.
//
// Which categories count is a medical decision: adjust CRITICAL_CATEGORIES
// together with the medical lead, not on a whim.

export const CRITICAL_CATEGORIES = [
  { key: "infektion", label: "Infektionskrankheit", id: /infekt/i, text: /infektionskrankheit|hepatitis|\bhiv\b|tuberkulose/i },
  { key: "allergie", label: "Allergie", id: /allergie|insekten/i, text: /allerg/i },
  { key: "blutung", label: "Blutungsneigung", id: /blutung/i, text: /blutungsneigung|blutungen/i },
  { key: "neuromuskulaer", label: "Nerven- oder Muskelerkrankung", id: /neuromusk|erbkrankheit/i, text: /myasthen|lambert-eaton|muskelschwäche/i },
  { key: "immun", label: "Immunsuppression", id: /immun/i, text: /immunsystem|autoimmun/i },
  { key: "schwanger", label: "Schwangerschaft möglich", id: /schwanger/i, text: /schwanger/i },
  { key: "stillen", label: "Stillt", id: /stillen/i, text: /\bstillen\b/i },
];

export function categorizeFinding(entry) {
  const id = entry?.questionId || "";
  const label = entry?.questionLabel || "";
  return CRITICAL_CATEGORIES.find((c) => c.id.test(id)) || CRITICAL_CATEGORIES.find((c) => c.text.test(label)) || null;
}

// One item per category, in category order, with the newest date and all details of that category.
export function criticalFindings(anamnese) {
  const byKey = new Map();
  for (const entry of anamnese || []) {
    const cat = categorizeFinding(entry);
    if (!cat) continue;
    const item = byKey.get(cat.key) || { key: cat.key, label: cat.label, details: [], addedAt: "" };
    const detail = (entry.detailText || "").trim();
    if (detail && !item.details.includes(detail)) item.details.push(detail);
    if ((entry.addedAt || "") > item.addedAt) item.addedAt = entry.addedAt;
    byKey.set(cat.key, item);
  }
  return CRITICAL_CATEGORIES.map((c) => byKey.get(c.key)).filter(Boolean);
}
