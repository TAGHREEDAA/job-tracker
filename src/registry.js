import { google } from "googleapis";

import { CONFIG } from "./config.js";
import { createDedupeKey } from "./filter.js";
import { buildAuth } from "./sheets.js";

const SUPPRESSED_STATUSES = new Set(["applied", "interview", "offer"]);
const COMPANY_HISTORY_STATUSES = new Set([
  "applied",
  "rejected",
  "interview",
  "offer",
  "withdrawn",
]);

function normalize(value) {
  return (value || "").toString().trim().toLowerCase();
}

function normalizeCompany(value) {
  return normalize(value)
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDate(value) {
  if (!value) return null;
  const raw = value.toString().trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const parsed = iso
    ? new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    : us
      ? new Date(Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2])))
      : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addCalendarMonths(value, months) {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0
  )).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

function activeUntil(value, now) {
  const until = parseDate(value);
  return !until || until.getTime() >= now.getTime();
}

function applicationCooldown(row, now) {
  const explicit = parseDate(row.cooldownUntil);
  if (explicit) return explicit;
  const base = parseDate(row.appliedDate) || parseDate(row.updatedAt) || now;
  return addCalendarMonths(
    base,
    CONFIG.privateRegistry.rejectionCooldownMonths
  );
}

function isTemplateApplication(row) {
  return row.dedupeKey === "template-row" ||
    row.url.includes("example.invalid");
}

function isTemplateExclusion(company) {
  return normalize(company).includes("replace or delete this row");
}

export function parsePrivateRegistry(
  applicationRows = [],
  excludedRows = [],
  now = new Date()
) {
  const applicationsByKey = new Map();
  const applicationsByUrl = new Map();
  const companiesWithHistory = new Set();

  for (const cells of applicationRows) {
    const row = {
      company: (cells[0] || "").toString().trim(),
      title: (cells[1] || "").toString().trim(),
      url: (cells[2] || "").toString().trim(),
      dedupeKey: (cells[3] || "").toString().trim(),
      status: normalize(cells[4]),
      appliedDate: cells[5] || "",
      cooldownUntil: cells[6] || "",
      updatedAt: cells[7] || "",
    };
    if (!row.company || !row.status || isTemplateApplication(row)) continue;
    const company = normalizeCompany(row.company);
    if (COMPANY_HISTORY_STATUSES.has(row.status)) {
      companiesWithHistory.add(company);
    }
    const key = row.dedupeKey || createDedupeKey(row);
    applicationsByKey.set(key, row);
    if (row.url) applicationsByUrl.set(row.url, row);
  }

  const excludedCompanies = new Map();
  for (const cells of excludedRows) {
    const company = (cells[0] || "").toString().trim();
    const active = normalize(cells[1]);
    const cooldownUntil = cells[2] || "";
    if (
      !company ||
      isTemplateExclusion(company) ||
      !["yes", "true", "active"].includes(active) ||
      !activeUntil(cooldownUntil, now)
    ) {
      continue;
    }
    excludedCompanies.set(normalizeCompany(company), cooldownUntil);
  }

  return {
    applicationsByKey,
    applicationsByUrl,
    companiesWithHistory,
    excludedCompanies,
  };
}

export function emptyPrivateRegistry() {
  return parsePrivateRegistry([], []);
}

export async function loadPrivateRegistry(spreadsheetId) {
  if (!spreadsheetId) return emptyPrivateRegistry();
  try {
    const sheets = google.sheets({ version: "v4", auth: buildAuth() });
    const applicationsName = CONFIG.privateRegistry.applicationsSheetName;
    const excludedName = CONFIG.privateRegistry.excludedCompaniesSheetName;
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [
        `'${applicationsName}'!A2:H1000`,
        `'${excludedName}'!A2:C1000`,
      ],
    });
    const [applications, excluded] = response.data.valueRanges || [];
    return parsePrivateRegistry(
      applications?.values || [],
      excluded?.values || []
    );
  } catch {
    console.warn(
      "[Private Registry] Read failed; continuing without private filters"
    );
    return emptyPrivateRegistry();
  }
}

function shouldSuppressApplication(application, now) {
  if (!application) return false;
  if (SUPPRESSED_STATUSES.has(application.status)) return true;
  if (application.status !== "rejected") return false;
  return applicationCooldown(application, now).getTime() >= now.getTime();
}

export function applyPrivateRegistry(jobs, registry, now = new Date()) {
  const filtered = [];
  let skipped = 0;
  let marked = 0;

  for (const job of jobs) {
    const company = normalizeCompany(job.company);
    if (company && registry.excludedCompanies.has(company)) {
      skipped += 1;
      continue;
    }

    const key = job.dedupeKey || createDedupeKey(job);
    const application =
      registry.applicationsByUrl.get(job.url) ||
      registry.applicationsByKey.get(key);
    if (shouldSuppressApplication(application, now)) {
      skipped += 1;
      continue;
    }

    if (company && registry.companiesWithHistory.has(company)) {
      filtered.push({ ...job, previouslyAppliedCompany: true });
      marked += 1;
    } else {
      filtered.push(job);
    }
  }

  return { jobs: filtered, skipped, marked };
}
