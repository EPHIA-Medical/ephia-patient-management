// Gross total of a Rechnung as shown in lists: line items plus 19% MwSt.,
// unless Kleinunternehmer (§ 19 UStG) or medical indication (§ 4 Nr. 14 UStG).
// The patient's country does not matter: the place of supply is the practice.
export function invoiceGesamt(inv, kleinunternehmerDefault = false) {
  const zw = (inv.lineItems || []).reduce((s, it) => s + (it.betrag || 0), 0);
  const isMedical = !!(inv.invoiceMeta && inv.invoiceMeta.diagnose);
  const klein = inv._kleinunternehmer != null ? inv._kleinunternehmer : kleinunternehmerDefault;
  const noMwst = klein || isMedical;
  return zw + (noMwst ? 0 : Math.round(zw * 0.19 * 100) / 100);
}
