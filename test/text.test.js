import assert from "node:assert/strict";
import test from "node:test";

import { repairMojibake } from "../src/text.js";

test("repairs UTF-8 text that was decoded as Latin-1", () => {
  assert.equal(repairMojibake("Remote Â· Africa"), "Remote · Africa");
  assert.equal(repairMojibake("ð\u009f\u008c\u008d Worldwide"), "🌍 Worldwide");
});

test("preserves already-correct Unicode text", () => {
  assert.equal(repairMojibake("São Paulo · Remote"), "São Paulo · Remote");
});
