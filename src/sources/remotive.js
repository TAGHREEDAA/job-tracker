// Remotive has a free public JSON API.
// https://remotive.com/api/remote-jobs
// Documented at https://remotive.com/api-documentation

import fetch from "node-fetch";

export async function fetchRemotive() {
  try {
    // Fetch software-dev category (covers PHP, Laravel, backend, fullstack)
    const url = "https://remotive.com/api/remote-jobs?category=software-dev";
    const res = await fetch(url, {
      headers: { "User-Agent": "job-tracker-personal/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const jobs = data.jobs || [];
    return jobs.map((j) => ({
      id: `remotive-${j.id}`,
      title: j.title || "",
      company: j.company_name || "",
      location: j.candidate_required_location || "Worldwide",
      url: j.url || "",
      salary: j.salary || "",
      tags: (j.tags || []).join(", "),
      datePosted: j.publication_date
        ? new Date(j.publication_date).toISOString().slice(0, 10)
        : "",
      source: "Remotive",
      description: (j.description || "").replace(/<[^>]+>/g, "").slice(0, 500),
    }));
  } catch (err) {
    console.error("[Remotive] fetch failed:", err.message);
    return [];
  }
}
