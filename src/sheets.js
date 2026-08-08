// Google Sheets persistence for active recommendations, daily shortlist,
// stretch/rejected views, archival retention, and source health.

import { google } from "googleapis";
import { CONFIG } from "./config.js";
import {
  classifyRole,
  createDedupeKey,
} from "./filter.js";
import { repairMojibake } from "./text.js";

const LEGACY_SHEET_NAME = "Jobs";
const METADATA_SHEET_NAME = "_JobTracker";
const RESET_DATE_CELL = "B1";
const PRIORITY_FORMULA = '=$D2="⭐ PRIORITY"';

export const ACTIVE_HEADER = [
  "Date Found",
  "Recommendation",
  "Score",
  "Priority",
  "Role Category",
  "Eligibility",
  "Title",
  "Company",
  "Location",
  "Salary",
  "Source",
  "URL",
  "Tags",
  "Date Posted",
  "Match Reasons",
  "Gaps",
  "Confidence",
  "Dedupe Key",
  "Status",
  "Notes",
];

export const ARCHIVE_HEADER = [...ACTIVE_HEADER, "Archived Date"];

export const SOURCE_HEALTH_HEADER = [
  "Checked At",
  "Source",
  "Enabled",
  "Status",
  "Jobs Found",
  "Consecutive Warnings",
  "Message",
];

const PRIVATE_APPLICATION_HEADER = [
  "Company",
  "Title",
  "URL",
  "Dedupe Key",
  "Status",
  "Applied Date",
  "Cooldown Until",
  "Updated At",
];

const OLD_HEADER = [
  "Date Found",
  "Priority",
  "Title",
  "Company",
  "Location",
  "Salary",
  "Source",
  "URL",
  "Tags",
  "Date Posted",
  "Status",
  "Notes",
];

export function buildAuth() {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credsJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var is missing");
  }
  const credentials = JSON.parse(credsJson);
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function a1Range(sheetName, cells) {
  const escapedName = sheetName.replaceAll("'", "''");
  return `'${escapedName}'!${cells}`;
}

function sameRow(left = [], right = []) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function columnName(columnNumber) {
  let value = columnNumber;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

export function columnsForHeader(header) {
  return `A:${columnName(header.length)}`;
}

function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function normalizedStatus(value) {
  return (value || "").toString().trim();
}

function padRow(row, length) {
  const copy = [...row];
  while (copy.length < length) copy.push("");
  return copy.slice(0, length);
}

function dateValue(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function rowDateValue(row, dateColumns) {
  for (const column of dateColumns) {
    const value = dateValue(row[column]);
    if (value !== Number.NEGATIVE_INFINITY) return value;
  }
  return Number.NEGATIVE_INFINITY;
}

export function sortRowsNewestFirst(
  rows,
  dateColumns = [13, 0]
) {
  return rows
    .filter((row) => row.some(Boolean))
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const difference =
        rowDateValue(right.row, dateColumns) -
        rowDateValue(left.row, dateColumns);
      if (difference) return difference;
      return left.originalIndex - right.originalIndex;
    })
    .map(({ row }) => row);
}

export function legacyRowToActive(row) {
  const old = padRow(row, OLD_HEADER.length);
  const job = {
    title: old[2],
    company: old[3],
    location: old[4],
  };
  const role = classifyRole(job);
  return [
    old[0],
    "Legacy",
    "",
    old[1],
    role.category,
    "Not evaluated",
    old[2],
    old[3],
    old[4],
    old[5],
    old[6],
    old[7],
    old[8],
    old[9],
    "Migrated from the previous spreadsheet schema",
    "",
    "Low",
    createDedupeKey(job),
    old[10],
    old[11],
  ];
}

export function jobToRow(job, dateFound = todayISO()) {
  return [
    dateFound,
    job.recommendation || "",
    job.fitScore ?? "",
    job.priority || "",
    job.roleCategory || "",
    job.eligibility || "",
    job.title || "",
    job.company || "",
    job.location || "",
    job.salary || "",
    job.source || "",
    job.url || "",
    job.tags || "",
    job.datePosted || "",
    job.matchReasons || "",
    job.gaps || "",
    job.confidence || "",
    job.dedupeKey || createDedupeKey(job),
    "",
    "",
  ];
}

function rowIdentity(row) {
  const padded = padRow(row, ACTIVE_HEADER.length);
  return {
    url: padded[11],
    dedupeKey:
      padded[17] ||
      createDedupeKey({
        title: padded[6],
        company: padded[7],
      }),
  };
}

export function isAppliedStatus(value) {
  return normalizedStatus(value).toLowerCase() === "applied";
}

function sameIdentity(left, right) {
  const leftIdentity = rowIdentity(left);
  const rightIdentity = rowIdentity(right);
  return Boolean(
    (leftIdentity.url && leftIdentity.url === rightIdentity.url) ||
    (leftIdentity.dedupeKey &&
      leftIdentity.dedupeKey === rightIdentity.dedupeKey)
  );
}

