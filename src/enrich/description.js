import { isIP } from "node:net";

import fetch from "node-fetch";
import { load } from "cheerio";

const DESCRIPTION_LIMIT = 8_000;
const MIN_DESCRIPTION_LENGTH = 160;
const REQUESTS_PER_SECOND = 5;
const REQUEST_TIMEOUT_MS = 10_000;

function cleanText(value) {
  if (!value) return "";
  return load(`<body>${value}</body>`)("body")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DESCRIPTION_LIMIT);
}

function flattenText(value) {
  if (value === null || value === undefined) return [];
  if (["string", "number"].includes(typeof value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  if (typeof value === "object") {
    return Object.values(value).flatMap(flattenText);
  }
  return [];
}

function pathParts(url) {
  return url.pathname.split("/").filter(Boolean);
}

export function detectAts(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const parts = pathParts(url);

    if (/^(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io$/.test(host)) {
      const jobsIndex = parts.indexOf("jobs");
      if (jobsIndex > 0 && parts[jobsIndex + 1]) {
        return {
          type: "greenhouse",
          slug: parts[0],
          jobId: parts[jobsIndex + 1],
        };
      }
    }
    if (host === "jobs.lever.co" && parts.length >= 2) {
      return { type: "lever", slug: parts[0], jobId: parts[1] };
    }
    if (host === "jobs.ashbyhq.com" && parts.length >= 2) {
      return { type: "ashby", slug: parts[0], jobId: parts[1] };
    }
    if (host === "apply.workable.com" && parts[0]) {
      const jobIndex = parts.findIndex((part) => part.toLowerCase() === "j");
      return {
        type: "workable",
        slug: parts[0],
        jobId: jobIndex >= 0 ? parts[jobIndex + 1] || "" : parts.at(-1),
      };
    }
    if (host.endsWith(".recruitee.com") && parts[0] === "o" && parts[1]) {
      return {
        type: "recruitee",
        slug: host.slice(0, -".recruitee.com".length),
        jobId: parts[1],
      };
    }
    if (host === "jobs.smartrecruiters.com" && parts.length >= 2) {
      return {
        type: "smartrecruiters",
        slug: parts[0],
        jobId: parts[1].split("-")[0],
      };
    }
  } catch {
    return null;
  }
  return null;
}

function endpointFor(ats) {
  const slug = encodeURIComponent(ats.slug);
  const jobId = encodeURIComponent(ats.jobId);
  switch (ats.type) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`;
    case "lever":
      return `https://api.lever.co/v0/postings/${slug}/${jobId}`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
    case "workable":
      return `https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`;
    case "recruitee":
      return `https://${slug}.recruitee.com/api/offers/`;
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${slug}/postings/${jobId}`;
    default:
      return "";
  }
}

function sameJob(candidate, ats, job) {
  const identifiers = [
    candidate?.id,
    candidate?.shortcode,
    candidate?.slug,
    candidate?.jobId,
    candidate?.uuid,
  ].filter(Boolean).map(String);
  if (identifiers.includes(String(ats.jobId))) return true;

  const urls = [
    candidate?.url,
    candidate?.jobUrl,
    candidate?.applyUrl,
    candidate?.careers_url,
  ].filter(Boolean);
  if (urls.some((url) => url.includes(ats.jobId))) return true;

  return candidate?.title && job.title &&
    candidate.title.trim().toLowerCase() === job.title.trim().toLowerCase();
}

export function descriptionFromPayload(ats, payload, job = {}) {
  let candidate = payload;
  if (ats.type === "ashby") {
    candidate = (payload?.jobs || []).find((item) => sameJob(item, ats, job));
  } else if (ats.type === "workable") {
    candidate = (payload?.jobs || payload?.results || []).find(
      (item) => sameJob(item, ats, job)
    );
  } else if (ats.type === "recruitee") {
    candidate = (payload?.offers || []).find((item) => sameJob(item, ats, job));
  }
  if (!candidate) return "";

  const fields = [
    candidate.content,
    candidate.description,
    candidate.descriptionHtml,
    candidate.jobDescription,
    candidate.requirements,
    candidate.requirementsSection,
    candidate.benefits,
    candidate.benefitsSection,
    candidate.lists,
    candidate.jobAd?.sections,
    candidate?.sections?.description,
    candidate?.sections?.requirements,
    candidate?.sections?.additional,
  ];
  return cleanText(fields.flatMap(flattenText).join(" "));
}

function safePublicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      isIP(host)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function descriptionFromHtml(html) {
  const $ = load(html);
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    try {
      const parsed = JSON.parse($(element).text());
      const topLevel = Array.isArray(parsed) ? parsed : [parsed];
      const entries = topLevel.flatMap((entry) =>
        Array.isArray(entry?.["@graph"])
          ? [entry, ...entry["@graph"]]
          : [entry]
      );
      const posting = entries.find((entry) => entry?.["@type"] === "JobPosting");
      const description = cleanText(posting?.description);
      if (description.length >= MIN_DESCRIPTION_LENGTH) return description;
    } catch {
      // Ignore unrelated or malformed structured data.
    }
  }

  const selectors = [
    '[itemprop="description"]',
    '[data-testid*="description"]',
    ".job-description",
    "main article",
    "article",
    "main",
  ];
  for (const selector of selectors) {
    const description = cleanText($(selector).first().html());
    if (description.length >= MIN_DESCRIPTION_LENGTH) return description;
  }
  return "";
}

async function fetchResponse(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let currentUrl = safePublicUrl(url);
    if (!currentUrl) throw new Error("Unsafe or unsupported URL");

    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetchImpl(currentUrl, {
        headers: {
          Accept: "application/json, text/html;q=0.8",
          "User-Agent": "job-tracker-personal/1.0",
        },
        redirect: "manual",
        signal: controller.signal,
        size: 5_000_000,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.get?.("location");
        const nextUrl = location
          ? safePublicUrl(new URL(location, currentUrl).toString())
          : null;
        if (!nextUrl) throw new Error("Unsafe or missing redirect target");
        currentUrl = nextUrl;
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    }
    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDescription(job, fetchImpl, responseCache) {
  const ats = detectAts(job.url);
  if (ats) {
    const endpoint = endpointFor(ats);
    if (!responseCache.has(endpoint)) {
      responseCache.set(
        endpoint,
        fetchResponse(endpoint, fetchImpl).then((response) => response.json())
      );
    }
    const payload = await responseCache.get(endpoint);
    return descriptionFromPayload(ats, payload, job);
  }

  const url = safePublicUrl(job.url);
  if (!url) return "";
  const response = await fetchResponse(url, fetchImpl);
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.includes("html")) return "";
  return descriptionFromHtml(await response.text());
}

function cacheKey(job) {
  try {
    const url = new URL(job.url);
    url.hash = "";
    return url.toString();
  } catch {
    return job.url || `${job.company}\n${job.title}`;
  }
}

export async function enrichJobDescriptions(
  jobs,
  { fetchImpl = fetch, requestsPerSecond = REQUESTS_PER_SECOND } = {}
) {
  const targets = jobs.filter(
    (job) => (job.description || "").trim().length < MIN_DESCRIPTION_LENGTH
  );
  const cache = new Map();
  const responseCache = new Map();
  let enrichedCount = 0;
  const intervalMs = Math.ceil(1_000 / Math.max(1, requestsPerSecond));
  let nextRequestAt = Date.now();

  async function scheduledDescription(job) {
    const scheduledAt = nextRequestAt;
    nextRequestAt = Math.max(Date.now(), nextRequestAt) + intervalMs;
    const delay = scheduledAt - Date.now();
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return fetchDescription(job, fetchImpl, responseCache);
  }

  await Promise.all(targets.map(async (job) => {
      const key = cacheKey(job);
      if (!cache.has(key)) {
        cache.set(
          key,
          scheduledDescription(job).catch((error) => {
            console.warn(`[Description ${job.source}] ${error.message}`);
            return "";
          })
        );
      }
      const description = await cache.get(key);
      if (description.length >= MIN_DESCRIPTION_LENGTH) {
        job.description = description;
        enrichedCount += 1;
      }
  }));

  console.log(
    `Description enrichment: ${enrichedCount}/${targets.length} limited listings enriched`
  );
  return jobs;
}
