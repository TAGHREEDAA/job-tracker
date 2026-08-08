import assert from "node:assert/strict";
import test from "node:test";

import { isRelevantRemoteOKJob } from "../src/sources/remoteok.js";

test("RemoteOK intake requires an engineering title and relevant tag", () => {
  assert.equal(
    isRelevantRemoteOKJob({
      position: "Senior Backend Engineer",
      tags: ["PHP", "Laravel"],
      location: "Worldwide",
    }),
    true
  );
  assert.equal(
    isRelevantRemoteOKJob({
      position: "Barista",
      tags: ["dev"],
      location: "Remote",
    }),
    false
  );
  assert.equal(
    isRelevantRemoteOKJob({
      position: "Senior Backend Engineer",
      tags: ["sales"],
      location: "Remote",
    }),
    false
  );
});

test("RemoteOK intake rejects malformed trailing-comma locations", () => {
  assert.equal(
    isRelevantRemoteOKJob({
      position: "PHP Backend Developer",
      tags: ["PHP"],
      location: "Queensland, ",
    }),
    false
  );
});
