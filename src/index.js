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
import { fetchWorkable } from "./sources/workable.js";
import { evaluateJobs } from "./filter.js";
import { writeJobsToSheets } from "./sheets.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function runSource(name, enabled, fn) {
  if (!enabled) {
    return {
      jobs: [],
      health: {
        source: name,
        enabled: false,
        status: "Disabled",
        count: 0,
        message: "Source is disabled in configuration",
      },
    };
  }

  console.log(`Fetching ${name}...`);
  const startedAt = Date.now();
  try {
    const jobs = await fn();
    const durationMs = Date.now() - startedAt;
    const status = jobs.length ? "Healthy" : "Warning";
    const message = jobs.length
      ? `Fetched in ${durationMs} ms`
      : "Source returned zero jobs; inspect workflow logs";
    console.log(`  → ${jobs.length} raw`);
    return {
      jobs,
      health: {
        source: name,
        enabled: true,
        status,
        count: jobs.length,
        message,
      },
    };
  } catch (error) {
    console.error(`[${name}] fetch failed:`, error.message);
    return {
      jobs: [],
      health: {
        source: name,
        enabled: true,
        status: "Warning",
        count: 0,
        message: error.message,
      },
    };
  }
}

async function main() {
  console.log(`=== Job Tracker — ${new Date().toISOString()} ===`);
  if (DRY_RUN) console.log("[DRY RUN — no sheet writes]");

  const sourceDefinitions = [
    ["RemoteOK", CONFIG.sources.remoteok.enabled, fetchRemoteOK],
    [
      "WeWorkRemotely",
      CONFIG.sources.weworkremotely.enabled,
      fetchWeWorkRemotely,
    ],
    ["Larajobs", CONFIG.sources.larajobs.enabled, fetchLarajobs],
    [
      "Laravel.io",
      CONFIG.sources.laravelio.enabled,
      fetchLaravelIO,
    ],
    ["Remotive", CONFIG.sources.remotive.enabled, fetchRemotive],
    [
      "WorkingNomads",
      CONFIG.sources.workingnomads.enabled,
      fetchWorkingNomads,
    ],
    [
      "Jobspresso",
      CONFIG.sources.jobspresso.enabled,
      fetchJobspresso,
    ],
    [
      "Product Jobs Anywhere",
      CONFIG.sources.productjobsanywhere.enabled,
      fetchProductJobsAnywhere,
    ],
    ["Workable", CONFIG.sources.workable.enabled, fetchWorkable],
  ];
  const sourceResults = await Promise.all(
    sourceDefinitions.map(([name, enabled, fn]) =>
      runSource(name, enabled, fn)
    )
  );
  const all = sourceResults.flatMap((result) => result.jobs);
  const sourceHealth = sourceResults.map((result) => result.health);

  console.log(`Total raw jobs: ${all.length}`);
  const results = evaluateJobs(all);
  console.log(
    `Recommendations: ${results.accepted.length} accepted, ` +
      `${results.stretch.length} stretch, ${results.rejected.length} rejected`
  );
  console.log(
    `Cross-source duplicates removed: ${results.duplicateCount}`
  );

  if (DRY_RUN) {
    console.log("\n=== Daily shortlist preview ===");
    const shortlist = results.accepted.slice(
      0,
      CONFIG.matching.dailyShortlistLimit
    );
    for (const job of shortlist) {
      console.log(
        `[${job.fitScore}] ${job.recommendation}: ${job.title} @ ` +
          `${job.company} (${job.eligibility})`
      );
      console.log(`    ${job.matchReasons}`);
      if (job.gaps) console.log(`    Gaps: ${job.gaps}`);
      console.log(`    ${job.url}`);
    }
    console.log("\n=== Source health ===");
    for (const health of sourceHealth) {
      console.log(
        `${health.source}: ${health.status} (${health.count}) - ` +
          health.message
      );
    }
    return;
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEET_ID env var is missing");
  }
  await writeJobsToSheets(results, sourceHealth, spreadsheetId);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
