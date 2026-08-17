import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_HEADER,
  ARCHIVE_HEADER,
  columnsForHeader,
  isAppliedStatus,
  isResetDue,
  jobToRow,
  legacyRowToActive,
  planAppliedMove,
  partitionRowsByRejectedJobs,
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

test("consolidates an applied job and removes every view copy", () => {
  const backend = jobToRow(
    {
      title: "Senior Laravel Engineer",
      company: "Example",
      url: "https://example.test/job",
      dedupeKey: "example-job",
    },
    "2026-08-08"
  );
  const today = [...backend];
  today[18] = "Applied";
  today[19] = "Follow up next week";

  const plan = planAppliedMove({
    "Backend Jobs": [backend],
    Today: [today],
    "Product Jobs": [],
  });

  assert.equal(plan.movedCount, 1);
  assert.equal(plan.appliedRows.length, 1);
  assert.equal(plan.appliedRows[0][18], "Applied");
  assert.equal(plan.appliedRows[0][19], "Follow up next week");
  assert.equal(plan.remainingBySheet["Backend Jobs"].length, 0);
  assert.equal(plan.remainingBySheet.Today.length, 0);
});

test("does not duplicate a job already stored in Applied Jobs", () => {
  const stored = jobToRow(
    {
      title: "Product Engineer",
      company: "Example",
      url: "https://example.test/product",
      dedupeKey: "example-product",
    },
    "2026-08-01"
  );
  stored[18] = "Interview";
  const source = [...stored];
  source[18] = "Applied";

  const plan = planAppliedMove({ Today: [source] }, [stored]);

  assert.equal(plan.appliedRows.length, 1);
  assert.equal(plan.appliedRows[0][18], "Interview");
  assert.equal(plan.remainingBySheet.Today.length, 0);
});

test("compacts duplicate rows already stored in Applied Jobs", () => {
  const stored = jobToRow(
    {
      title: "Backend Engineer",
      company: "Example",
      url: "https://example.test/backend",
      dedupeKey: "example-backend",
    },
    "2026-08-01"
  );
  stored[18] = "Applied";
  const duplicate = [...stored];
  duplicate[19] = "Keep this note";

  const plan = planAppliedMove({}, [stored, duplicate]);

  assert.equal(plan.appliedRows.length, 1);
  assert.equal(plan.appliedRows[0][19], "Keep this note");
  assert.equal(plan.movedCount, 0);
});

test("leaves unrelated jobs in their original views", () => {
  const untouched = jobToRow(
    {
      title: "Full Stack Engineer",
      company: "Example",
      url: "https://example.test/full-stack",
      dedupeKey: "example-full-stack",
    },
    "2026-08-08"
  );

  const plan = planAppliedMove({ "Product Jobs": [untouched] });

  assert.equal(plan.movedCount, 0);
  assert.deepEqual(plan.remainingBySheet["Product Jobs"], [untouched]);
});

test("moves only an exact Applied status", () => {
  assert.equal(isAppliedStatus(" applied "), true);
  assert.equal(isAppliedStatus("Interview"), false);
  assert.equal(isAppliedStatus("Rejected"), false);
});

test("reconciles newly rejected jobs out of active rows", () => {
  const rejected = jobToRow(
    {
      title: "Fullstack Engineer",
      company: "Lago",
      url: "https://jobs.workable.com/view/lago-role",
      dedupeKey: "lago-role",
    },
    "2026-08-11"
  );
  rejected[18] = "Reviewing";
  const kept = jobToRow(
    {
      title: "Backend Engineer",
      company: "Example",
      url: "https://example.test/backend",
      dedupeKey: "example-backend",
    },
    "2026-08-12"
  );

  const result = partitionRowsByRejectedJobs([rejected, kept], [
    {
      url: "https://jobs.workable.com/view/lago-role",
      dedupeKey: "lago-role",
    },
  ]);

  assert.deepEqual(result.remaining, [kept]);
  assert.deepEqual(result.removed, [rejected]);
});