function mergeJobRows(base, candidate) {
  const merged = padRow(base, ACTIVE_HEADER.length);
  const incoming = padRow(candidate, ACTIVE_HEADER.length);
  for (let index = 0; index < ACTIVE_HEADER.length; index += 1) {
    if (!merged[index] && incoming[index]) {
      merged[index] = incoming[index];
    }
  }
  return merged;
}

export function planAppliedMove(
  sourceRowsBySheet,
  existingAppliedRows = []
) {
  const normalizedSources = Object.fromEntries(
    Object.entries(sourceRowsBySheet).map(([sheetName, rows]) => [
      sheetName,
      rows
        .filter((row) => row.some(Boolean))
        .map((row) => padRow(row, ACTIVE_HEADER.length)),
    ])
  );
  const appliedUrls = new Set();
  const appliedKeys = new Set();

  for (const rows of Object.values(normalizedSources)) {
    for (const row of rows) {
      if (!isAppliedStatus(row[18])) continue;
      const identity = rowIdentity(row);
      if (identity.url) appliedUrls.add(identity.url);
      if (identity.dedupeKey) appliedKeys.add(identity.dedupeKey);
    }
  }

  const matchesApplied = (row) => {
    const identity = rowIdentity(row);
    return appliedUrls.has(identity.url) || appliedKeys.has(identity.dedupeKey);
  };
  const appliedRows = [];
  for (const existingRow of existingAppliedRows
    .filter((row) => row.some(Boolean))
    .map((row) => padRow(row, ACTIVE_HEADER.length))) {
    const duplicateIndex = appliedRows.findIndex((candidate) =>
      sameIdentity(candidate, existingRow)
    );
    if (duplicateIndex >= 0) {
      appliedRows[duplicateIndex] = mergeJobRows(
        appliedRows[duplicateIndex],
        existingRow
      );
    } else {
      appliedRows.push(existingRow);
    }
  }

  for (const rows of Object.values(normalizedSources)) {
    for (const row of rows.filter(matchesApplied)) {
      const existingIndex = appliedRows.findIndex((candidate) =>
        sameIdentity(candidate, row)
      );
      if (existingIndex >= 0) {
        appliedRows[existingIndex] = mergeJobRows(
          appliedRows[existingIndex],
          row
        );
      } else {
        const moved = [...row];
        moved[18] = "Applied";
        appliedRows.push(moved);
      }
    }
  }

  const movedRows = appliedRows.filter(matchesApplied);
  const remainingBySheet = Object.fromEntries(
    Object.entries(normalizedSources).map(([sheetName, rows]) => [
      sheetName,
      rows.filter((row) => !matchesApplied(row)),
    ])
  );

  return {
    appliedRows,
    movedRows,
    remainingBySheet,
    movedCount: movedRows.length,
  };
}

function addCalendarMonths(value, months) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const day = date.getUTCDate();
  const targetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)
  );
  const lastDay = new Date(
    Date.UTC(
      targetMonth.getUTCFullYear(),
      targetMonth.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();
  targetMonth.setUTCDate(Math.min(day, lastDay));
  return targetMonth;
}

export function isResetDue(
  lastReset,
  now = new Date(),
  months = CONFIG.spreadsheet.resetEveryMonths
) {
  const nextReset = addCalendarMonths(lastReset, months);
  return nextReset ? now >= nextReset : false;
}

async function getSpreadsheetSheets(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.get({ spreadsheetId });
  return response.data.sheets || [];
}

async function createSheet(
  sheets,
  spreadsheetId,
  title,
  hidden = false
) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title, hidden },
          },
        },
      ],
    },
  });
  console.log(`Created "${title}" sheet.`);
}

async function renameLegacySheet(sheets, spreadsheetId, sheetList) {
  const backendName = CONFIG.spreadsheet.backendSheetName;
  const backendExists = sheetList.some(
    (sheet) => sheet.properties.title === backendName
  );
  const legacy = sheetList.find(
    (sheet) => sheet.properties.title === LEGACY_SHEET_NAME
  );
  if (!legacy || backendExists) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: legacy.properties.sheetId,
              title: backendName,
            },
            fields: "title",
          },
        },
      ],
    },
  });
  console.log(`Renamed "${LEGACY_SHEET_NAME}" to "${backendName}".`);
  return true;
}

function requiredSheets() {
  return [
    { title: CONFIG.spreadsheet.backendSheetName },
    { title: CONFIG.spreadsheet.productSheetName },
    { title: CONFIG.spreadsheet.todaySheetName },
    { title: CONFIG.spreadsheet.stretchSheetName },
    { title: CONFIG.spreadsheet.rejectedSheetName },
    { title: CONFIG.spreadsheet.appliedSheetName },
    { title: CONFIG.spreadsheet.archiveSheetName },
    { title: CONFIG.spreadsheet.sourceHealthSheetName },
    { title: METADATA_SHEET_NAME, hidden: true },
  ];
}

