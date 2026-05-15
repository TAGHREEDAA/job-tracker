// WeWorkRemotely publishes RSS feeds per category.
// Programming category covers PHP/Laravel/Backend.

import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";

const FEEDS = [
  "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
];

function extractLocation(description) {
  // WWR puts location info in description as "Headquarters: X" and "URL: Y"
  // Plus sometimes "Region:" tag
  const regionMatch = description.match(/Region:\s*([^<\n]+)/i);
  if (regionMatch) return regionMatch[1].trim();
  const headquartersMatch = description.match(/Headquarters:\s*([^<\n]+)/i);
  if (headquartersMatch) return `HQ: ${headquartersMatch[1].trim()}`;
  return "Remote";
}

export async function fetchWeWorkRemotely() {
  const all = [];
  for (const feedUrl of FEEDS) {
    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "job-tracker-personal/1.0" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const parsed = await parseStringPromise(xml);
      const items = parsed?.rss?.channel?.[0]?.item || [];
      for (const item of items) {
        const title = (item.title?.[0] || "").trim();
        const link = item.link?.[0] || "";
        const description = (item.description?.[0] || "").toString();
        const pubDate = item.pubDate?.[0] || "";
        // Title is usually "Company: Job Title"
        const split = title.split(":");
        const company = split.length > 1 ? split[0].trim() : "";
        const jobTitle = split.length > 1 ? split.slice(1).join(":").trim() : title;
        all.push({
          id: `wwr-${link.split("/").pop()}`,
          title: jobTitle,
          company,
          location: extractLocation(description),
          url: link,
          salary: "",
          tags: "",
          datePosted: pubDate
            ? new Date(pubDate).toISOString().slice(0, 10)
            : "",
          source: "WeWorkRemotely",
          description: description.replace(/<[^>]+>/g, "").slice(0, 500),
        });
      }
    } catch (err) {
      console.error(`[WWR ${feedUrl}] fetch failed:`, err.message);
    }
  }
  return all;
}
