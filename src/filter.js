// Filtering logic for job listings.

import { CONFIG } from "./config.js";

function lowercase(s) {
  return (s || "").toLowerCase();
}

export function matchesTitle(job) {
  const title = lowercase(job.title);
  if (!title) return false;

  // Must contain at least one positive keyword
  const positive = CONFIG.titleKeywords.some((kw) =>
    title.includes(kw.toLowerCase())
  );
  if (!positive) return false;

  // Must NOT contain any exclude keyword
  const negative = CONFIG.excludeTitleKeywords.some((kw) =>
    title.includes(kw.toLowerCase())
  );
  if (negative) return false;

  return true;
}

export function matchesLocation(job) {
  const loc = lowercase(job.location);
  // No location info → keep, let user decide
  if (!loc || loc === "not specified") return true;

  // Hard reject US-only style locations
  for (const pat of CONFIG.hardRejectLocationPatterns) {
    if (pat.test(job.location)) return false;
  }

  // Must match at least one remote-friendly pattern
  for (const pat of CONFIG.remoteFriendlyPatterns) {
    if (pat.test(job.location)) return true;
  }

  // Default: reject if location is specific but doesn't say remote
  return false;
}

export function priorityTag(job) {
  const haystack = `${job.location} ${job.title} ${job.description}`.toLowerCase();
  for (const pat of CONFIG.priorityLocationPatterns) {
    if (pat.test(haystack)) return "⭐ PRIORITY";
  }
  return "";
}

export function isRecent(job) {
  if (!job.datePosted) return true; // unknown date, keep
  const posted = new Date(job.datePosted);
  if (isNaN(posted)) return true;
  const ageDays = (Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays <= CONFIG.maxAgeDays;
}

export function filterJobs(jobs) {
  return jobs
    .filter((j) => matchesTitle(j))
    .filter((j) => matchesLocation(j))
    .filter((j) => isRecent(j))
    .map((j) => ({ ...j, priority: priorityTag(j) }));
}
