// RemoteOK has a free public JSON API — no scraping needed.
// https://remoteok.com/api

import fetch from "node-fetch";

export async function fetchRemoteOK() {
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "job-tracker-personal/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // First element is metadata
    const jobs = data.slice(1);
    return jobs.map((j) => ({
      id: `remoteok-${j.id}`,
      title: j.position || j.title || "",
      company: j.company || "",
      location: j.location || "Remote",
      url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      salary: j.salary_min
        ? `${j.salary_min}-${j.salary_max} ${j.salary_currency || "USD"}`
        : "",
      tags: (j.tags || []).join(", "),
      datePosted: j.date ? new Date(j.date).toISOString().slice(0, 10) : "",
      source: "RemoteOK",
      description: (j.description || "").replace(/<[^>]+>/g, "").slice(0, 500),
    }));
  } catch (err) {
    console.error("[RemoteOK] fetch failed:", err.message);
    return [];
  }
}
