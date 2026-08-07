# Remote Backend and Product Job Tracker

A daily recommendation system for senior PHP, Laravel, backend, full-stack,
and product-engineering roles. It collects remote listings, evaluates whether
they can hire someone in Egypt or elsewhere in Africa, scores them against a
resume-derived profile, and writes explainable recommendations to one Google
spreadsheet.

The tracker runs automatically through GitHub Actions at 06:00 UTC, which is
08:00 or 09:00 in Cairo depending on daylight-saving time.

## What it does

On every run, the tracker:

1. Fetches listings from RemoteOK, We Work Remotely, Larajobs, Remotive,
   Working Nomads, Jobspresso, Product Jobs Anywhere, and Workable.
2. Classifies roles as Laravel/PHP Backend, Backend, Product Engineer,
   backend-focused Full-Stack, Stretch, or Rejected.
3. Separates remote work from actual Egypt/Africa hiring eligibility.
4. Extracts stack, domain, product-ownership, and employment signals from the
   description text already supplied by each source.
5. Produces a 0-100 fit score with match reasons, gaps, and confidence.
6. Detects duplicates across sources using normalized company and title,
   preferring direct ATS application links.
7. Creates a ranked daily shortlist and separate active, stretch, rejected,
   archive, and source-health views.

One failing source does not stop the remaining sources from running.

## Spreadsheet organization

The tracker manages these tabs:

- **Today** — the ten highest-scoring current recommendations.
- **Backend Jobs** — active PHP, Laravel, backend, and backend-focused
  full-stack matches.
- **Product Jobs** — active Product Engineer and Software Engineer, Product
  matches.
- **Stretch Roles** — hands-on Lead, Staff, Principal, and architecture roles
  that meet the minimum review score.
- **Rejected Jobs** — rejected roles and reasons, retained for 30 days.
- **Archived Jobs** — jobs moved out of active views every two months,
  including Status and Notes.
- **Source Health** — current count, warning streak, and status for each
  source.
- **_JobTracker** — hidden maintenance metadata.

Recommendation tabs use these columns:

| Column | Purpose |
| --- | --- |
| Date Found | Date the tracker first added the job |
| Recommendation | Apply Today, Strong Match, Manual Review, Stretch, or Reject |
| Score | Explainable resume-fit score from 0 to 100 |
| Priority | `⭐ PRIORITY` for preferred locations |
| Role Category | Deterministic target-role classification |
| Eligibility | Egypt hiring eligibility decision |
| Title | Job title |
| Company | Hiring company |
| Location | Remote eligibility or region |
| Salary | Salary when supplied by the source |
| Source | Job board name |
| URL | Application link and duplicate key |
| Tags | Source-provided tags |
| Date Posted | Original posting date when available |
| Match Reasons | Positive evidence used by the scorer |
| Gaps | Missing information and rejection/review reasons |
| Confidence | High, Medium, or Low based on available description data |
| Dedupe Key | Normalized cross-source identity |
| Status | Manual tracking, such as Applied or Interview |
| Notes | Manual notes |

Rows marked `⭐ PRIORITY` are automatically highlighted in green.
Status and Notes entered in **Today** are synchronized back to the matching
active Backend or Product row before the daily shortlist is refreshed.

### Existing spreadsheet migration

If the spreadsheet still has the original **Jobs** tab, the next real run:

1. Renames it to **Backend Jobs**.
2. Creates **Product Jobs**.
3. Upgrades the original 12-column schema to the recommendation schema.
4. Moves existing Product Engineer rows to **Product Jobs**.
5. Preserves existing Status and Notes values.

If a sheet contains an unknown header, the tracker stops rather than
overwriting user data.

### Automatic archive

The first real run starts the archive timer. Every two calendar months, active
Backend, Product, and Stretch rows move to **Archived Jobs**. Headers,
formatting, Status, and Notes are preserved. Current recommendations are then
added back to the active views.

Rejected jobs are retained for 30 days. Archived jobs do not block a genuinely
reposted role from appearing again.

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
the spreadsheet should contain the recommendation tabs listed above.

The workflow will continue running automatically every day.

### Manual reset

Use **Actions → Reset Job Tracker Sheets → Run workflow** when you want to
clear tracker-managed content without deleting the spreadsheet or its
headers. Type `RESET` in the confirmation field.

By default, the reset clears Backend Jobs, Product Jobs, Today, Stretch Roles,
Rejected Jobs, and Source Health while preserving Archived Jobs. Enable
**Also delete all rows from Archived Jobs** only when you want to delete the
archive as well. The reset and daily tracker cannot write to the spreadsheet
at the same time.

## Daily workflow

1. Open **Today**.
2. Review the score, eligibility, reasons, and gaps.
3. Review green priority rows first.
4. Open the URL and apply.
5. Update **Status** with values such as `Applied`, `Skipped`, `Rejected`, or
   `Interview`.
6. Add any useful details under **Notes**.

## Configuration

Tracker settings are in `src/config.js`:

- `sources` enables or disables each source.
- `sources.workable.queries` controls Workable role searches; the defaults
  include Laravel, PHP, backend, product-engineering, and full-stack roles.
- `sources.workable.locations` runs both global and Africa-focused searches.
- `spreadsheet` controls tab names, archive cadence, and rejected-job
  retention.
- `matching.dailyShortlistLimit` controls the Today view size.
- `matching.recommendations` controls score thresholds.
- `matching.strongSkills` contains primary resume-fit technologies.
- `matching.transferableSkills` contains acceptable adjacent technologies.
- `matching.preferredDomains` contains preferred product domains.
- `matching.productOwnershipSignals` contains product-engineering evidence.
- `matching.sourcePreference` breaks cross-source duplicate ties.
- `maxAgeDays` controls listing freshness.

Role-family and Egypt-eligibility rules live in `src/filter.js`, next to the
scoring logic and human-readable reasons.

After changing configuration, commit and push the file. The next workflow run
will use the new settings.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm test
```

`npm test` runs deterministic unit tests followed by a live-source dry-run. It
does not modify the spreadsheet. Run only the deterministic suite with:

```bash
npm run test:unit
```

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

Add a role or location rule in `src/filter.js`, or adjust the score thresholds
and resume signals in `src/config.js`.

### Too few jobs

Adjust the role or eligibility rules, lower the review threshold, add relevant
resume signals, or increase `maxAgeDays`.

### A job appears on the wrong tab

Inspect **Role Category**, **Match Reasons**, and **Gaps**. Product placement
uses explicit Product Engineer title patterns; other accepted engineering
roles go to Backend Jobs.

### A source repeatedly returns zero jobs

Check **Source Health**. One empty run is a warning; three consecutive warnings
mark the source unhealthy. The workflow log contains source-specific parser
errors when available.