async function ensureSheets(sheets, spreadsheetId) {
  let sheetList = await getSpreadsheetSheets(sheets, spreadsheetId);
  const renamedLegacy = await renameLegacySheet(
    sheets,
    spreadsheetId,
    sheetList
  );
  if (renamedLegacy) {
    sheetList = await getSpreadsheetSheets(sheets, spreadsheetId);
  }

  for (const required of requiredSheets()) {
    if (
      !sheetList.some(
        (sheet) => sheet.properties.title === required.title
      )
    ) {
      await createSheet(
        sheets,
        spreadsheetId,
        required.title,
        required.hidden || false
      );
    }
  }

  return {
    renamedLegacy,
    sheets: await getSpreadsheetSheets(sheets, spreadsheetId),
  };
}

async function getRows(
  sheets,
  spreadsheetId,
  sheetName,
  columns = "A:U"
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: a1Range(sheetName, columns),
  });
  return response.data.values || [];
}

async function overwriteRows(
  sheets,
  spreadsheetId,
  sheetName,
  header,
  rows
) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: a1Range(sheetName, "A:Z"),
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: a1Range(sheetName, "A1"),
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] },
  });
}

async function appendRows(
  sheets,
  spreadsheetId,
  sheetName,
  rows
) {
  if (!rows.length) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: a1Range(sheetName, "A:Z"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

async function ensureSchema(
  sheets,
  spreadsheetId,
  sheetName,
  header
) {
  const values = await getRows(
    sheets,
    spreadsheetId,
    sheetName,
    columnsForHeader(header)
  );
  if (!values.length) {
    await overwriteRows(
      sheets,
      spreadsheetId,
      sheetName,
      header,
      []
    );
    return;
  }
  if (sameRow(values[0], header)) return;

  if (
    header === ACTIVE_HEADER &&
    sameRow(values[0], OLD_HEADER)
  ) {
    const migrated = values
      .slice(1)
      .filter((row) => row.some(Boolean))
      .map(legacyRowToActive);
    await overwriteRows(
      sheets,
      spreadsheetId,
      sheetName,
      ACTIVE_HEADER,
      migrated
    );
    console.log(
      `Migrated ${migrated.length} rows in "${sheetName}" to the recommendation schema.`
    );
    return;
  }

  if (values[0].length === 0) {
    await overwriteRows(
      sheets,
      spreadsheetId,
      sheetName,
      header,
      values.slice(1)
    );
    return;
  }

  throw new Error(
    `Unexpected header in "${sheetName}". Refusing to overwrite user data.`
  );
}

function hasPriorityFormat(sheet) {
  return (sheet.conditionalFormats || []).some((rule) =>
    rule.booleanRule?.condition?.values?.some(
      (value) => value.userEnteredValue === PRIORITY_FORMULA
    )
  );
}

async function ensureFormatting(sheets, spreadsheetId, sheet) {
  const requests = [
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheet.properties.sheetId,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: sheet.properties.sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: {
              red: 0.86,
              green: 0.9,
              blue: 0.97,
            },
          },
        },
        fields:
          "userEnteredFormat(textFormat,backgroundColor)",
      },
    },
  ];

  if (!hasPriorityFormat(sheet)) {
    requests.push({
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [
            {
              sheetId: sheet.properties.sheetId,
              startRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: ACTIVE_HEADER.length,
            },
          ],
          booleanRule: {
            condition: {
              type: "CUSTOM_FORMULA",
              values: [{ userEnteredValue: PRIORITY_FORMULA }],
            },
            format: {
              backgroundColor: {
                red: 0.85,
                green: 0.94,
                blue: 0.83,
              },
            },
          },
        },
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

async function getResetDate(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: a1Range(METADATA_SHEET_NAME, "A1:B1"),
  });
  return response.data.values?.[0]?.[1] || "";
}

async function setResetDate(sheets, spreadsheetId, date) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: a1Range(METADATA_SHEET_NAME, "A1:B1"),
    valueInputOption: "RAW",
    requestBody: {
      values: [["Last archive", date]],
    },
  });
}

