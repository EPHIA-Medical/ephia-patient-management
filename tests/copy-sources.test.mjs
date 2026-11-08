import { register } from "node:module";
register("./_resolve-hooks.mjs", import.meta.url);
import test from "node:test";
import assert from "node:assert/strict";

const { treatmentCopySources } = await import("../src/utils/copySources.js");

const pts = [{ x: 10, y: 20, amount: "4" }];
const docs = [
  { id: "re-old", invoiceMeta: { nummer: "RE-1", datum: "2026-01-10" }, praeparat: "Bocouture", einheit: "SE" },
  { id: "td-new", _standalone: true, invoiceMeta: { nummer: "—", datum: "" }, treatmentDoc: { behandlungsDatum: "2026-10-02", markers: pts, praeparat: "Bocouture" } },
  { id: "td-empty", _standalone: true, invoiceMeta: { datum: "" }, treatmentDoc: { behandlungsDatum: "2026-11-01", markers: [] } },
  { id: "re-1~row", _standalone: true, _treatmentDocOnly: true, invoiceMeta: { datum: "2026-01-10" }, treatmentDoc: { behandlungsDatum: "2026-01-10", markers: pts } },
  { id: "consent", _consentForm: true, invoiceMeta: { datum: "2026-11-05" } },
  { id: "hv", _hvOnly: true, invoiceMeta: { datum: "2026-06-01" }, praeparat: "Azzalure" },
  { id: "beratung", invoiceMeta: { nummer: "RE-2", datum: "2026-07-01" } },
];

test("earlier Behandlungsdokus are offered next to Rechnungen and HVs, newest first", () => {
  assert.deepEqual(treatmentCopySources(docs).map((d) => d.id), ["td-new", "hv", "re-old"]);
});

test("empty docs, consent forms, migrated copies and Beratungen without Präparat are left out", () => {
  const ids = treatmentCopySources(docs).map((d) => d.id);
  for (const id of ["td-empty", "re-1~row", "consent", "beratung"]) assert.ok(!ids.includes(id), id);
});

test("a Behandlungsdoku with several Präparate but no points still counts", () => {
  const multi = [{ id: "m", _standalone: true, invoiceMeta: {}, treatmentDoc: { behandlungsDatum: "2026-03-01", markers: [], praeparate: [{ name: "Bocouture" }, { name: "Relfydess" }] } }];
  assert.equal(treatmentCopySources(multi).length, 1);
  assert.deepEqual(treatmentCopySources(undefined), []);
});
