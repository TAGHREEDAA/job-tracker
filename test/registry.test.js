import assert from "node:assert/strict";
import test from "node:test";

import { createDedupeKey } from "../src/filter.js";
import {
  applyPrivateRegistry,
  loadPrivateRegistry,
  parsePrivateRegistry,
} from "../src/registry.js";

const NOW = new Date("2026-08-08T12:00:00Z");

function job(overrides = {}) {
  return {
    title: "Senior Laravel Engineer",
    company: "Example",
    url: "https://jobs.example.test/1",
    ...overrides,
  };
}

test("suppresses an already-applied exact role", () => {
  const target = job();
  const registry = parsePrivateRegistry([
    [
      target.company,
      target.title,
      target.url,
      createDedupeKey(target),
      "Applied",
      "2026-08-01",
      "",
      "2026-08-01",
    ],
  ], [], NOW);
  const result = applyPrivateRegistry([target], registry, NOW);
  assert.equal(result.jobs.length, 0);
  assert.equal(result.skipped, 1);
});

test("suppresses a different role at a previously applied company", () => {
  const registry = parsePrivateRegistry([
    ["Example", "Product Engineer", "https://x.test/old", "old", "Applied"],
  ], [], NOW);
  const result = applyPrivateRegistry([job()], registry, NOW);
  assert.equal(result.jobs.length, 0);
  assert.equal(result.skipped, 1);
});

test("matches an applied company when the registry includes a parenthetical alias", () => {
  const registry = parsePrivateRegistry([
    [
      "Al Watania Information Systems (Wisys)",
      "Senior Full Stack Developer",
      "https://x.test/old",
      "old",
      "Applied",
    ],
  ], [], NOW);
  const result = applyPrivateRegistry([
    job({ company: "Al-Watania Information Systems" }),
  ], registry, NOW);
  assert.equal(result.jobs.length, 0);
  assert.equal(result.skipped, 1);
});

test("does not suppress a different role for an expired exact rejection", () => {
  const registry = parsePrivateRegistry([
    ["Example", "Old Role", "https://x.test/old", "old", "Rejected", "2025-01-01"],
  ], [], NOW);
  assert.equal(applyPrivateRegistry([job()], registry, NOW).jobs.length, 1);
});

test("enforces and expires a six-month rejection cooldown", () => {
  const target = job();
  const key = createDedupeKey(target);
  const active = parsePrivateRegistry([
    [target.company, target.title, "", key, "Rejected", "2026-03-01"],
  ], [], NOW);
  const expired = parsePrivateRegistry([
    [target.company, target.title, "", key, "Rejected", "2025-12-01"],
  ], [], NOW);
  assert.equal(applyPrivateRegistry([target], active, NOW).jobs.length, 0);
  assert.equal(applyPrivateRegistry([target], expired, NOW).jobs.length, 1);
});

test("suppresses only active private company exclusions", () => {
  const registry = parsePrivateRegistry([], [
    ["Example", "Yes", ""],
    ["Inactive", "No", ""],
    ["Expired", "Yes", "2026-01-01"],
  ], NOW);
  const result = applyPrivateRegistry([
    job(),
    job({ company: "Inactive", url: "https://x.test/2" }),
    job({ company: "Expired", url: "https://x.test/3" }),
  ], registry, NOW);
  assert.deepEqual(result.jobs.map((item) => item.company), ["Inactive", "Expired"]);
});

test("ignores the privacy-safe template rows", () => {
  const registry = parsePrivateRegistry(
    [["Example Company", "Example Role", "https://example.invalid/job", "template-row", "Applied"]],
    [["Example Company — replace or delete this row", "No", ""]],
    NOW
  );
  assert.equal(applyPrivateRegistry([job()], registry, NOW).jobs.length, 1);
});

test("fails closed when the private registry is required but missing", async () => {
  await assert.rejects(
    loadPrivateRegistry("", { required: true }),
    /PRIVATE_REGISTRY_SHEET_ID/
  );
});