async function archiveActiveJobsIfDue(
  sheets,
  spreadsheetId,
  today
) {
  const lastReset = await getResetDate(sheets, spreadsheetId);
  if (!lastReset) {
    await setResetDate(sheets, spreadsheetId, today);
    return false;
  }
  if (!isResetDue(lastReset, new Date(`${today}T00:00:00Z`))) {
    return false;
  }

  const archiveName = CONFIG.spreadsheet.archiveSheetName;
  const archiveValues = await getRows(
    sheets,
    spreadsheetId,
    archiveName
  );
  const archiveIdentities = new Set(
    archiveValues.slice(1).map((row) => {
      const identity = rowIdentity(row);
      return `${identity.dedupeKey}:${row[0]}`;
    })
  );

  let archivedCount = 0;
  for (const sheetName of [
    CONFIG.spreadsheet.backendSheetName,
    CONFIG.spreadsheet.productSheetName,
    CONFIG.spreadsheet.stretchSheetName,
  ]) {
    const values = await getRows(
      sheets,
      spreadsheetId,
      sheetName
    );
    const rows = values
      .slice(1)
      .filter((row) => row.some(Boolean))
      .map((row) => padRow(row, ACTIVE_HEADER.length));
    const newArchiveRows = rows
      .filter((row) => {
        const identity = rowIdentity(row);
        return !archiveIdentities.has(
          `${identity.dedupeKey}:${row[0]}`
        );
      })
      .map((row) => [...row, today]);

    await appendRows(
      sheets,
      spreadsheetId,
      archiveName,
      newArchiveRows
    );
    for (const row of newArchiveRows) {
      const identity = rowIdentity(row);
      archiveIdentities.add(`${identity.dedupeKey}:${row[0]}`);
    }
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: a1Range(sheetName, "A2:Z"),
    });
    archivedCount += newArchiveRows.length;
  }

  await setResetDate(sheets, spreadsheetId, today);
  console.log(
    `Archived ${archivedCount} active rows after ${CONFIG.spreadsheet.resetEveryMonths} months.`
  );
  return true;
}

async function migrateLegacyProductRows(
  sheets,
  spreadsheetId
) {
  const backendName = CONFIG.spreadsheet.backendSheetName;
  const productName = CONFIG.spreadsheet.productSheetName;
  const backendValues = await getRows(
    sheets,
    spreadsheetId,
    backendName
  );
  const productValues = await getRows(
    sheets,
    spreadsheetId,
    productName
  );
  const productKeys = new Set(
    productValues.slice(1).map((row) => rowIdentity(row).dedupeKey)
  );
  const backendRows = backendValues
    .slice(1)
    .filter((row) => row.some(Boolean))
    .map((row) => padRow(row, ACTIVE_HEADER.length));
  const rowsToMove = backendRows.filter(
    (row) =>
      classifyRole({ title: row[6] }).category ===
      "Product Engineer"
  );
  if (!rowsToMove.length) return;

  const newProductRows = rowsToMove.filter(
    (row) => !productKeys.has(rowIdentity(row).dedupeKey)
  );
  const movedKeys = new Set(
    rowsToMove.map((row) => rowIdentity(row).dedupeKey)
  );
  const remainingBackendRows = backendRows.filter(
    (row) => !movedKeys.has(rowIdentity(row).dedupeKey)
  );

  await appendRows(
    sheets,
    spreadsheetId,
    productName,
    newProductRows
  );
  await overwriteRows(
    sheets,
    spreadsheetId,
    backendName,
    ACTIVE_HEADER,
    remainingBackendRows
  );
  console.log(
    `Moved ${rowsToMove.length} legacy product-engineering rows to "${productName}".`
  );
}

async function activeIdentities(
  sheets,
  spreadsheetId,
  sheetNames
) {
  const urls = new Set();
  const dedupeKeys = new Set();
  for (const sheetName of sheetNames) {
    const values = await getRows(
      sheets,
      spreadsheetId,
      sheetName
    );
    for (const row of values.slice(1)) {
      const identity = rowIdentity(row);
      if (identity.url) urls.add(identity.url);
      if (identity.dedupeKey) dedupeKeys.add(identity.dedupeKey);
    }
  }
  return { urls, dedupeKeys };
}

function filterNewJobs(jobs, identities) {
  const fresh = [];
  let skipped = 0;
  for (const job of jobs) {
    if (
      identities.urls.has(job.url) ||
      identities.dedupeKeys.has(job.dedupeKey)
    ) {
      skipped++;
      continue;
    }
    identities.urls.add(job.url);
    identities.dedupeKeys.add(job.dedupeKey);
    fresh.push(job);
  }
  return { fresh, skipped };
}

