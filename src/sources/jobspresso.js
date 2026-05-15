// Jobspresso has an RSS feed.
// https://jobspresso.co/remote-tech-jobs/feed/

import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";

const FEEDS = [
  "https://jobspresso.co/remote-tech-jobs/feed/",
];

export async function fetchJobspresso() {
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

        // Jobspresso titles often look like "Senior Backend Engineer – Acme Inc"
        // The em-dash separator. Try a few patterns.
        const dashSplit = title.split(/\s+[–—-]\s+/);
        const jobTitle = dashSplit[0]?.trim() || title;
        const company = dashSplit[1]?.trim() || "";

        const slugMatch = link.match(/jobspresso\.co\/([^/?#]+)/);
        const id = slugMatch ? `jp-${slugMatch[1]}` : `jp-${link.split("/").pop()}`;

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
          source: "Jobspresso",
          description: description.replace(/<[^>]+>/g, "").slice(0, 500),
        });
      }
    } catch (err) {
      console.error(`[Jobspresso ${feedUrl}] fetch failed:`, err.message);
    }
  }
  return all;
}
