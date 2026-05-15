// Working Nomads publishes RSS feeds per category.
// Development category covers backend, PHP, Laravel.

import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";

const FEEDS = [
  "https://www.workingnomads.com/jobs/feed?category=development",
];

export async function fetchWorkingNomads() {
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
        const category = item.category || [];
        // Working Nomads titles are usually "Job Title at Company"
        const atMatch = title.match(/(.+?)\s+at\s+(.+)/i);
        const jobTitle = atMatch ? atMatch[1].trim() : title;
        const company = atMatch ? atMatch[2].trim() : "";

        const idMatch = link.match(/\/jobs\/([^/?#]+)/);
        const id = idMatch ? `wn-${idMatch[1]}` : `wn-${link.split("/").pop()}`;

        all.push({
          id,
          title: jobTitle,
          company,
          location: "Remote",
          url: link,
          salary: "",
          tags: Array.isArray(category) ? category.join(", ") : "",
          datePosted: pubDate
            ? new Date(pubDate).toISOString().slice(0, 10)
            : "",
          source: "WorkingNomads",
          description: description.replace(/<[^>]+>/g, "").slice(0, 500),
        });
      }
    } catch (err) {
      console.error(`[WorkingNomads ${feedUrl}] fetch failed:`, err.message);
    }
  }
  return all;
}
