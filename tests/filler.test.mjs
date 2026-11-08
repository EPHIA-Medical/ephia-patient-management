import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import * as hooks from "./_resolve-hooks.mjs";

registerHooks(hooks);
const helpers = await import("../src/utils/helpers.js");
const constants = await import("../src/constants/index.js");
const praeparate = await import("../src/utils/praeparate.js");
const { CONSENT_TEMPLATES } = await import("../src/components/consent/consentTemplates.js");
const { buildLineItems, calcWeightedForGesamt, calcGesamt, calcGoaBetrag } = helpers;

const FILLER = { treatmentType: "filler", infiltrationCode: "268", anaesthesieCode: "490", spritzenGroesse: "1 ml" };
const codes = (items) => items.filter((it) => !it.isProduct).map((it) => it.goaCode);

test("Botulinum line items are unchanged without options", () => {
  const items = buildLineItems("Bocouture", 20, 0.5, [], [], null, "SE", false, false, 0, false);
  assert.deepEqual(codes(items), ["1", "5", "267"]);
  const product = items.find((it) => it.isPraeparat);
  assert.equal(product.description, "20SE Bocouture");
  assert.equal(product.einheit, "SE");
  assert.equal(product.betrag, 10);
});

test("Filler session bills 1, 5, the chosen infiltration line, the Anästhesie and whole syringes", () => {
  const items = buildLineItems("Juvéderm Volift", 2, 110, [], [], null, "SE", false, true, 999, false, FILLER);
  assert.deepEqual(codes(items), ["1", "5", "268", "490"]);
  const injection = items.find((it) => it.goaCode === "268");
  assert.equal(injection.punkte, 130);
  const anaesthesie = items.find((it) => it.goaCode === "490");
  assert.equal(anaesthesie.steigerung, 2.3);
  assert.equal(anaesthesie.betrag, calcGoaBetrag(60, 2.3));
  const product = items.find((it) => it.isPraeparat);
  assert.equal(product.description, "2 Spritzen Juvéderm Volift (1 ml)");
  assert.equal(product.einheit, "Spritze");
  assert.equal(product.betrag, 220, "whole syringes, never the Ampulle price");
  assert.equal(product.ganzeAmpulle, false);
});

test("Filler default is GOÄ 267 with no Anästhesie, singular Spritze", () => {
  const items = buildLineItems("Restylane", 1, 95, [], [], null, "ml", false, false, 0, false, { treatmentType: "filler" });
  assert.deepEqual(codes(items), ["1", "5", "267"]);
  assert.equal(items.find((it) => it.isPraeparat).description, "1 Spritze Restylane");
});

test("Filler Wunschbetrag is reached and the Anästhesie keeps its fixed rate", () => {
  for (const wunsch of [350, 489.9, 1200]) {
    const s = calcWeightedForGesamt(wunsch, 2, 110, [], [], false, false, false, 0, false, FILLER);
    const items = buildLineItems("Juvéderm Volift", 2, 110, [], [], s, "SE", false, false, 0, false, FILLER);
    const gesamt = calcGesamt(items, false, false, false);
    assert.ok(Math.abs(gesamt - wunsch) <= 0.02, `wunsch ${wunsch}: got ${gesamt}`);
    assert.equal(items.find((it) => it.goaCode === "490").steigerung, 2.3);
    assert.equal(items.find((it) => it.goaCode === "268").steigerung, s.s267);
  }
});

test("Filler Beratung-only invoice carries just GOÄ 1", () => {
  const items = buildLineItems("", 0, 0, [], [], null, "ml", false, false, 0, true, FILLER);
  assert.deepEqual(codes(items), ["1"]);
  assert.equal(items.some((it) => it.isProduct), false);
});

test("Filler constants are consistent", () => {
  assert.equal(constants.FILLER_INFILTRATION_OPTIONS.find((o) => o.goaCode === "268").punkte, 130);
  assert.equal(calcGoaBetrag(130, 1), 7.58);
  assert.equal(calcGoaBetrag(60, 1), 3.5);
  assert.equal(calcGoaBetrag(120, 1), 6.99);
  assert.equal(constants.icd10CodesFor("filler").map((c) => c.icd10).join(","), "E88.1,L90.5,G51.8");
  assert.equal(constants.icd10CodesFor("botox"), constants.ICD10_CODES);
  assert.equal(constants.treatmentTypeOf({}), "botox");
  assert.equal(constants.treatmentTypeOf({ treatmentType: "filler" }), "filler");
});

test("Präparate keep the Chargennummer, also through the legacy single fields", () => {
  const td = praeparate.withPraeparate({ markers: [] }, [{ name: "Juvéderm", einheit: "ml", amount: "1", charge: " 23A45 " }]);
  assert.equal(td.charge, "23A45");
  assert.equal(td.praeparate[0].charge, "23A45");
  const legacy = praeparate.getPraeparate({ praeparat: "Bocouture", einheit: "SE", amount: "20", charge: "L1" });
  assert.equal(legacy[0].charge, "L1");
  assert.equal(praeparate.emptyPraeparat("ml").charge, "");
});

test("Dermalfiller Aufklärungsbogen is offered and complete", () => {
  const tpl = CONSENT_TEMPLATES.find((t) => t.id === "filler_v1");
  assert.ok(tpl, "filler_v1 registered");
  assert.equal(tpl.retired, undefined);
  assert.equal(tpl.treatmentType, "filler");
  assert.equal(tpl.regionOptions.length, constants.FILLER_REGIONS.length);
  assert.equal(tpl.sections.length, 10);
  assert.ok(tpl.sections.some((s) => s.html.includes("Erblindung")), "vascular risk named");
  assert.ok(tpl.consentText.includes("Hyaluronidase"), "emergency Hyaluronidase covered by the consent");
  assert.ok(tpl.questions.some((q) => q.id === "f1_insekten"));
  const ids = [...tpl.questions, ...tpl.additionalQuestionsWomen].map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, "question ids unique");
  // ids must not collide with other templates
  const otherIds = CONSENT_TEMPLATES.filter((t) => t.id !== "filler_v1").flatMap((t) => [...(t.questions || []), ...(t.additionalQuestionsWomen || [])].map((q) => q.id));
  assert.equal(ids.filter((id) => otherIds.includes(id)).length, 0);
  // Patient-facing text is in the Sie-Form like the Botulinum Bogen, no Du
  const text = tpl.sections.map((s) => s.html).join(" ") + tpl.consentText;
  assert.equal(/\b(Du|Dich|Dir|Dein)\b/.test(text), false);
});
