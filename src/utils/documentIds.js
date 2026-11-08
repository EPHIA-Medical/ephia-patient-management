// Every loaded document needs its own `id`: the lists key their rows by it,
// and delete, edit and view look documents up by it.
//
// The one-off migration to the documents table copied each Rechnung that had
// its Behandlungsdoku attached into a second, standalone Behandlungsdoku with
// `...inv`, so both rows carry the same `id`. Symptoms: those rows stayed on
// top of the Dokumente list whatever the sort (duplicate React keys), and a
// delete or edit by `id` could hit the other document.
//
// dedupeDocumentIds gives every repeat a unique id derived from its database
// row (`_supabaseId`). The original document (not `_standalone`) keeps its id,
// so nothing that links to the Rechnung changes. The new id is written back
// with the next save of that document; nothing else references it (vouchers
// link by `_supabaseId`, `_fromHvId` only points at Honorarvereinbarungen).

/** Returns a new array; documents without a clash are returned as is. */
export function dedupeDocumentIds(docs) {
  const list = docs || [];
  // Originals claim their id first, copies yield.
  const order = list
    .map((doc, i) => ({ doc, i }))
    .sort((a, b) => Number(!!a.doc._standalone) - Number(!!b.doc._standalone) || a.i - b.i);
  const seen = new Set();
  const out = list.slice();
  for (const { doc, i } of order) {
    if (doc.id == null || !seen.has(doc.id)) {
      if (doc.id != null) seen.add(doc.id);
      continue;
    }
    let next = `${doc.id}~${doc._supabaseId || i}`;
    while (seen.has(next)) next += "~";
    seen.add(next);
    out[i] = { ...doc, id: next };
  }
  return out;
}
