// Writes jobs to separate Backend Jobs and Product Jobs tabs.
// Existing URLs are skipped, priority rows are highlighted by conditional
// formatting, and managed job data is cleared every configured reset period.

import { google } from "googleapis";
import { CONFIG } from "./config.js";

const LEGACY_SHEET_NAME = "Jobs";
const METADATA_SHEET_NAME = "_JobTracker";
const RESET_DATE_CELL = "B1";
const PRIORITY_FORMULA = '=$B2="⭐ PRIORITY"';

const HEADER_ROW = [
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

function buildAuth() {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credsJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var is missing");
  }
  const creds = JSON.parse(credsJson);
  return new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
}

function a1Range(sheetName, cells) {
  const escapedName = sheetName.replaceAll("'", "''");
  return `'${escapedName}'!${cells}`;
}

function cleanTitle(value) {
  return (value || "").toLowerCase();
}

export function isProductJob(job) {
  return cleanTitle(job.title).includes("product");
}

export function splitJobsByTitle(jobs) {
  const backend = [];
  const product = [];

  for (const job of jobs) {
    (isProductJob(job) ? product : backend).push(job);
  }

  return { backend, product };
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
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });
  return response.data.sheets || [];
}

async function createSheet(
  sheets,
  spreadsheetId,
  title,
  hidden = false
) {
  const response = await sheets.spreadsheets.batchUpdate({
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
  return response.data.replies[0].addSheet.properties;
}

async function renameLegacySheet(sheets, spreadsheetId, sheetList) {
  const backendName = CONFIG.spreadsheet.backendSheetName;
  const hasBackend = sheetList.some(
    (sheet) => sheet.properties.title === backendName
  );
  const legacy = sheetList.find(
    (sheet) => sheet.properties.title === LEGACY_SHEET_NAME
  );
  if (!legacy || hasBackend) return false;

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

async function ensureManagedSheets(sheets, spreadsheetId) {
  let sheetList = await getSpreadsheetSheets(sheets, spreadsheetId);
  const renamedLegacy = await renameLegacySheet(
    sheets,
    spreadsheetId,
    sheetList
  );
  if (renamedLegacy) {
    sheetList = await getSpreadsheetSheets(sheets, spreadsheetId);
  }

  const requiredSheets = [
    {
      title: CONFIG.spreadsheet.backendSheetName,
      hidden: false,
    },
    {
      title: CONFIG.spreadsheet.productSheetName,
      hidden: false,
    },
    { title: METADATA_SHEET_NAME, hidden: true },
  ];

  for (const required of requiredSheets) {
    if (
      !sheetList.some(
        (sheet) => sheet.properties.title === required.title
      )
    ) {
      await createSheet(
        sheets,
        spreadsheetId,
        required.title,
        required.hidden
      );
    }
  }

  return {
    renamedLegacy,
    sheets: await getSpreadsheetSheets(sheets, spreadsheetId),
  };
}

async function ensureHeader(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: a1Range(sheetName, "A1:L1"),
  });
  const row = response.data.values?.[0];
  if (row?.length) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: a1Range(sheetName, "A1:L1"),
    valueInputOption: "RAW",
    requestBody: { values: [HEADER_ROW] },
  });
  console.log(`Header row written to "${sheetName}".`);
}

function hasPriorityFormat(sheet) {
  return (sheet.conditionalFormats || []).some((rule) =>
    rule.booleanRule?.condition?.values?.some(
      (value) => value.userEnteredValue === PRIORITY_FORMULA
    )
  );
}

async function ensurePriorityFormatting(
  sheets,
  spreadsheetId,
  sheet
) {
  if (hasPriorityFormat(sheet)) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addConditionalFormatRule: {
            index: 0,
            rule: {
              ranges: [
                {
                  sheetId: sheet.properties.sheetId,
                  startRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: HEADER_ROW.length,
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
        },
      ],
    },
  });
}

async function getExistingUrls(
  sheets,
  spreadsheetId,
  sheetName
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: a1Range(sheetName, "H2:H"),
  });
  const urls = (response.data.values || [])
    .map((row) => row[0])
    .filter(Boolean);
  return new Set(urls);
}

async function getResetDate(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: a1Range(METADATA_SHEET_NAME, `A1:${RESET_DATE_CELL}`),
  });
  return response.data.values?.[0]?.[1] || "";
}

