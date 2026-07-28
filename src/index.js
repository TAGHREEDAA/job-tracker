// Main entry: fetch from all sources, filter, write to Sheet.

import { CONFIG } from "./config.js";
import { fetchRemoteOK } from "./sources/remoteok.js";
import { fetchWeWorkRemotely } from "./sources/weworkremotely.js";
import { fetchLarajobs } from "./sources/larajobs.js";
import { fetchLaravelIO } from "./sources/laravelio.js";
import { fetchRemotive } from "./sources/remotive.js";
import { fetchWorkingNomads } from "./sources/workingnomads.js";
import { fetchJobspresso } from "./sources/jobspresso.js";
import { fetchProductJobsAnywhere } from "./sources/productjobsanywhere.js";
import { filterJobs } from "./filter.js";
import { writeJobsToSheet } from "./sheets.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function runSource(name, enabled, fn) {
  if (!enabled) return [];
  console.log(`Fetching ${name}...`);
  const jobs = await fn();
  console.log(`  → ${jobs.length} raw`);
  return jobs;
}

async function main() {
  console.log(`=== Job Tracker — ${new Date().toISOString()} ===`);
  if (DRY_RUN) console.log("[DRY RUN — no sheet writes]");

  const all = [];

  all.push(...(await runSource("RemoteOK", CONFIG.sources.remoteok.enabled, fetchRemoteOK)));
  all.push(...(await runSource("WeWorkRemotely", CONFIG.sources.weworkremotely.enabled, fetchWeWorkRemotely)));
  all.push(...(await runSource("Larajobs", CONFIG.sources.larajobs.enabled, fetchLarajobs)));
  all.push(...(await runSource("Laravel.io", CONFIG.sources.laravelio.enabled, fetchLaravelIO)));
  all.push(...(await runSource("Remotive", CONFIG.sources.remotive.enabled, fetchRemotive)));
  all.push(...(await runSource("WorkingNomads", CONFIG.sources.workingnomads.enabled, fetchWorkingNomads)));
  all.push(...(await runSource("Jobspresso", CONFIG.sources.jobspresso.enabled, fetchJobspresso)));
  all.push(...(await runSource("Product Jobs Anywhere", CONFIG.sources.productjobsanywhere.enabled, fetchProductJobsAnywhere)));

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
