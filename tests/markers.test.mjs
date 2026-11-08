import { register } from "node:module";
register("./_resolve-hooks.mjs", import.meta.url);
import test from "node:test";
import assert from "node:assert/strict";

const { isGuide, treatmentPoints, orderMarkers, addMarker } = await import("../src/utils/markers.js");
const { praeparatTotals, withPraeparate } = await import("../src/utils/praeparate.js");

const p1 = { x: 10, y: 10, amount: "4" };
const p2 = { x: 20, y: 20, amount: "2", p: 1 };
const g = { kind: "guide", x: 30, y: 30, to: [{ x: 40, y: 32 }, { x: 50, y: 35 }] };

test("guides are recognised and never count as points", () => {
  assert.equal(isGuide(g), true);
  assert.equal(isGuide(p1), false);
  assert.deepEqual(treatmentPoints([p1, g, p2]), [p1, p2]);
});

test("points stay before guides so running numbers never skip", () => {
  assert.deepEqual(orderMarkers([g, p1, p2]), [p1, p2, g]);
  assert.deepEqual(addMarker([p1, g], p2), [p1, p2, g]);
  const g2 = { ...g, x: 60 };
  assert.deepEqual(addMarker([p1, g], g2), [p1, g, g2]);
  assert.deepEqual(addMarker(undefined, p1), [p1]);
});

test("Präparat totals and the legacy amount ignore guides", () => {
  const td = { markers: [p1, p2, g], praeparate: [{ name: "Bocouture", einheit: "SE" }, { name: "Relfydess", einheit: "SE" }] };
  const totals = praeparatTotals(td);
  assert.deepEqual(totals.map((t) => [t.count, t.units]), [[1, 4], [1, 2]]);
  // Only a guide on the chart: the typed amount is kept, not replaced by "0"
  const onlyGuide = withPraeparate({ markers: [g] }, [{ name: "Bocouture", einheit: "SE", amount: "20" }]);
  assert.equal(onlyGuide.amount, "20");
});