async function writeActiveJobs(
  sheets,
  spreadsheetId,
  results,
  today
) {
  const backendName = CONFIG.spreadsheet.backendSheetName;
  const productName = CONFIG.spreadsheet.productSheetName;
  const stretchName = CONFIG.spreadsheet.stretchSheetName;
  const identities = await activeIdentities(
    sheets,
    spreadsheetId,
    [
      backendName,
      productName,
      stretchName,
      CONFIG.spreadsheet.appliedSheetName,
    ]
  );

  const acceptedResult = filterNewJobs(
    results.accepted,
    identities
  );
  const stretchResult = filterNewJobs(
    results.stretch,
    identities
  );
  const backendJobs = acceptedResult.fresh.filter(
    (job) => job.roleCategory !== "Product Engineer"
  );
  const productJobs = acceptedResult.fresh.filter(
    (job) => job.roleCategory === "Product Engineer"
  );

  await appendRows(
    sheets,
    spreadsheetId,
    backendName,
    backendJobs.map((job) => jobToRow(job, today))
  );
  await appendRows(
    sheets,
    spreadsheetId,
    productName,
    productJobs.map((job) => jobToRow(job, today))
  );
  await appendRows(
    sheets,
    spreadsheetId,
    stretchName,
    stretchResult.fresh.map((job) => jobToRow(job, today))
  );

  console.log(
    `Active jobs: ${backendJobs.length} backend, ` +
      `${productJobs.length} product, ` +
      `${stretchResult.fresh.length} stretch; ` +
      `${acceptedResult.skipped + stretchResult.skipped} duplicates skipped.`
  );
}

async function syncTodayManualFields(
  sheets,
  spreadsheetId
) {
  const todayValues = await getRows(
    sheets,
    spreadsheetId,
    CONFIG.spreadsheet.todaySheetName
  );
  const manualByIdentity = new Map();
  for (const row of todayValues.slice(1)) {
    const padded = padRow(row, ACTIVE_HEADER.length);
    const status = normalizedStatus(padded[18]);
    const notes = normalizedStatus(padded[19]);
    if (!status && !notes) continue;
    const identity = rowIdentity(padded);
    if (identity.url) {
      manualByIdentity.set(`url:${identity.url}`, {
        status,
        notes,
      });
    }
    if (identity.dedupeKey) {
      manualByIdentity.set(`key:${identity.dedupeKey}`, {
        status,
        notes,
      });
    }
  }
  if (!manualByIdentity.size) return;

  for (const sheetName of [
    CONFIG.spreadsheet.backendSheetName,
    CONFIG.spreadsheet.productSheetName,
    CONFIG.spreadsheet.stretchSheetName,
  ]) {
    const values = await getRows(
      sheets,
      spreadsheetId,
      sheetName
    );
    let changed = false;
    const rows = values
      .slice(1)
      .filter((row) => row.some(Boolean))
      .map((row) => {
        const padded = padRow(row, ACTIVE_HEADER.length);
        const identity = rowIdentity(padded);
        const manual =
          manualByIdentity.get(`url:${identity.url}`) ||
          manualByIdentity.get(`key:${identity.dedupeKey}`);
        if (!manual) return padded;
        if (
          padded[18] !== manual.status ||
          padded[19] !== manual.notes
        ) {
          padded[18] = manual.status;
          padded[19] = manual.notes;
          changed = true;
        }
        return padded;
      });
    if (changed) {
      await overwriteRows(
        sheets,
        spreadsheetId,
        sheetName,
        ACTIVE_HEADER,
        rows
      );
    }
  }
}

async function getActiveManualData(sheets, spreadsheetId) {
  const manualByIdentity = new Map();
  for (const sheetName of [
    CONFIG.spreadsheet.backendSheetName,
    CONFIG.spreadsheet.productSheetName,
    CONFIG.spreadsheet.stretchSheetName,
  ]) {
    const values = await getRows(
      sheets,
      spreadsheetId,
      sheetName
    );
    for (const row of values.slice(1)) {
      const padded = padRow(row, ACTIVE_HEADER.length);
      const manual = {
        dateFound: padded[0],
        status: normalizedStatus(padded[18]),
        notes: normalizedStatus(padded[19]),
      };
      const identity = rowIdentity(padded);
      if (identity.url) {
        manualByIdentity.set(`url:${identity.url}`, manual);
      }
      if (identity.dedupeKey) {
        manualByIdentity.set(`key:${identity.dedupeKey}`, manual);
      }
    }
  }
  return manualByIdentity;
}

async function writeToday(
  sheets,
  spreadsheetId,
  acceptedJobs,
  today,
  manualByIdentity
) {
  const shortlist = acceptedJobs
    .slice(0, CONFIG.matching.dailyShortlistLimit)
    .map((job) => {
      const row = jobToRow(job, today);
      const manual =
        manualByIdentity.get(`url:${job.url}`) ||
        manualByIdentity.get(`key:${job.dedupeKey}`);
      if (manual) {
        row[0] = manual.dateFound || row[0];
        row[18] = manual.status;
        row[19] = manual.notes;
      }
      return row;
    });
  await overwriteRows(
    sheets,
    spreadsheetId,
    CONFIG.spreadsheet.todaySheetName,
    ACTIVE_HEADER,
    shortlist
  );
}

export function withinRetention(dateFound, today, retentionDays) {
  const found = new Date(`${dateFound}T00:00:00Z`);
  const current = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(found.getTime())) return true;
  return (current - found) / 86_400_000 <= retentionDays;
}

