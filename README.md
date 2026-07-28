# Remote Backend and Product Job Tracker

A daily job tracker for senior PHP, Laravel, backend, full-stack, and product
roles. It collects remote listings from several job boards, filters them for
remote-friendly locations, and writes new matches to organized tabs in one
Google spreadsheet.

The tracker runs automatically through GitHub Actions at 06:00 UTC, which is
08:00 or 09:00 in Cairo depending on daylight-saving time.

## What it does

On every run, the tracker:

1. Fetches listings from RemoteOK, We Work Remotely, Larajobs, Remotive,
   Working Nomads, Jobspresso, and Product Jobs Anywhere.
2. Keeps titles matching the configured PHP, Laravel, backend, full-stack, or
   product keywords.
3. Excludes junior, management, frontend, mobile, DevOps, data, and other
   unwanted roles.
4. Keeps remote-friendly locations such as worldwide, EMEA, Europe, MENA,
   GCC, and Africa.
5. Marks Egypt, Cairo, GCC, and MENA-related listings as `⭐ PRIORITY`.
6. Skips jobs whose URL already exists in the destination tab.
7. Writes backend roles and product roles to separate spreadsheet tabs.

One failing source does not stop the remaining sources from running.

## Spreadsheet organization

The tracker manages two visible tabs:

- **Backend Jobs** — PHP, Laravel, backend, and full-stack matches whose title
  does not contain `product`.
- **Product Jobs** — matches whose title contains `product`.

Each tab has these columns:

| Column | Purpose |
| --- | --- |
| Date Found | Date the tracker first added the job |
| Priority | `⭐ PRIORITY` for preferred locations |
| Title | Job title |
| Company | Hiring company |
| Location | Remote eligibility or region |
| Salary | Salary when supplied by the source |
| Source | Job board name |
| URL | Application link and duplicate key |
| Tags | Source-provided tags |
| Date Posted | Original posting date when available |
| Status | Manual tracking, such as Applied or Interview |
| Notes | Manual notes |

Rows marked `⭐ PRIORITY` are automatically highlighted in green.

### Existing spreadsheet migration

If the spreadsheet still has the original **Jobs** tab, the next real run:

1. Renames it to **Backend Jobs**.
2. Creates **Product Jobs**.
3. Moves existing rows whose title contains `product` to **Product Jobs**.
4. Preserves existing Status and Notes values during the move.

The tracker also creates a hidden **_JobTracker** tab to store the last reset
date.

### Automatic reset

The first real run starts the reset timer. Every two calendar months, the
tracker clears all job rows from **Backend Jobs** and **Product Jobs**, keeps
their headers and formatting, and then adds the current matches.

The reset also removes manually entered Status and Notes values from old rows.
Other tabs in the spreadsheet are not changed.

## Setup

### 1. Create the Google spreadsheet

1. Create a blank spreadsheet at [Google Sheets](https://sheets.google.com).
2. Rename the first tab to **Jobs**.
3. Copy the spreadsheet ID from its URL. It is the value between `/d/` and
   `/edit`:

   ```text
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```

The first run will create and migrate the required tabs automatically.

### 2. Create a Google Cloud service account

1. Create or select a project in
   [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Sheets API**.
3. Open **IAM & Admin → Service Accounts**.
4. Create a service account such as `job-tracker-bot`.
5. Open its **Keys** tab and create a JSON key.
6. Keep the downloaded JSON file private.

### 3. Share the spreadsheet

Find `client_email` in the service-account JSON file, then share the
spreadsheet with that email as an **Editor**.

### 4. Configure GitHub Actions secrets

In the repository, open **Settings → Secrets and variables → Actions** and
create:

- `GOOGLE_SHEET_ID` — the spreadsheet ID.
- `GOOGLE_SERVICE_ACCOUNT_JSON` — the complete service-account JSON content.

Never commit the service-account JSON file to the repository.

### 5. Run the tracker

Open **Actions → Daily Job Tracker → Run workflow**. After the run completes,
the spreadsheet should contain the **Backend Jobs** and **Product Jobs** tabs.

The workflow will continue running automatically every day.

## Daily workflow

1. Open either job tab.
2. Review the green priority rows first.
3. Open the URL and apply.
4. Update **Status** with values such as `Applied`, `Skipped`, `Rejected`, or
   `Interview`.
5. Add any useful details under **Notes**.

## Configuration

All tracker settings are in `src/config.js`:

- `titleKeywords` — a title must contain at least one of these values.
- `excludeTitleKeywords` — a matching value rejects the title.
- `remoteFriendlyPatterns` — location patterns accepted by the tracker.
- `hardRejectLocationPatterns` — explicitly rejected location-only patterns.
- `priorityLocationPatterns` — patterns that add the priority marker.
- `sources` — enables or disables each job source.
- `spreadsheet.backendSheetName` — backend tab name.
- `spreadsheet.productSheetName` — product tab name.
- `spreadsheet.resetEveryMonths` — automatic reset interval.
- `maxAgeDays` — maximum listing age.

After changing configuration, commit and push the file. The next workflow run
will use the new settings.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm test
```

`npm test` runs the tracker in dry-run mode. It fetches and filters live jobs
but does not modify the spreadsheet.

To perform a real local write, provide the same environment variables used by
GitHub Actions and run:

```bash
npm start
```

## Adding another source

1. Add a source adapter under `src/sources/`.
2. Export its fetch function.
3. Add an enabled entry under `CONFIG.sources`.
4. Import and execute it from `src/index.js`.
5. Return jobs using the existing normalized job structure.

Source failures should be caught inside the adapter and return an empty array
so other sources continue running.

## Troubleshooting

### `GOOGLE_SHEET_ID env var is missing`

Add the `GOOGLE_SHEET_ID` Actions secret.

### `GOOGLE_SERVICE_ACCOUNT_JSON env var is missing`

Add the complete service-account JSON as an Actions secret.

### Permission denied when accessing the spreadsheet

Share the spreadsheet with the service account's `client_email` as an Editor.

### A source returns zero jobs

Review the workflow logs. A feed may be empty or its HTML structure may have
changed. Other sources will continue running.

### Too many irrelevant jobs

Add unwanted terms to `excludeTitleKeywords` or tighten the accepted location
patterns.

### Too few jobs

Add relevant terms to `titleKeywords`, loosen the location patterns, or
increase `maxAgeDays`.

### A job appears on the wrong tab

Tab assignment is title-based: titles containing `product` go to **Product
Jobs**; all other accepted titles go to **Backend Jobs**.
