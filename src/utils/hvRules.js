// ═══════════════════ Honorarvereinbarung rules (§ 2 GOÄ) ═══════════════════
//
// Above 3,5-fach a Rechnung needs a Honorarvereinbarung that was agreed in
// writing BEFORE the treatment (§ 2 Abs. 2 GOÄ). An HV produced together with
// the invoice after the treatment does not count, so the app no longer
// creates one: the Rechnung has to be created from a signed HV.

export const HV_THRESHOLD = 3.5;

const localDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const maxSteigerung = (items) =>
  Math.max(0, ...(items || []).filter((it) => it.steigerung != null).map((it) => it.steigerung));

// Date (YYYY-MM-DD) on which the HV became fully signed, or null if it is not.
// HVs signed before signature times were recorded fall back to the HV's own date.
export function hvSignedDate(hv) {
  if (!hv) return null;
  if (hv._signedHvUpload) return localDate(hv._signedHvUpload.uploadedAt) || hv.invoiceMeta?.datum || null;
  const sigs = hv._signatures || {};
  if (!(sigs.patient && sigs.doctor)) return null;
  const at = hv._signedAt || {};
  if (at.patient && at.doctor) return localDate(at.patient > at.doctor ? at.patient : at.doctor);
  return hv.invoiceMeta?.datum || localDate(hv._createdAt || hv.savedAt) || null;
}

// Does this HV allow billing above 3,5-fach for a treatment on treatmentDate?
// Returns { ok, reason, signedOn } with reason "missing" | "unsigned" | "signed_after" | "exceeds".
export function checkHvForInvoice(hv, treatmentDate, invoiceItems) {
  if (!hv || !hv._hvOnly) return { ok: false, reason: "missing" };
  const signedOn = hvSignedDate(hv);
  if (!signedOn) return { ok: false, reason: "unsigned" };
  if (treatmentDate && signedOn > treatmentDate) return { ok: false, reason: "signed_after", signedOn };
  // The invoice must not bill a higher rate than agreed for the same GOÄ-Ziffer
  const agreed = new Map((hv.lineItems || []).filter((it) => it.steigerung != null).map((it) => [it.goaCode, it.steigerung]));
  const exceeds = (invoiceItems || []).some((it) => it.steigerung != null && it.steigerung > HV_THRESHOLD
    && (!agreed.has(it.goaCode) || it.steigerung > agreed.get(it.goaCode) + 0.005));
  if (exceeds) return { ok: false, reason: "exceeds", signedOn };
  return { ok: true, signedOn };
}

export function hvProblemText(check, treatmentDate) {
  const fmt = (d) => (d ? d.split("-").reverse().join(".") : "");
  switch (check.reason) {
    case "missing": return "Über 3,5-fach ist nur mit einer Honorarvereinbarung möglich, die vor der Behandlung schriftlich geschlossen wurde (§ 2 Abs. 2 GOÄ). Erstelle die Rechnung aus der unterschriebenen HV oder senke den Gesamtbetrag.";
    case "unsigned": return "Die verknüpfte Honorarvereinbarung ist noch nicht von Patient:in und Ärzt:in unterschrieben. Ohne Unterschriften vor der Behandlung ist über 3,5-fach nicht abrechenbar.";
    case "signed_after": return `Die Honorarvereinbarung wurde am ${fmt(check.signedOn)} unterschrieben, die Behandlung war am ${fmt(treatmentDate)}. Sie muss vor der Behandlung unterschrieben sein (§ 2 Abs. 2 GOÄ).`;
    case "exceeds": return "Die Rechnung enthält einen höheren Steigerungssatz als in der Honorarvereinbarung vereinbart. Senke den Gesamtbetrag auf die vereinbarten Sätze.";
    default: return "";
  }
}

// Highest Gesamtbetrag (in cents precision) whose rates stay at or below the threshold.
// itemsFor(gesamt) returns the line items the form would build for that total.
export function maxGesamtWithin(itemsFor, upperBound, limit = HV_THRESHOLD) {
  let lo = 0, hi = Math.max(0, upperBound);
  if (maxSteigerung(itemsFor(hi)) <= limit) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (maxSteigerung(itemsFor(mid)) <= limit) lo = mid; else hi = mid;
  }
  let best = Math.floor(lo * 100) / 100;
  // Cent rounding can nudge GOÄ 267 (which absorbs the rest) over the limit: step down until it holds
  for (let i = 0; i < 20 && best > 0 && maxSteigerung(itemsFor(best)) > limit; i++) best = Math.round((best - 0.01) * 100) / 100;
  return best;
}
