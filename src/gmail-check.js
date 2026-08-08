import { sendGmailMessage } from "./notify.js";

try {
  await sendGmailMessage({
    subject: "Job Tracker Gmail API test",
    text: "Gmail API authorization is working. Daily job emails are ready.",
    html: "<p><strong>Gmail API authorization is working.</strong></p><p>Daily job emails are ready.</p>",
  });
  console.log("Gmail API test email sent successfully.");
} catch (error) {
  console.error("Gmail API test failed:", error.message);
  process.exitCode = 1;
}
