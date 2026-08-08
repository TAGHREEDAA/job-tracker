import { google } from "googleapis";

const SCORE_THRESHOLD = 63;

function identity(job) {
  return job.url || job.dedupeKey || `${job.company}\u0000${job.title}`;
}

function escapeHtml(value) {
  return (value || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJobUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function safeHeader(value) {
  return (value || "").toString().replace(/[\r\n]+/g, " ").trim();
}

function safeEmailAddress(value) {
  const email = safeHeader(value);
  if (!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(email)) {
    throw new Error("Invalid email notification address configuration");
  }
  return email;
}

function encodedHeader(value) {
  return `=?UTF-8?B?${Buffer.from(safeHeader(value), "utf8").toString("base64")}?=`;
}

function wrappedBase64(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") || "";
}

export function buildRawGmailMessage(message, sender, recipient) {
  const safeSender = safeEmailAddress(sender);
  const safeRecipient = safeEmailAddress(recipient);
  const boundary = `job-tracker-${Date.now().toString(36)}`;
  const mime = [
    `From: Job Tracker <${safeSender}>`,
    `To: ${safeRecipient}`,
    `Subject: ${encodedHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrappedBase64(message.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrappedBase64(message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

export function selectNotificationJobs(newJobs, todayJobs) {
  const todayIdentities = new Set(todayJobs.map(identity));
  return newJobs.filter((job) =>
    Boolean(
      todayIdentities.has(identity(job)) ||
      job.priority === "⭐ PRIORITY" ||
      Number(job.fitScore) > SCORE_THRESHOLD
    )
  );
}

export function buildJobEmail(jobs, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const subject = `Job Tracker: ${jobs.length} new recommended job${jobs.length === 1 ? "" : "s"} — ${date}`;
  const text = jobs
    .map((job, index) => {
      const url = safeJobUrl(job.url);
      return `${index + 1}. ${job.title || "Untitled role"} — ${job.company || "Unknown company"}\nScore: ${job.fitScore ?? "N/A"}${url ? `\n${url}` : ""}`;
    })
    .join("\n\n");
  const htmlItems = jobs.map((job) => {
    const url = safeJobUrl(job.url);
    const title = escapeHtml(job.title || "Untitled role");
    const linkedTitle = url
      ? `<a href="${escapeHtml(url)}">${title}</a>`
      : title;
    return `<li><strong>${linkedTitle}</strong> — ${escapeHtml(job.company || "Unknown company")}<br>Score: ${escapeHtml(job.fitScore ?? "N/A")}</li>`;
  });
  return {
    subject,
    text,
    html: `<h2>New recommended jobs</h2><ol>${htmlItems.join("")}</ol>`,
  };
}

export async function sendDailyJobEmail(
  jobs,
  env = process.env,
  now = new Date()
) {
  if (!jobs.length) {
    console.log("Email notification: no matching new jobs; skipped.");
    return { sent: false, reason: "empty" };
  }

  const sender = env.GMAIL_ADDRESS;
  const recipient = env.NOTIFICATION_EMAIL;
  const clientId = env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = env.GMAIL_OAUTH_REFRESH_TOKEN;
  if (
    !sender ||
    !recipient ||
    !clientId ||
    !clientSecret ||
    !refreshToken
  ) {
    console.log("Email notification: Gmail API secrets are incomplete; skipped.");
    return { sent: false, reason: "unconfigured" };
  }

  const message = buildJobEmail(jobs, now);
  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: oauth });
  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: buildRawGmailMessage(message, sender, recipient),
    },
  });
  console.log(`Email notification: sent ${jobs.length} recommended jobs.`);
  return { sent: true, count: jobs.length };
}
