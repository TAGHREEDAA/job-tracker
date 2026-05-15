// larajobs.com scraper.
// Scrapes active jobs from the homepage, excluding the "Older Jobs" section.

import fetch from "node-fetch";
import { load } from "cheerio";

function parseRelativeDate(rel) {
  if (!rel) return "";
  const trimmed = rel.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*(h|d|w|mo|mos|y)$/);
  if (!match) return "";
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();
  const ms = {
    h: n * 60 * 60 * 1000,
    d: n * 24 * 60 * 60 * 1000,
    w: n * 7 * 24 * 60 * 60 * 1000,
    mo: n * 30 * 24 * 60 * 60 * 1000,
    mos: n * 30 * 24 * 60 * 60 * 1000,
    y: n * 365 * 24 * 60 * 60 * 1000,
  }[unit];
  if (ms === undefined) return "";
  const posted = new Date(now.getTime() - ms);
  return posted.toISOString().slice(0, 10);
}

// Get only the direct text of an element, not nested children's text.
function directText($, el) {
  return $(el)
    .contents()
    .filter(function () {
      return this.type === "text";
    })
    .text()
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchLarajobs() {
  try {
    const res = await fetch("https://larajobs.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; job-tracker-personal/1.0)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = load(html);
    const jobs = [];

    // Find the "Older Jobs" heading; we'll stop processing jobs after it.
    const olderJobsHeading = $("h2")
      .filter((_, el) => /older jobs/i.test($(el).text()))
      .first();
    const allEls = $("*").toArray();
    const headingPos = olderJobsHeading.length
      ? allEls.indexOf(olderJobsHeading.get(0))
      : -1;

    $("a.job-link").each((_, el) => {
      // Skip jobs in the "Older Jobs" section
      if (headingPos !== -1) {
        const thisPos = allEls.indexOf(el);
        if (thisPos > headingPos) return;
      }

      const $el = $(el);
      const href = $el.attr("href");
      if (!href || !href.startsWith("/job/")) return;
      const idMatch = href.match(/\/job\/(\d+)/);
      if (!idMatch) return;
      const id = `larajobs-${idMatch[1]}`;
      const fullUrl = `https://larajobs.com${href}`;

      // Company name: first <p class="text-sm text-gray-500 truncate">
      const truncatePs = $el.find("p.text-sm.text-gray-500.truncate");
      const company = truncatePs.eq(0).text().trim();

      // Title: <p class="text-lg font-bold ...">
      const title = $el.find("p.text-lg.font-bold").first().text().trim();
      if (!title) return;

      // Job type + salary: the second truncate <p> (index 1)
      const typeSalaryText = truncatePs
        .eq(1)
        .text()
        .replace(/\s+/g, " ")
        .trim();
      let salary = "";
      let jobType = typeSalaryText;
      const dashSplit = typeSalaryText.split(/\s+-\s+/);
      if (dashSplit.length >= 2) {
        jobType = dashSplit[0].trim();
        salary = dashSplit.slice(1).join(" - ").trim();
      }

      // Location: find the innermost div containing a globe SVG (viewBox 0 0 20 20).
      // We want the direct text only, not nested text.
      let location = "";
      $el.find("div.flex.items-center").each((_, divEl) => {
        const $div = $(divEl);
        const hasGlobe =
          $div.children("svg").filter((_, s) => $(s).attr("viewBox") === "0 0 20 20")
            .length > 0;
        if (hasGlobe && !location) {
          location = directText($, divEl);
        }
      });
      if (!location) location = "Not specified";

      // Posted date: similar, with calendar SVG (viewBox 0 0 24 24)
      let datePostedRel = "";
      $el.find("div.flex.items-center").each((_, divEl) => {
        const $div = $(divEl);
        const hasCal =
          $div.children("svg").filter((_, s) => $(s).attr("viewBox") === "0 0 24 24")
            .length > 0;
        if (hasCal && !datePostedRel) {
          datePostedRel = directText($, divEl);
        }
      });
      const datePosted = parseRelativeDate(datePostedRel);

      // Tags
      const tags = [];
      $el.find("div.tag").each((_, tagEl) => {
        const t = $(tagEl).text().trim();
        if (t) tags.push(t);
      });

      jobs.push({
        id,
        title,
        company: company || "",
        location,
        url: fullUrl,
        salary,
        tags: tags.join(", "),
        datePosted,
        source: "Larajobs",
        description: `${jobType}${salary ? " · " + salary : ""}${tags.length ? " · " + tags.join(", ") : ""}`.slice(0, 500),
      });
    });

    // Deduplicate by id
    const seen = new Set();
    return jobs.filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      return true;
    });
  } catch (err) {
    console.error("[Larajobs] fetch failed:", err.message);
    return [];
  }
}