async function writeRejectedJobs(
  sheets,
  spreadsheetId,
  rejectedJobs,
  today
) {
  const sheetName = CONFIG.spreadsheet.rejectedSheetName;
  const values = await getRows(sheets, spreadsheetId, sheetName);
  const retained = values
    .slice(1)
    .filter((row) => row.some(Boolean))
    .map((row) => padRow(row, ACTIVE_HEADER.length))
    .filter((row) =>
      withinRetention(
        row[0],
        today,
        CONFIG.spreadsheet.rejectedRetentionDays
      )
    );
  const identities = {
    urls: new Set(),
    dedupeKeys: new Set(),
  };
  for (const row of retained) {
    const identity = rowIdentity(row);
    if (identity.url) identities.urls.add(identity.url);
    if (identity.dedupeKey) {
      identities.dedupeKeys.add(identity.dedupeKey);
    }
  }
  const { fresh } = filterNewJobs(rejectedJobs, identities);
  await overwriteRows(
    sheets,
    spreadsheetId,
    sheetName,
    ACTIVE_HEADER,
    [
      ...retained,
      ...fresh.map((job) => jobToRow(job, today)),
    ]
  );
}

async function writeSourceHealth(
  sheets,
  spreadsheetId,
  sourceHealth,
  checkedAt
) {
  const sheetName = CONFIG.spreadsheet.sourceHealthSheetName;
  const current = await getRows(sheets, spreadsheetId, sheetName);
  const previousWarnings = new Map(
    current.slice(1).map((row) => [
      row[1],
      Number.parseInt(row[5], 10) || 0,
    ])
  );
  const rows = sourceHealth.map((health) => {
    const warningCount =
      health.status === "Healthy" || health.status === "Disabled"
        ? 0
        : (previousWarnings.get(health.source) || 0) + 1;
    const status =
      warningCount >= 3 ? "Unhealthy" : health.status;
    return [
      checkedAt,
      health.source,
      health.enabled ? "Yes" : "No",
      status,
      health.count,
      warningCount,
      health.message,
    ];
  });
  await overwriteRows(
    sheets,
    spreadsheetId,
    sheetName,
    SOURCE_HEALTH_HEADER,
    rows
  );
}

async function normalizeManagedJobSheets(
  sheets,
  spreadsheetId
) {
  const targets = [
    [CONFIG.spreadsheet.backendSheetName, ACTIVE_HEADER, [13, 0]],
    [CONFIG.spreadsheet.productSheetName, ACTIVE_HEADER, [13, 0]],
    [CONFIG.spreadsheet.todaySheetName, ACTIVE_HEADER, [13, 0]],
    [CONFIG.spreadsheet.stretchSheetName, ACTIVE_HEADER, [13, 0]],
    [CONFIG.spreadsheet.rejectedSheetName, ACTIVE_HEADER, [13, 0]],
    [CONFIG.spreadsheet.appliedSheetName, ACTIVE_HEADER, [13, 0]],
    [CONFIG.spreadsheet.archiveSheetName, ARCHIVE_HEADER, [13, 20, 0]],
  ];

  for (const [sheetName, header, dateColumns] of targets) {
    const values = await getRows(
      sheets,
      spreadsheetId,
      sheetName,
      columnsForHeader(header)
    );
    const rows = sortRowsNewestFirst(
      values
        .slice(1)
        .map((row) => {
          const padded = padRow(row, header.length);
          padded[8] = repairMojibake(padded[8]);
          return padded;
        }),
      dateColumns
    );
    await overwriteRows(
      sheets,
      spreadsheetId,
      sheetName,
      header,
      rows
    );
  }
}

function privateApplicationFromJobRow(row, today) {
  const padded = padRow(row, ACTIVE_HEADER.length);
  const status = normalizedStatus(padded[18]);
  const supportedStatus = ["applied", "interview", "offer", "withdrawn"].find(
    (candidate) => candidate === status.toLowerCase()
  );
  return [
    padded[7],
    padded[6],
    padded[11],
    rowIdentity(padded).dedupeKey,
    supportedStatus
      ? supportedStatus[0].toUpperCase() + supportedStatus.slice(1)
      : "Applied",
    today,
    "",
    today,
  ];
}