async function setResetDate(sheets, spreadsheetId, date) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: a1Range(METADATA_SHEET_NAME, `A1:${RESET_DATE_CELL}`),
    valueInputOption: "RAW",
    requestBody: {
      values: [["Last reset", date]],
    },
  });
}

async function resetManagedSheetsIfDue(
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

  for (const sheetName of [
    CONFIG.spreadsheet.backendSheetName,
    CONFIG.spreadsheet.productSheetName,
  ]) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: a1Range(sheetName, "A2:L"),
    });
  }
  await setResetDate(sheets, spreadsheetId, today);
  console.log(
    `Cleared managed job rows after ${CONFIG.spreadsheet.resetEveryMonths} months.`
  );
  return true;
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
    range: a1Range(sheetName, "A:L"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

async function migrateLegacyProductRows(
  sheets,
  spreadsheetId
) {
  const backendName = CONFIG.spreadsheet.backendSheetName;
  const productName = CONFIG.spreadsheet.productSheetName;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: a1Range(backendName, "A2:L"),
  });
  const existingRows = response.data.values || [];
  const productRows = existingRows.filter((row) =>
    isProductJob({ title: row[2] })
  );
  if (!productRows.length) return;

  const backendRows = existingRows.filter(
    (row) => !isProductJob({ title: row[2] })
  );
  const productUrls = await getExistingUrls(
    sheets,
    spreadsheetId,
    productName
  );
  const newProductRows = productRows.filter(
    (row) => !row[7] || !productUrls.has(row[7])
  );

  await appendRows(
    sheets,
    spreadsheetId,
    productName,
    newProductRows
  );
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: a1Range(backendName, "A2:L"),
  });
  if (backendRows.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: a1Range(backendName, "A2:L"),
      valueInputOption: "RAW",
      requestBody: { values: backendRows },
    });
  }
  console.log(
    `Moved ${productRows.length} existing product jobs to "${productName}".`
  );
}

function jobToRow(job, today) {
  return [
    today,
    job.priority || "",
    job.title || "",
    job.company || "",
    job.location || "",
    job.salary || "",
    job.source || "",
    job.url || "",
    job.tags || "",
    job.datePosted || "",
    "",
    "",
  ];
}

async function writeJobGroup(
  sheets,
  spreadsheetId,
  sheetName,
  jobs,
  today
) {
  const existing = await getExistingUrls(
    sheets,
    spreadsheetId,
    sheetName
  );
  const newRows = [];
  let skipped = 0;

  for (const job of jobs) {
    if (existing.has(job.url)) {
      skipped++;
      continue;
    }
    existing.add(job.url);
    newRows.push(jobToRow(job, today));
  }

  await appendRows(sheets, spreadsheetId, sheetName, newRows);
  console.log(
    `"${sheetName}": added ${newRows.length}, skipped ${skipped} duplicates.`
  );
  return { added: newRows.length, skipped };
}

export async function writeJobsToSheets(jobs, spreadsheetId) {
  const auth = buildAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const setup = await ensureManagedSheets(sheets, spreadsheetId);
  const dataSheetNames = [
    CONFIG.spreadsheet.backendSheetName,
    CONFIG.spreadsheet.productSheetName,
  ];

  for (const sheetName of dataSheetNames) {
    await ensureHeader(sheets, spreadsheetId, sheetName);
  }
  if (setup.renamedLegacy) {
    await migrateLegacyProductRows(sheets, spreadsheetId);
  }

  for (const sheet of setup.sheets.filter((candidate) =>
    dataSheetNames.includes(candidate.properties.title)
  )) {
    await ensurePriorityFormatting(sheets, spreadsheetId, sheet);
  }

  const today = new Date().toISOString().slice(0, 10);
  await resetManagedSheetsIfDue(sheets, spreadsheetId, today);

  const grouped = splitJobsByTitle(jobs);
  const backendResult = await writeJobGroup(
    sheets,
    spreadsheetId,
    CONFIG.spreadsheet.backendSheetName,
    grouped.backend,
    today
  );
  const productResult = await writeJobGroup(
    sheets,
    spreadsheetId,
    CONFIG.spreadsheet.productSheetName,
    grouped.product,
    today
  );

  return {
    added: backendResult.added + productResult.added,
    skipped: backendResult.skipped + productResult.skipped,
  };
}
