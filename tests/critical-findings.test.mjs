import { test } from "node:test";
import assert from "node:assert/strict";
import { criticalFindings, categorizeFinding } from "../src/utils/criticalFindings.js";

test("built-in ids map to their category", () => {
  assert.equal(categorizeFinding({ questionId: "v3_infektion" }).key, "infektion");
  assert.equal(categorizeFinding({ questionId: "q4_infektionskrankheit" }).key, "infektion");
  assert.equal(categorizeFinding({ questionId: "f1_insekten" }).key, "allergie");
  assert.equal(categorizeFinding({ questionId: "q8_erbkrankheit" }).key, "neuromuskulaer");
  assert.equal(categorizeFinding({ questionId: "zf1_schwanger" }).key, "schwanger");
});

test("non-critical answers are ignored", () => {
  for (const id of ["v3_rauchen", "v3_herpes", "v3_botox_vorher", "f1_filler_vorher", "q12_lippenherpes", "v3_medikamente"]) {
    assert.equal(categorizeFinding({ questionId: id, questionLabel: "x" }), null, id);
  }
});

test("custom template questions fall back to the label", () => {
  assert.equal(categorizeFinding({ questionId: "c_1", questionLabel: "Sind Sie HIV-positiv?" }).key, "infektion");
  assert.equal(categorizeFinding({ questionId: "c_2", questionLabel: "Rauchen Sie?" }), null);
});

test("merges entries per category, keeps details and newest date, orders by category", () => {
  const out = criticalFindings([
    { questionId: "v3_allergie", detailText: "Latex", addedAt: "2026-03-01" },
    { questionId: "f1_insekten", detailText: "", addedAt: "2026-05-01" },
    { questionId: "v3_infektion", detailText: "Hepatitis C", addedAt: "2026-01-10" },
    { questionId: "v3_rauchen", detailText: "10 am Tag", addedAt: "2026-01-10" },
  ]);
  assert.deepEqual(out.map((f) => f.key), ["infektion", "allergie"]);
  assert.deepEqual(out[0].details, ["Hepatitis C"]);
  assert.equal(out[1].addedAt, "2026-05-01");
  assert.deepEqual(out[1].details, ["Latex"]);
});
