import { test } from "node:test";
import assert from "node:assert/strict";
import { avvCanonicalText, avvDocumentHash, AVV_VERSION, AVV_SECTIONS } from "../src/components/legal/avvText.js";

test("AVV text is complete and its hash is stable", async () => {
  assert.equal(AVV_SECTIONS.length, 14);
  const text = avvCanonicalText();
  assert.ok(text.startsWith(`AVV ${AVV_VERSION}`));
  assert.ok(!text.includes("["), "no placeholders left in the contract text");
  assert.ok(text.includes("§ 203 Abs. 4 Satz 2 Nr. 1 StGB"));
  const h1 = await avvDocumentHash();
  const h2 = await avvDocumentHash();
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
});
