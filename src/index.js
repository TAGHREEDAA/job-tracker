// Main entry: fetch from all sources, filter, write to Sheet.

import { CONFIG } from "./config.js";
import { fetchRemoteOK } from "./sources/remoteok.js";
import { fetchWeWorkRemotely } from "./sources/weworkremotely.js";
import { fetchLarajobs } from "./sources/larajobs.js";
import { fetchLaravelIO } from "./sources/laravelio.js";
import { filterJobs } from "./filter.js";
import { writeJobsToSheet } from "./sheets.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`=== Job Tracker — ${new Date().toISOString()} ===`);
  if (DRY_RUN) console.log("[DRY RUN — no sheet writes]");

  const all = [];

  if (CONFIG.sources.remoteok.enabled) {
    console.log("Fetching RemoteOK...");
    const jobs = await fetchRemoteOK();
    console.log(`  → ${jobs.length} raw`);
    all.push(...jobs);
  }
  if (CONFIG.sources.weworkremotely.enabled) {
    console.log("Fetching WeWorkRemotely...");
    const jobs = await fetchWeWorkRemotely();
    console.log(`  → ${jobs.length} raw`);
    all.push(...jobs);
  }
  if (CONFIG.sources.larajobs.enabled) {
    console.log("Fetching Larajobs...");
    const jobs = await fetchLarajobs();
    console.log(`  → ${jobs.length} raw`);
    all.push(...jobs);
  }
  if (CONFIG.sources.laravelio.enabled) {
    console.log("Fetching Laravel.io...");
    const jobs = await fetchLaravelIO();
    console.log(`  → ${jobs.length} raw`);
    all.push(...jobs);
  }

  console.log(`Total raw jobs: ${all.length}`);
  const filtered = filterJobs(all);
  console.log(`After filtering: ${filtered.length}`);

  // Sort: priority first, then by source
  filtered.sort((a, b) => {
    if (a.priority && !b.priority) return -1;
    if (!a.priority && b.priority) return 1;
    return (a.source || "").localeCompare(b.source || "");
  });

  if (DRY_RUN) {
    console.log("\n=== Sample filtered jobs ===");
    for (const j of filtered.slice(0, 10)) {
      console.log(`[${j.priority || "  "}] ${j.source}: ${j.title} @ ${j.company} (${j.location})`);
      console.log(`    ${j.url}`);
    }
    return;
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEET_ID env var is missing");
  }
  await writeJobsToSheet(filtered, spreadsheetId);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
