const MOJIBAKE_SEQUENCE = /[\u00c2\u00c3\u00e2\u00f0][\u0080-\u00bf]/;

export function repairMojibake(value) {
  const text = (value || "").toString();
  if (!MOJIBAKE_SEQUENCE.test(text)) return text.normalize("NFC");

  const repaired = Buffer.from(text, "latin1").toString("utf8");
  return repaired.includes("\ufffd")
    ? text.normalize("NFC")
    : repaired.normalize("NFC");
}

export function normalizePublicJobText(job) {
  return {
    ...job,
    title: repairMojibake(job.title),
    company: repairMojibake(job.company),
    location: repairMojibake(job.location),
  };
}
