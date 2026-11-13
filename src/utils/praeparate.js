import { evalAmount } from "./helpers";
import { treatmentPoints } from "./markers";

// ═══════════════════ Präparate on a Behandlungsdoku ═══════════════════
// A Behandlungsdoku can use several Präparate in one session (e.g. two
// Botulinum products for different regions). The list lives in
// `treatmentDoc.praeparate` as [{ name, einheit, amount }]; each injection
// point carries the index of its Präparat in `marker.p` (absent = 0).
// The legacy single fields `praeparat`, `einheit` and `amount` always mirror
// the first entry, so older readers keep working unchanged.

const LETTERS = "ABCDEFGHIJ";
export const praepLetter = (i) => LETTERS[i] || String(i + 1);

// `charge` is the Chargennummer (LOT) of the product used. Optional for Botulinum,
// required for Dermalfiller (Klasse-III-Medizinprodukt, Rückverfolgbarkeit nach § 630f BGB).
// `verfall` is the expiry month ("2028-03"), `rekonstitution` the dilution as typed
// ("50 SE in 1,25 ml NaCl 0,9 %"); both optional.
export const emptyPraeparat = (einheit = "SE") => ({ name: "", einheit, amount: "", charge: "", verfall: "", rekonstitution: "" });

export function getPraeparate(td) {
  const t = td || {};
  if (Array.isArray(t.praeparate) && t.praeparate.length > 0) {
    return t.praeparate.map((p) => ({ name: p.name || "", einheit: p.einheit || t.einheit || "SE", amount: p.amount || "", charge: p.charge || "", verfall: p.verfall || "", rekonstitution: p.rekonstitution || "" }));
  }
  return [{ name: t.praeparat || "", einheit: t.einheit || "SE", amount: t.amount || "", charge: t.charge || "", verfall: "", rekonstitution: "" }];
}

export const markerPraepIdx = (m, count = Infinity) => {
  const p = m && Number.isInteger(m.p) && m.p > 0 ? m.p : 0;
  return count > 0 && p > count - 1 ? count - 1 : p;
};

// Per Präparat: its points and the summed units from the markers
export function praeparatTotals(td) {
  const list = getPraeparate(td);
  // Guide lines (Markierungen) are not points
  const markers = treatmentPoints(td && td.markers);
  return list.map((p, i) => {
    const own = markers.filter((m) => markerPraepIdx(m, list.length) === i);
    const units = Math.round(own.reduce((s, m) => s + evalAmount(m.amount), 0) * 100) / 100;
    return { ...p, idx: i, letter: praepLetter(i), count: own.length, units };
  });
}

const fmtNum = (v) => (v % 1 === 0 ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(".", ","));

// "40 SE" from markers, or the typed amount when no points are documented
export const praepMengeStr = (t) => (t.count > 0 ? (t.units > 0 ? `${fmtNum(t.units)} ${t.einheit}` : "") : t.amount ? `${t.amount} ${t.einheit}` : "");

// One-line summary, e.g. "Bocouture 40 SE · Relfydess 25 SE"
export const praeparateSummary = (td) => praeparatTotals(td)
  .filter((t) => t.name || t.count > 0 || t.amount)
  .map((t) => [t.name || "Präparat", praepMengeStr(t)].filter(Boolean).join(" "))
  .join(" · ");

// Store the list and keep the legacy single fields in sync with the first entry.
// `amount` keeps its old meaning: the documented total over all points, or the
// typed amount of the first Präparat when there are no points.
export function withPraeparate(td, praeparate) {
  const list = (praeparate && praeparate.length > 0 ? praeparate : [emptyPraeparat()])
    .map((p) => ({ name: (p.name || "").trim(), einheit: p.einheit || "SE", amount: (p.amount || "").trim(), charge: (p.charge || "").trim(), verfall: (p.verfall || "").trim(), rekonstitution: (p.rekonstitution || "").trim() }));
  const markers = treatmentPoints(td && td.markers);
  const total = Math.round(markers.reduce((s, m) => s + evalAmount(m.amount), 0) * 100) / 100;
  return {
    ...td,
    praeparate: list,
    praeparat: list[0].name,
    einheit: list[0].einheit,
    charge: list[0].charge,
    amount: markers.length > 0 ? fmtNum(total) : list[0].amount,
  };
}
