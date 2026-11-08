// Gross total of a Rechnung as shown in lists: line items plus 19% MwSt.,
// unless Kleinunternehmer, patient abroad or medical indication (diagnose).
export function invoiceGesamt(inv, kleinunternehmerDefault = false) {
  const zw = (inv.lineItems || []).reduce((s, it) => s + (it.betrag || 0), 0);
  const isAusland = (inv.patient || {}).country && (inv.patient || {}).country !== "Deutschland";
  const isMedical = !!(inv.invoiceMeta && inv.invoiceMeta.diagnose);
  const klein = inv._kleinunternehmer != null ? inv._kleinunternehmer : kleinunternehmerDefault;
  const noMwst = klein || isAusland || isMedical;
  return zw + (noMwst ? 0 : Math.round(zw * 0.19 * 100) / 100);
}
