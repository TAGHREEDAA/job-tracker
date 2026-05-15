# Job Tracker — Senior PHP/Laravel Remote Roles

Daily-running tracker that pulls Senior PHP / Laravel / Backend / Full-stack remote jobs from 4 sources, filters them, and writes new ones to a Google Sheet. Runs automatically every morning on GitHub Actions (free).

## What it does

Every day at ~8 AM Cairo time:
1. Fetches jobs from **RemoteOK**, **WeWorkRemotely**, **Larajobs**, and **Laravel.io**
2. Keeps only PHP / Laravel / Backend / Full-stack roles
3. Excludes Junior, Lead, Principal, Frontend, DevOps, etc.
4. Keeps only remote-friendly locations (rejects US-only, etc.)
5. Tags Egypt / GCC / MENA jobs as ⭐ PRIORITY
6. Adds **new** jobs to your Google Sheet (skips ones already there)

You open the Sheet on your phone, sort by Date Found, and apply to the new ones.

---

## Setup — 30 to 45 minutes, one time

### Step 1: Create the Google Sheet (2 min)

1. Go to https://sheets.google.com and create a new blank spreadsheet
2. Name it whatever you want (e.g. "Job Tracker")
3. Rename the first tab from "Sheet1" to **`Jobs`** (right-click the tab → Rename)
4. Copy the Sheet ID from the URL:
   - URL looks like: `https://docs.google.com/spreadsheets/d/`**`1AbCdEf...XYZ`**`/edit`
   - The long string between `/d/` and `/edit` is your Sheet ID
   - Save it — you'll need it in Step 4

### Step 2: Create a Google Cloud service account (10 min, free)

This gives the script permission to write to your Sheet without you logging in every day.

1. Go to https://console.cloud.google.com/
2. Top-left: click the project dropdown → **New Project** → name it "job-tracker" → Create
3. Wait ~30 seconds, then make sure the new project is selected
4. Search bar at the top: search "**Google Sheets API**" → click it → click **Enable**
5. Search bar again: search "**Service Accounts**" (under IAM & Admin)
6. Click **+ CREATE SERVICE ACCOUNT**
   - Name: `job-tracker-bot`
   - Click **Create and Continue** → **Continue** (skip role) → **Done**
7. You'll see your new service account in the list. Click on it.
8. Go to **Keys** tab → **Add Key** → **Create new key** → **JSON** → **Create**
9. A JSON file downloads. **Keep this file safe** — we'll use its content soon.
10. **Important:** Open the JSON file in a text editor. Find the `client_email` line. Copy that email (looks like `job-tracker-bot@your-project.iam.gserviceaccount.com`)

### Step 3: Share your Sheet with the service account (1 min)

1. Open your Google Sheet
2. Click **Share** (top right)
3. Paste the `client_email` you copied above
4. Set permission to **Editor**
5. **Uncheck** "Notify people" (the bot doesn't read email)
6. Click **Share**

### Step 4: Set up the GitHub repo (10 min)

1. Go to https://github.com/new
2. Repository name: `job-tracker`
3. **Private** is fine (Actions still free)
4. Click **Create repository**
5. On the next page, click **uploading an existing file**
6. Drag the entire contents of this folder into the upload area:
   - `package.json`
   - `.github/workflows/daily.yml`
   - `src/` folder with everything inside
   - This `README.md`
7. Scroll down, click **Commit changes**

### Step 5: Add your secrets to GitHub (5 min)

GitHub Secrets are encrypted env vars that your workflow can use.

1. In your repo, go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the first secret:
   - Name: `GOOGLE_SHEET_ID`
   - Value: the Sheet ID from Step 1
   - Click **Add secret**
4. Click **New repository secret** again
5. Add the second secret:
   - Name: `GOOGLE_SERVICE_ACCOUNT_JSON`
   - Value: **the entire contents of the JSON file from Step 2** (open it in a text editor, select all, copy, paste)
   - Click **Add secret**

### Step 6: Test it (2 min)

1. In your repo, go to the **Actions** tab
2. Click **Daily Job Tracker** in the left sidebar
3. Click **Run workflow** → **Run workflow** (the green button)
4. Wait ~1-2 minutes. Refresh. You should see a green checkmark.
5. Open your Google Sheet — there should be a header row plus new jobs.

✅ If you see jobs in the Sheet, you're done. It will now run every day automatically.

---

## Daily routine

1. Morning: open the Google Sheet on your phone
2. Sort by **Date Found** (column A) descending
3. Look at today's rows. ⭐ PRIORITY ones first.
4. For each interesting one: open the URL, apply.
5. Set **Status** column to "Applied" / "Skipped" / "Rejected" / "Interview"
6. Add **Notes** if useful (e.g. "Recruiter said come back in 3 months")

---

## Tuning the filter

Open `src/config.js`. You can edit:

- **`titleKeywords`** — words that MUST appear in the title (PHP, Laravel, etc.)
- **`excludeTitleKeywords`** — words that disqualify a job (Junior, Frontend, etc.)
- **`remoteFriendlyPatterns`** — locations that pass
- **`priorityLocationPatterns`** — locations that get the ⭐ tag

After editing, commit the change. The next run picks it up.

---

## Adding more sources later

Want to add another job board? Create a new file in `src/sources/` (copy `remoteok.js` as a template). Export a function. Import it in `src/index.js`. Done.

Good additions later:
- Greenhouse careers pages of specific target companies (Spatie, Automattic, etc.)
- Lever-based companies
- Specific Greenhouse boards (e.g. `https://boards.greenhouse.io/{company}.json` is a free JSON endpoint)

---

## Troubleshooting

**Workflow fails with "GOOGLE_SHEET_ID env var is missing"**
→ You haven't added the secret. Repeat Step 5.

**Workflow fails with "Permission denied" on the Sheet**
→ You forgot to share the Sheet with the service account email. Repeat Step 3.

**Some sources return 0 jobs**
→ Check the workflow logs. The site may have changed its HTML. Source files are independent — one breaking doesn't stop the others.

**Too many irrelevant jobs**
→ Tighten the filter in `src/config.js`. Add more keywords to `excludeTitleKeywords`.

**Too few jobs**
→ Loosen the filter. Remove `lead engineer` / `principal` from exclusions if you're open to those.

---

## Run locally first to test (optional)

If you have Node.js installed on your computer:

```bash
npm install
node src/index.js --dry-run
```

The `--dry-run` flag prints sample matches without writing to the Sheet.
