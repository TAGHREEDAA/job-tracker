import nodemailer from "nodemailer";

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
  const password = env.GMAIL_APP_PASSWORD;
  const recipient = env.NOTIFICATION_EMAIL;
  if (!sender || !password || !recipient) {
    console.log("Email notification: Gmail secrets are incomplete; skipped.");
    return { sent: false, reason: "unconfigured" };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: sender, pass: password },
  });
  const message = buildJobEmail(jobs, now);
  await transporter.sendMail({
    from: `Job Tracker <${sender}>`,
    to: recipient,
    ...message,
  });
  console.log(`Email notification: sent ${jobs.length} recommended jobs.`);
  return { sent: true, count: jobs.length };
}