async function syncAppliedToPrivateRegistry(
  sheets,
  privateRegistryId,
  appliedRows,
  today
) {
  const sheetName = CONFIG.privateRegistry.applicationsSheetName;
  let values = await getRows(
    sheets,
    privateRegistryId,
    sheetName,
    "A:H"
  );
  if (!values.length) {
    await overwriteRows(
      sheets,
      privateRegistryId,
      sheetName,
      PRIVATE_APPLICATION_HEADER,
      []
    );
    values = [PRIVATE_APPLICATION_HEADER];
  }
  if (!sameRow(values[0], PRIVATE_APPLICATION_HEADER)) {
    throw new Error(
      "Unexpected private Applications header. Refusing to overwrite private data."
    );
  }

  const existingRows = values
    .slice(1)
    .filter((row) => row.some(Boolean))
    .map((row) => padRow(row, PRIVATE_APPLICATION_HEADER.length));
  const updates = [];
  const additions = [];

  for (const appliedRow of appliedRows) {
    const incoming = privateApplicationFromJobRow(appliedRow, today);
    const existingIndex = existingRows.findIndex((row) =>
      Boolean(
        (incoming[2] && row[2] === incoming[2]) ||
        (incoming[3] && row[3] === incoming[3])
      )
    );
    if (existingIndex < 0) {
      additions.push(incoming);
      existingRows.push(incoming);
      continue;
    }

    const current = existingRows[existingIndex];
    const next = [...current];
    for (const index of [0, 1, 2, 3]) {
      if (!next[index] && incoming[index]) next[index] = incoming[index];
    }
    const currentStatus = normalizedStatus(next[4]).toLowerCase();
    if (!["interview", "offer"].includes(currentStatus)) {
      next[4] = incoming[4];
    }
    if (!next[5]) next[5] = today;
    if (next[4] === "Applied") next[6] = "";
    next[7] = today;

    if (!sameRow(current, next)) {
      existingRows[existingIndex] = next;
      updates.push({
        range: a1Range(sheetName, `A${existingIndex + 2}:H${existingIndex + 2}`),
        values: [next],
      });
    }
  }

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: privateRegistryId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: updates,
      },
    });
  }
  if (additions.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: privateRegistryId,
      range: a1Range(sheetName, "A:H"),
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: additions },
    });
  }

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: privateRegistryId,
    fields: "sheets(properties(sheetId,title),tables(tableId,name,range))",
  });
  const applicationSheet = (metadata.data.sheets || []).find(
    (sheet) => sheet.properties.title === sheetName
  );
  const table = (applicationSheet?.tables || []).find(
    (candidate) => candidate.name === "ApplicationsRegistry"
  );
  if (table) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: privateRegistryId,
      requestBody: {
        requests: [
          {
            updateTable: {
              table: {
                tableId: table.tableId,
                range: {
                  sheetId: applicationSheet.properties.sheetId,
                  startRowIndex: 0,
                  endRowIndex: existingRows.length + 1,
                  startColumnIndex: 0,
                  endColumnIndex: PRIVATE_APPLICATION_HEADER.length,
                },
              },
              fields: "range",
            },
          },
        ],
      },
    });
  }

  return { added: additions.length, updated: updates.length };
}

export async function moveAppliedJobs(
  spreadsheetId,
  privateRegistryId,
  now = new Date()
) {
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEET_ID env var is missing");
  }
  if (!privateRegistryId) {
    throw new Error("PRIVATE_REGISTRY_SHEET_ID env var is missing");
  }

  const auth = buildAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const setup = await ensureSheets(sheets, spreadsheetId);
  const sourceSheetNames = [
    CONFIG.spreadsheet.backendSheetName,
    CONFIG.spreadsheet.productSheetName,
    CONFIG.spreadsheet.todaySheetName,
    CONFIG.spreadsheet.stretchSheetName,
    CONFIG.spreadsheet.rejectedSheetName,
  ];
  const appliedSheetName = CONFIG.spreadsheet.appliedSheetName;

  for (const sheetName of [...sourceSheetNames, appliedSheetName]) {
    await ensureSchema(
      sheets,
      spreadsheetId,
      sheetName,
      ACTIVE_HEADER
    );
  }
  const appliedSheet = setup.sheets.find(
    (sheet) => sheet.properties.title === appliedSheetName
  );
  if (appliedSheet) {
    await ensureFormatting(sheets, spreadsheetId, appliedSheet);
  }

  const sourceRowsBySheet = {};
  for (const sheetName of sourceSheetNames) {
    const values = await getRows(
      sheets,
      spreadsheetId,
      sheetName,
      columnsForHeader(ACTIVE_HEADER)
    );
    sourceRowsBySheet[sheetName] = values.slice(1);
  }
  const appliedValues = await getRows(
    sheets,
    spreadsheetId,
    appliedSheetName,
    columnsForHeader(ACTIVE_HEADER)
  );
  const plan = planAppliedMove(
    sourceRowsBySheet,
    appliedValues.slice(1)
  );
  if (!plan.movedCount) {
    console.log("Applied jobs: nothing new to move.");
    return { moved: 0, removed: 0, registryAdded: 0, registryUpdated: 0 };
  }

  const today = todayISO(now);
  const registryResult = await syncAppliedToPrivateRegistry(
    sheets,
    privateRegistryId,
    plan.movedRows,
    today
  );
  await overwriteRows(
    sheets,
    spreadsheetId,
    appliedSheetName,
    ACTIVE_HEADER,
    sortRowsNewestFirst(plan.appliedRows)
  );

  let removed = 0;
  for (const sheetName of sourceSheetNames) {
    const originalCount = sourceRowsBySheet[sheetName].filter((row) =>
      row.some(Boolean)
    ).length;
    const remaining = plan.remainingBySheet[sheetName];
    removed += originalCount - remaining.length;
    await overwriteRows(
      sheets,
      spreadsheetId,
      sheetName,
      ACTIVE_HEADER,
      sortRowsNewestFirst(remaining)
    );
  }
  console.log(
    `Applied jobs: ${plan.movedCount} consolidated, ${removed} view rows removed; ` +
      `${registryResult.added} private rows added, ${registryResult.updated} updated.`
  );
  return {
    moved: plan.movedCount,
    removed,
    registryAdded: registryResult.added,
    registryUpdated: registryResult.updated,
  };
}

