// laravel.io community job board.
// Simple HTML structure.

import fetch from "node-fetch";
import { load } from "cheerio";

export async function fetchLaravelIO() {
  try {
    const res = await fetch("https://laravel.io/jobs", {
      headers: { "User-Agent": "Mozilla/5.0 (job-tracker-personal/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = load(html);
    const jobs = [];

    // laravel.io typically has job listings under links to /jobs/{slug}
    $("a[href*='/jobs/']").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      if (!href || href === "/jobs" || href === "/jobs/") return;
      const fullUrl = href.startsWith("http")
        ? href
        : `https://laravel.io${href}`;

      const text = $el.text().replace(/\s+/g, " ").trim();
      if (!text || text.length < 5) return;

      const slug = href.split("/").pop();
      const id = `laravelio-${slug}`;

      // Try to parse structure
      const title = $el.find("h2, h3, h4, .title").first().text().trim() || text.split("\n")[0].trim();
      const company = $el.find(".company, [class*='company']").first().text().trim();
      const location = $el.find(".location, [class*='location']").first().text().trim();

      if (!title || title.length > 200) return;

      jobs.push({
        id,
        title,
        company,
        location: location || "Not specified",
        url: fullUrl,
        salary: "",
        tags: "",
        datePosted: new Date().toISOString().slice(0, 10),
        source: "Laravel.io",
        description: text.slice(0, 500),
      });
    });

    const seen = new Set();
    return jobs.filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      return true;
    });
  } catch (err) {
    console.error("[Laravel.io] fetch failed:", err.message);
    return [];
  }
}
