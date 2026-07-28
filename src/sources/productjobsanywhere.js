// Product Jobs Anywhere lists remote roles at product-led companies.
// The Product Engineer page includes backend, Laravel, full-stack, and
// product-engineering roles. The shared filter decides which titles and
// remote locations are relevant.

import { createHash } from "node:crypto";
import fetch from "node-fetch";
import { load } from "cheerio";

const JOBS_URL =
  "https://productjobsanywhere.com/jobs/product-engineers/";

function cleanText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function canonicalJobUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value, JOBS_URL);
    url.searchParams.delete("utm_source");
    return url.toString();
  } catch {
    return value;
  }
}

function relativeDateToISO(value, now = new Date()) {
  const text = cleanText(value).toLowerCase();
  if (!text) return "";

  const posted = new Date(now);
  posted.setUTCHours(0, 0, 0, 0);

  if (text === "today") return posted.toISOString().slice(0, 10);
  if (text === "yesterday") {
    posted.setUTCDate(posted.getUTCDate() - 1);
    return posted.toISOString().slice(0, 10);
  }

  const match = text.match(
    /^(\d+|an?|one)\s+(day|week|month|year)s?\s+ago$/
  );
  if (!match) return "";

  const amount = /^\d+$/.test(match[1]) ? Number(match[1]) : 1;
  const daysPerUnit = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };
  posted.setUTCDate(
    posted.getUTCDate() - amount * daysPerUnit[match[2]]
  );
  return posted.toISOString().slice(0, 10);
}

function makeId({ company, title, url }) {
  const fingerprint = `${company}\n${title}\n${url}`;
  const hash = createHash("sha256")
    .update(fingerprint)
    .digest("hex")
    .slice(0, 16);
  return `pja-${hash}`;
}

export async function fetchProductJobsAnywhere() {
  try {
    const res = await fetch(JOBS_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; job-tracker-personal/1.0)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = load(html);
    const jobs = [];

    $('a[data-fast-goal="click_job_card"]').each((_, linkEl) => {
      const $link = $(linkEl);
      const $card = $link.parent();

      const title = cleanText(
        $link.attr("data-fast-goal-job-title") ||
          $card.find("h3").first().text()
      );
      const company = cleanText(
        $link.attr("data-fast-goal-company") ||
          $card.find('a[href^="/companies/"] span').first().text()
      );
      const url = canonicalJobUrl($link.attr("href"));
      if (!title || !url) return;

      const location =
        cleanText($card.find("div.flex.text-base").first().text()) ||
        "Remote";
      const relativeDate = cleanText(
        $card.find("span.text-sm.text-gray-400").first().text()
      );

      jobs.push({
        id: makeId({ company, title, url }),
        title,
        company,
        location,
        url,
        salary: "",
        tags: "Product Engineering",
        datePosted: relativeDateToISO(relativeDate),
        source: "Product Jobs Anywhere",
        description: `Remote product-team role · ${location}`,
      });
    });

    const seen = new Set();
    return jobs.filter((job) => {
      if (seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });
  } catch (err) {
    console.error(
      "[Product Jobs Anywhere] fetch failed:",
      err.message
    );
    return [];
  }
}
