import { resetManagedSheets } from "./sheets.js";

async function main() {
  if (process.env.RESET_CONFIRMATION !== "RESET") {
    throw new Error('Confirmation must be exactly "RESET".');
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const includeArchive = process.env.INCLUDE_ARCHIVE === "true";
  await resetManagedSheets(spreadsheetId, { includeArchive });
}

main().catch((error) => {
  console.error("Reset failed:", error);
  process.exit(1);
});
