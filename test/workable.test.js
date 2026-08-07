import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkableJob } from "../src/sources/workable.js";

test("normalizes a Workable remote job with its hiring location", () => {
  const job = normalizeWorkableJob({
    id: "123",
    title: "Senior Full Stack Engineer",
    company: { title: "Example" },
    locations: ["TELECOMMUTE", "Nairobi, Kenya"],
    workplace: "remote",
    employmentType: "Full-time",
    department: "Engineering",
    created: "2026-08-07T10:00:00.000Z",
    url: "https://jobs.workable.com/view/123",
    description: "<p>Build APIs with <strong>Laravel</strong>.</p>",
    requirementsSection: "<p>Remote in Kenya.</p>",
  });

  assert.equal(job.id, "workable-123");
  assert.equal(job.location, "Remote · Nairobi, Kenya");
  assert.equal(job.datePosted, "2026-08-07");
  assert.equal(job.source, "Workable");
  assert.match(job.description, /Build APIs with Laravel/);
  assert.match(job.tags, /Full-time/);
});
