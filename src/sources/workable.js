// Workable documents its public search filters at jobs.md; the site exposes
// the same search results as structured JSON through this read-only endpoint.

import fetch from "node-fetch";
import { load } from "cheerio";

import { CONFIG } from "../config.js";

const JOBS_ENDPOINT = "https://jobs.workable.com/api/v1/jobs";

function htmlToText(value) {
  if (!value) return "";
  return load(`<body>${value}</body>`)("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();
}

function jobLocation(job) {
  const locations = (job.locations || [])
    .filter((value) => value && value !== "TELECOMMUTE");
  const remote = job.workplace === "remote" ||
    (job.locations || []).includes("TELECOMMUTE");

  return [remote ? "Remote" : "", ...locations]
    .filter(Boolean)
    .join(" · ") || "Not specified";
}

export function normalizeWorkableJob(job) {
  const description = [
    job.description,
    job.requirementsSection,
    job.benefitsSection,
  ]
    .map(htmlToText)
    .filter(Boolean)
    .join(" ")
    .slice(0, 8_000);

  return {
    id: `workable-${job.id}`,
    title: job.title || "",
    company: job.company?.title || "",
    location: jobLocation(job),
    url: job.url || `https://jobs.workable.com/view/${job.id}`,
    salary: "",
    tags: [job.department, job.employmentType, job.workplace]
      .filter(Boolean)
      .join(", "),
    datePosted: job.created
      ? new Date(job.created).toISOString().slice(0, 10)
      : "",
    source: "Workable",
    description,
  };
}

async function searchWorkable(query, location) {
  const url = new URL(JOBS_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("workplace", "remote");
  url.searchParams.set("day_range", String(CONFIG.maxAgeDays));
  if (location) url.searchParams.set("location", location);

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "job-tracker-personal/1.0",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${query}/${location || "global"}`);
  const data = await res.json();
  return data.jobs || [];
}

export async function fetchWorkable() {
  const settings = CONFIG.sources.workable;
  const searches = settings.queries.flatMap((query) =>
    settings.locations.map((location) => ({ query, location }))
  );
  const results = await Promise.allSettled(
    searches.map(({ query, location }) => searchWorkable(query, location))
  );

  const jobs = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === "fulfilled") {
      jobs.push(...result.value);
      continue;
    }
    const { query, location } = searches[index];
    console.error(
      `[Workable ${query}/${location || "global"}] fetch failed:`,
      result.reason?.message || result.reason
    );
  }

  const seen = new Set();
  return jobs
    .filter((job) => {
      if (!job.id || seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    })
    .map(normalizeWorkableJob);
}
