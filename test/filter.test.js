import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeEligibility,
  classifyRole,
  createDedupeKey,
  deduplicateJobs,
  evaluateJob,
  evaluateJobs,
} from "../src/filter.js";

const NOW = new Date("2026-07-28T12:00:00Z");

function job(overrides = {}) {
  return {
    title: "Senior Laravel Engineer",
    company: "Example",
    location: "EMEA",
    description:
      "Build a SaaS product with PHP, Laravel, MySQL, APIs, RabbitMQ, " +
      "DDD, Docker, product ownership, and end-to-end delivery.",
    tags: "",
    salary: "",
    source: "RemoteOK",
    url: "https://example.test/job/1",
    datePosted: "2026-07-27",
    ...overrides,
  };
}

test("classifies target, stretch, and rejected role families", () => {
  assert.equal(
    classifyRole(job()).category,
    "Laravel/PHP Backend"
  );
  assert.equal(
    classifyRole(job({ title: "Senior Product Engineer" })).category,
    "Product Engineer"
  );
  assert.equal(
    classifyRole(job({ title: "Staff Backend Engineer" })).category,
    "Stretch"
  );
  assert.equal(
    classifyRole(job({ title: "Technical Product Manager" })).rejected,
    true
  );
  assert.equal(
    classifyRole(
      job({
        title: "Remote Office Assistant",
        description: "Coordinate work for a PHP agency",
      })
    ).rejected,
    true
  );
  assert.equal(
    classifyRole(job({ title: "Senior AI Engineer" })).rejected,
    true
  );
  assert.equal(
    classifyRole(
      job({
        title: "Senior Fullstack Engineer",
        description: "Build React interfaces and backend APIs with PostgreSQL.",
      })
    ).category,
    "Backend-Focused Full-Stack"
  );
});

test("separates remote work from Egypt hiring eligibility", () => {
  assert.equal(
    analyzeEligibility(job({ location: "Worldwide" })).status,
    "Eligible - Worldwide"
  );
  assert.equal(
    analyzeEligibility(job({ location: "EMEA" })).status,
    "Eligible - EMEA/Africa"
  );
  assert.equal(
    analyzeEligibility(job({ location: "Remote · Kenya" })).status,
    "Eligible - EMEA/Africa"
  );
  assert.equal(
    analyzeEligibility(job({ location: "Europe only" })).manualReview,
    true
  );
  assert.equal(
    analyzeEligibility(job({ location: "Remote / USA only" }))
      .hardReject,
    true
  );
  assert.equal(
    analyzeEligibility(job({ location: "Remote · Toronto, Canada" }))
      .hardReject,
    true
  );
  assert.equal(
    analyzeEligibility(
      job({ location: "Remote · Worldwide · Toronto, Canada" })
    ).status,
    "Eligible - Worldwide"
  );
  assert.equal(
    analyzeEligibility(job({ location: "Remote/Hybrid, London" }))
      .hardReject,
    true
  );
  assert.equal(
    analyzeEligibility(
      job({
        title: "Staff Product Engineer (Mexico City)",
        location: "Remote",
      })
    ).hardReject,
    true
  );
});

test("scores a strong Laravel SaaS role as Apply Today", () => {
  const evaluated = evaluateJob(job(), NOW);
  assert.equal(evaluated.recommendation, "Apply Today");
  assert.ok(evaluated.fitScore >= 80);
  assert.match(evaluated.matchReasons, /laravel/i);
});

test("rejects a primary-stack mismatch", () => {
  const evaluated = evaluateJob(
    job({
      title: "Senior Back-End Engineer (Java)",
      description:
        "Build backend services using Java and Spring Boot for a SaaS product.",
    }),
    NOW
  );
  assert.equal(evaluated.recommendation, "Reject");
  assert.match(evaluated.gaps, /Primary stack mismatch: Java/);
});

test("keeps hands-on staff roles in the stretch lane", () => {
  const evaluated = evaluateJob(
    job({ title: "Staff Product Engineer", location: "Worldwide" }),
    NOW
  );
  assert.equal(evaluated.recommendation, "Stretch");
  assert.equal(evaluated.roleCategory, "Stretch");
});

test("creates stable normalized dedupe keys", () => {
  const first = createDedupeKey(
    job({
      title: "Sr. Back-End Engineer",
      company: "Example, Inc.",
    })
  );
  const second = createDedupeKey(
    job({
      title: "Senior Backend Engineer",
      company: "Example",
    })
  );
  assert.equal(first, second);
});

test("deduplicates cross-source listings and keeps a direct ATS URL", () => {
  const common = {
    title: "Senior Laravel Engineer",
    company: "Example",
    location: "EMEA",
    dedupeKey: createDedupeKey(job()),
  };
  const deduplicated = deduplicateJobs([
    {
      ...common,
      source: "RemoteOK",
      url: "https://remoteok.com/1",
      description: "Long syndicated description ".repeat(20),
    },
    {
      ...common,
      source: "Product Jobs Anywhere",
      url: "https://jobs.ashbyhq.com/example/123",
      description: "Direct role",
    },
  ]);
  assert.equal(deduplicated.length, 1);
  assert.match(deduplicated[0].url, /ashbyhq/);
});

test("returns accepted, stretch, rejected, and duplicate counts", () => {
  const results = evaluateJobs(
    [
      job(),
      job({ url: "https://another-board.test/same-role" }),
      job({ title: "Staff Backend Engineer", url: "https://x.test/2" }),
      job({ title: "Product Manager", url: "https://x.test/3" }),
    ],
    NOW
  );
  assert.equal(results.accepted.length, 1);
  assert.equal(results.stretch.length, 1);
  assert.equal(results.rejected.length, 1);
  assert.equal(results.duplicateCount, 1);
});