export async function writeJobsToSheets(
  results,
  sourceHealth,
  spreadsheetId
) {
  const auth = buildAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const setup = await ensureSheets(sheets, spreadsheetId);
  const activeSheetNames = [
    CONFIG.spreadsheet.backendSheetName,
    CONFIG.spreadsheet.productSheetName,
    CONFIG.spreadsheet.todaySheetName,
    CONFIG.spreadsheet.stretchSheetName,
    CONFIG.spreadsheet.rejectedSheetName,
    CONFIG.spreadsheet.appliedSheetName,
  ];

  for (const sheetName of activeSheetNames) {
    await ensureSchema(
      sheets,
      spreadsheetId,
      sheetName,
      ACTIVE_HEADER
    );
  }
  await ensureSchema(
    sheets,
    spreadsheetId,
    CONFIG.spreadsheet.archiveSheetName,
    ARCHIVE_HEADER
  );
  await ensureSchema(
    sheets,
    spreadsheetId,
    CONFIG.spreadsheet.sourceHealthSheetName,
    SOURCE_HEALTH_HEADER
  );

  if (setup.renamedLegacy) {
    await migrateLegacyProductRows(sheets, spreadsheetId);
  }

  const currentSheets = await getSpreadsheetSheets(
    sheets,
    spreadsheetId
  );
  const formattedSheetNames = [
    ...activeSheetNames,
    CONFIG.spreadsheet.archiveSheetName,
  ];
  for (const sheet of currentSheets.filter((candidate) =>
    formattedSheetNames.includes(candidate.properties.title)
  )) {
    await ensureFormatting(sheets, spreadsheetId, sheet);
  }

  const today = todayISO();
  await syncTodayManualFields(sheets, spreadsheetId);
  await archiveActiveJobsIfDue(sheets, spreadsheetId, today);
  await writeActiveJobs(
    sheets,
    spreadsheetId,
    results,
    today
  );
  const manualByIdentity = await getActiveManualData(
    sheets,
    spreadsheetId
  );
  await writeToday(
    sheets,
    spreadsheetId,
    results.accepted,
    today,
    manualByIdentity
  );
  await writeRejectedJobs(
    sheets,
    spreadsheetId,
    results.rejected,
    today
  );
  await writeSourceHealth(
    sheets,
    spreadsheetId,
    sourceHealth,
    new Date().toISOString()
  );
  await normalizeManagedJobSheets(sheets, spreadsheetId);
}

export async function resetManagedSheets(
  spreadsheetId,
  { includeArchive = false } = {}
) {
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEET_ID env var is missing");
  }

  const auth = buildAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await ensureSheets(sheets, spreadsheetId);

  const targets = [
    [CONFIG.spreadsheet.backendSheetName, ACTIVE_HEADER],
    [CONFIG.spreadsheet.productSheetName, ACTIVE_HEADER],
    [CONFIG.spreadsheet.todaySheetName, ACTIVE_HEADER],
    [CONFIG.spreadsheet.stretchSheetName, ACTIVE_HEADER],
    [CONFIG.spreadsheet.rejectedSheetName, ACTIVE_HEADER],
    [CONFIG.spreadsheet.sourceHealthSheetName, SOURCE_HEALTH_HEADER],
  ];
  if (includeArchive) {
    targets.push([
      CONFIG.spreadsheet.archiveSheetName,
      ARCHIVE_HEADER,
    ]);
  }

  for (const [sheetName, header] of targets) {
    await overwriteRows(sheets, spreadsheetId, sheetName, header, []);
    console.log(`Reset "${sheetName}" and preserved its header.`);
  }

  await setResetDate(sheets, spreadsheetId, todayISO());
  console.log(
    includeArchive
      ? "Reset complete, including Archived Jobs."
      : "Reset complete. Archived Jobs was preserved."
  );
}
