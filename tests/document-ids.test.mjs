import { register } from "node:module";
register("./_resolve-hooks.mjs", import.meta.url);
import test from "node:test";
import assert from "node:assert/strict";

const { dedupeDocumentIds } = await import("../src/utils/documentIds.js");

test("migrated Behandlungsdoku copy gets its own id, the Rechnung keeps its id", () => {
  const docs = [
    { id: "inv-1", _supabaseId: "row-td", _standalone: true, _treatmentDocOnly: true },
    { id: "inv-1", _supabaseId: "row-re" },
    { id: "treat-2", _supabaseId: "row-2", _standalone: true },
  ];
  const out = dedupeDocumentIds(docs);
  assert.equal(out[1].id, "inv-1");
  assert.equal(out[0].id, "inv-1~row-td");
  assert.equal(out[2], docs[2]);
  assert.equal(new Set(out.map((d) => d.id)).size, 3);
  assert.equal(docs[0].id, "inv-1", "input is not mutated");
});

test("documents without clashes come back unchanged and in order", () => {
  const docs = [{ id: "a", _supabaseId: "1" }, { id: "b", _supabaseId: "2" }];
  assert.deepEqual(dedupeDocumentIds(docs), docs);
  assert.deepEqual(dedupeDocumentIds(undefined), []);
});

test("several copies of one id all become unique", () => {
  const docs = [
    { id: "x", _supabaseId: "r1" },
    { id: "x", _supabaseId: "r2", _standalone: true },
    { id: "x", _supabaseId: "r3", _standalone: true },
  ];
  const ids = dedupeDocumentIds(docs).map((d) => d.id);
  assert.deepEqual(ids, ["x", "x~r2", "x~r3"]);
});
