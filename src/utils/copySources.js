// Earlier treatments of one patient that a new Behandlungsdoku can take Präparate and
// injection points from ("Aus früherer Behandlung übernehmen"): standalone Behandlungsdokus,
// Rechnungen and Honorarvereinbarungen, newest treatment first.
//
// Until 2026-11 only Rechnungen and Honorarvereinbarungen were offered, so a patient whose
// last treatment was documented without a Rechnung got no dropdown at all. Migrated
// Behandlungsdoku copies (_treatmentDocOnly) repeat their Rechnung and are left out.

export const treatmentDateOf = (inv) =>
  inv.treatmentDoc?.behandlungsDatum || inv.invoiceMeta?.datum || (inv.savedAt || "").slice(0, 10);

const hasTreatmentDoc = (td) =>
  !!td && ((td.markers || []).length > 0 || !!td.praeparat || (td.praeparate || []).some((p) => p && p.name));

export function treatmentCopySources(patientDocs) {
  return (patientDocs || [])
    .filter((inv) => {
      if (inv._consentForm || inv._treatmentDocOnly) return false;
      const hasDoc = hasTreatmentDoc(inv.treatmentDoc);
      return inv._standalone ? hasDoc : hasDoc || !!(inv.praeparat || inv.einheit);
    })
    .sort((a, b) => treatmentDateOf(b).localeCompare(treatmentDateOf(a)));
}
