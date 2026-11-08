import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceGesamt } from "../src/utils/invoiceTotals.js";

const items = [{ betrag: 100 }];
test("19% USt applies to aesthetic treatments whatever the patient's country", () => {
  assert.equal(invoiceGesamt({ lineItems: items, patient: { country: "Schweiz" }, invoiceMeta: {} }), 119);
  assert.equal(invoiceGesamt({ lineItems: items, patient: { country: "Deutschland" }, invoiceMeta: {} }), 119);
});
test("no USt for Kleinunternehmer and for medically indicated treatments", () => {
  assert.equal(invoiceGesamt({ lineItems: items, patient: { country: "Schweiz" }, invoiceMeta: {}, _kleinunternehmer: true }), 100);
  assert.equal(invoiceGesamt({ lineItems: items, patient: { country: "Deutschland" }, invoiceMeta: { diagnose: "L70.0" } }), 100);
});
