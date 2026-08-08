import { moveAppliedJobs } from "./sheets.js";

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const privateRegistryId = process.env.PRIVATE_REGISTRY_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEET_ID env var is missing");
  }
  if (!privateRegistryId) {
    throw new Error("PRIVATE_REGISTRY_SHEET_ID env var is missing");
  }
  await moveAppliedJobs(spreadsheetId, privateRegistryId);
}

main().catch((error) => {
  console.error("Move applied jobs failed:", error.message);
  process.exit(1);
});
