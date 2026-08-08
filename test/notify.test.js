import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJobEmail,
  buildRawGmailMessage,
  selectNotificationJobs,
  sendDailyJobEmail,
  sendGmailMessage,
} from "../src/notify.js";

function job(overrides = {}) {
  return {
    title: "Backend Engineer",
    company: "Example",
    url: "https://example.test/job",
    fitScore: 60,
    priority: "",
    dedupeKey: "example-backend",
    ...overrides,
  };
}

test("selects new jobs using Today OR priority OR score above 63", () => {
  const today = job({ url: "https://example.test/today", dedupeKey: "today" });
  const priority = job({ url: "https://example.test/priority", dedupeKey: "priority", priority: "⭐ PRIORITY" });
  const highScore = job({ url: "https://example.test/high", dedupeKey: "high", fitScore: 64 });
  const ordinary = job({ url: "https://example.test/ordinary", dedupeKey: "ordinary", fitScore: 63 });

  assert.deepEqual(
    selectNotificationJobs([today, priority, highScore, ordinary], [today]),
    [today, priority, highScore]
  );
});

test("builds a short email and escapes untrusted listing text", () => {
  const message = buildJobEmail([
    job({ title: "Engineer <script>", company: "A & B", fitScore: 70 }),
  ], new Date("2026-08-08T12:00:00Z"));

  assert.match(message.subject, /1 new recommended job/);
  assert.match(message.text, /Backend|Engineer/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /A &amp; B/);
});

test("builds a Gmail API MIME message without allowing header injection", () => {
  const raw = buildRawGmailMessage(
    { subject: "Daily jobs", text: "Plain text", html: "<p>HTML</p>" },
    "sender@example.com",
    "recipient@example.com"
  );
  const mime = Buffer.from(raw, "base64url").toString("utf8");

  assert.match(mime, /From: Job Tracker <sender@example.com>/);
  assert.match(mime, /Content-Type: multipart\/alternative/);
  assert.throws(
    () => buildRawGmailMessage(
      { subject: "Daily jobs", text: "Plain", html: "<p>HTML</p>" },
      "sender@example.com\r\nBcc: attacker@example.com",
      "recipient@example.com"
    ),
    /Invalid email notification address/
  );
});

test("does not send when no matching jobs exist", async () => {
  const result = await sendDailyJobEmail([], {});
  assert.deepEqual(result, { sent: false, reason: "empty" });
});

test("refuses a Gmail API send with incomplete credentials", async () => {
  await assert.rejects(
    sendGmailMessage(
      { subject: "Test", text: "Test", html: "<p>Test</p>" },
      {}
    ),
    /environment configuration is incomplete/
  );
});
