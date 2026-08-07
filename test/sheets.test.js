import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_HEADER,
  ARCHIVE_HEADER,
  columnsForHeader,
  isResetDue,
  jobToRow,
  legacyRowToActive,
  sortRowsNewestFirst,
  withinRetention,
} from "../src/sheets.js";

test("schema reads only the columns defined by each header", () => {
  assert.equal(columnsForHeader(ACTIVE_HEADER), "A:T");
  assert.equal(columnsForHeader(ARCHIVE_HEADER), "A:U");
});

test("two-month archive cadence handles month-end dates", () => {
  assert.equal(
    isResetDue(
      "2026-01-31",
      new Date("2026-03-30T00:00:00Z"),
      2
    ),
    false
  );
  assert.equal(
    isResetDue(
      "2026-01-31",
      new Date("2026-03-31T00:00:00Z"),
      2
    ),
    true
  );
});

test("job rows match the recommendation schema", () => {
  const row = jobToRow(
    {
      recommendation: "Apply Today",
      fitScore: 88,
      priority: "⭐ PRIORITY",
      roleCategory: "Laravel/PHP Backend",
      eligibility: "Eligible - EMEA/Africa",
      title: "Senior Laravel Engineer",
      company: "Example",
      location: "EMEA",
      source: "RemoteOK",
      url: "https://example.test/job",
      dedupeKey: "abc123",
    },
    "2026-07-28"
  );
  assert.equal(row.length, ACTIVE_HEADER.length);
  assert.equal(row[0], "2026-07-28");
  assert.equal(row[1], "Apply Today");
  assert.equal(row[18], "");
  assert.equal(row[19], "");
});

test("legacy migration preserves status and notes", () => {
  const migrated = legacyRowToActive([
    "2026-07-01",
    "⭐ PRIORITY",
    "Senior Laravel Engineer",
    "Example",
    "EMEA",
    "",
    "Larajobs",
    "https://example.test/job",
    "Laravel",
    "2026-06-30",
    "Applied",
    "Follow up Friday",
  ]);
  assert.equal(migrated.length, ACTIVE_HEADER.length);
  assert.equal(migrated[6], "Senior Laravel Engineer");
  assert.equal(migrated[18], "Applied");
  assert.equal(migrated[19], "Follow up Friday");
});

test("rejected retention keeps recent rows and expires old rows", () => {
  assert.equal(
    withinRetention("2026-07-01", "2026-07-28", 30),
    true
  );
  assert.equal(
    withinRetention("2026-06-01", "2026-07-28", 30),
    false
  );
});

test("compacts blank rows and sorts jobs by posted date descending", () => {
  const older = jobToRow(
    { title: "Older", datePosted: "2026-07-01" },
    "2026-08-08"
  );
  const newer = jobToRow(
    { title: "Newer", datePosted: "2026-08-07" },
    "2026-08-08"
  );
  const missingPostedDate = jobToRow(
    { title: "Found Today" },
    "2026-08-08"
  );

  const sorted = sortRowsNewestFirst([
    older,
    [],
    ["", "", ""],
    newer,
    missingPostedDate,
  ]);

  assert.deepEqual(
    sorted.map((row) => row[6]),
    ["Found Today", "Newer", "Older"]
  );
});
