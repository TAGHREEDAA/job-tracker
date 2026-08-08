import assert from "node:assert/strict";
import test from "node:test";

import { buildAuth } from "../src/sheets.js";

test("builds Google authentication with the current options API", () => {
  const previous = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "service-account@example.invalid",
    private_key: "fake-private-key",
  });

  try {
    const auth = buildAuth();
    assert.equal(auth.email, "service-account@example.invalid");
    assert.equal(auth.key, "fake-private-key");
    assert.deepEqual(auth.scopes, [
      "https://www.googleapis.com/auth/spreadsheets",
    ]);
  } finally {
    if (previous === undefined) {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    } else {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = previous;
    }
  }
});
