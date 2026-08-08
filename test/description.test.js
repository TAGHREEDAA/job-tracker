import assert from "node:assert/strict";
import test from "node:test";

import {
  descriptionFromPayload,
  detectAts,
  enrichJobDescriptions,
} from "../src/enrich/description.js";

const LONG_DESCRIPTION =
  "Build and own a SaaS product with PHP, Laravel, APIs, MySQL, Docker, " +
  "and cross-functional product delivery. ".repeat(4);

test("detects supported public ATS job URLs", () => {
  assert.deepEqual(
    detectAts("https://boards.greenhouse.io/acme/jobs/12345"),
    { type: "greenhouse", slug: "acme", jobId: "12345" }
  );
  assert.deepEqual(
    detectAts("https://jobs.lever.co/acme/abc-123"),
    { type: "lever", slug: "acme", jobId: "abc-123" }
  );
  assert.deepEqual(
    detectAts("https://jobs.ashbyhq.com/acme/uuid-1"),
    { type: "ashby", slug: "acme", jobId: "uuid-1" }
  );
  assert.deepEqual(
    detectAts("https://acme.recruitee.com/o/backend-engineer"),
    { type: "recruitee", slug: "acme", jobId: "backend-engineer" }
  );
});

test("extracts and cleans descriptions from ATS payloads", () => {
  const description = descriptionFromPayload(
    { type: "greenhouse", slug: "acme", jobId: "123" },
    { content: `<p>${LONG_DESCRIPTION}</p>` }
  );
  assert.match(description, /Laravel/);
  assert.doesNotMatch(description, /<p>/);
});

test("enriches limited descriptions and caches duplicate URLs", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({ content: LONG_DESCRIPTION }),
      headers: { get: () => "application/json" },
    };
  };
  const jobs = [1, 2].map((id) => ({
    id,
    title: "Senior Laravel Engineer",
    company: "Acme",
    source: "Product Jobs Anywhere",
    url: "https://boards.greenhouse.io/acme/jobs/123",
    description: "Limited",
  }));

  await enrichJobDescriptions(jobs, { fetchImpl, requestsPerSecond: 10 });
  assert.equal(calls, 1);
  assert.ok(jobs.every((job) => job.description.length >= 160));
});

test("does not fetch local or non-HTTPS fallback URLs", async () => {
  let calls = 0;
  const jobs = [{
    title: "Backend Engineer",
    company: "Acme",
    source: "Test",
    url: "http://localhost/internal",
    description: "",
  }];
  await enrichJobDescriptions(jobs, {
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not be called");
    },
    requestsPerSecond: 10,
  });
  assert.equal(calls, 0);
});

test("follows a bounded HTTPS redirect to an ATS response", async () => {
  const requested = [];
  const jobs = [{
    title: "Laravel Engineer",
    company: "Acme",
    source: "Test",
    url: "https://boards.greenhouse.io/acme/jobs/123",
    description: "",
  }];
  await enrichJobDescriptions(jobs, {
    fetchImpl: async (url) => {
      requested.push(url.toString());
      if (requested.length === 1) {
        return {
          ok: false,
          status: 302,
          headers: { get: (name) => name === "location" ? "/canonical" : "" },
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: LONG_DESCRIPTION }),
        headers: { get: () => "application/json" },
      };
    },
    requestsPerSecond: 10,
  });
  assert.equal(requested.length, 2);
  assert.ok(jobs[0].description.length >= 160);
});

test("caches one shared job-board payload for different Ashby jobs", async () => {
  let calls = 0;
  const jobs = ["job-1", "job-2"].map((jobId) => ({
    title: `Laravel Engineer ${jobId}`,
    company: "Acme",
    source: "Test",
    url: `https://jobs.ashbyhq.com/acme/${jobId}`,
    description: "",
  }));
  await enrichJobDescriptions(jobs, {
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jobs: jobs.map((job, index) => ({
            id: `job-${index + 1}`,
            title: job.title,
            descriptionHtml: LONG_DESCRIPTION,
          })),
        }),
        headers: { get: () => "application/json" },
      };
    },
    requestsPerSecond: 10,
  });
  assert.equal(calls, 1);
  assert.ok(jobs.every((job) => job.description.length >= 160));
});
