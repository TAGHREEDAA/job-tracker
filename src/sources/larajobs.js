// larajobs.com — scrapes the listing page HTML.
// Page is simple and stable.

import fetch from "node-fetch";
import { load } from "cheerio";

export async function fetchLarajobs() {
  try {
    const res = await fetch("https://larajobs.com/", {
      headers: { "User-Agent": "Mozilla/5.0 (job-tracker-personal/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = load(html);
    const jobs = [];

    // larajobs uses <a> wrappers around each job card. Selector may need tuning
    // if their HTML changes. We look for links that go to /jobs/...
    $("a[href*='/jobs/']").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      if (!href || !href.includes("/jobs/")) return;
      const fullUrl = href.startsWith("http")
        ? href
        : `https://larajobs.com${href}`;

      // Extract text content
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (!text || text.length < 10) return;

      // Try to extract title (usually first prominent text)
      const title = $el.find("h2, h3, .title, [class*='title']").first().text().trim() || text.split("•")[0].trim();
      const company = $el.find(".company, [class*='company']").first().text().trim() || "";
      const location = $el.find(".location, [class*='location']").first().text().trim() || "";

      // Build a stable id from URL
      const idMatch = href.match(/\/jobs\/(\d+)/);
      const id = idMatch ? `larajobs-${idMatch[1]}` : `larajobs-${href.split("/").pop()}`;

      if (!title) return;

      jobs.push({
        id,
        title,
        company,
        location: location || "Not specified",
        url: fullUrl,
        salary: "",
        tags: "",
        datePosted: new Date().toISOString().slice(0, 10),
        source: "Larajobs",
        description: text.slice(0, 500),
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
