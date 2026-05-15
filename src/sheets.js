// Writes new jobs to a Google Sheet.
// Reads existing IDs so we don't duplicate.
// Uses a service account for auth (no OAuth flow).

import { google } from "googleapis";

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

async function ensureHeader(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:L1`,
  });
  const row = res.data.values?.[0];
  if (!row || row.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:L1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER_ROW] },
    });
    console.log("Header row written.");
  }
}

async function getExistingUrls(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!H2:H`, // URL column
  });
  const urls = (res.data.values || []).map((r) => r[0]).filter(Boolean);
  return new Set(urls);
}

export async function writeJobsToSheet(jobs, spreadsheetId, sheetName = "Jobs") {
  if (jobs.length === 0) {
    console.log("No jobs to write.");
    return { added: 0, skipped: 0 };
  }
  const auth = buildAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await ensureHeader(sheets, spreadsheetId, sheetName);
  const existing = await getExistingUrls(sheets, spreadsheetId, sheetName);

  const today = new Date().toISOString().slice(0, 10);
  const newRows = [];
  let skipped = 0;
  for (const j of jobs) {
    if (existing.has(j.url)) {
      skipped++;
      continue;
    }
    newRows.push([
      today,
      j.priority || "",
      j.title || "",
      j.company || "",
      j.location || "",
      j.salary || "",
      j.source || "",
      j.url || "",
      j.tags || "",
      j.datePosted || "",
      "", // Status - user fills
      "", // Notes - user fills
    ]);
  }

  if (newRows.length === 0) {
    console.log(`No new jobs. Skipped ${skipped} duplicates.`);
    return { added: 0, skipped };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:L`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: newRows },
  });

  console.log(`Added ${newRows.length} new jobs. Skipped ${skipped} duplicates.`);
  return { added: newRows.length, skipped };
}
