// All configuration in one place — edit this to tune the tracker.

export const CONFIG = {
  // Job titles MUST contain at least one of these keywords (case-insensitive).
  // We match on title primarily because descriptions are noisy.
  titleKeywords: [
    "php",
    "laravel",
    "backend",
    "back-end",
    "back end",
    "full stack",
    "fullstack",
    "full-stack",
  ],

  // Title must ALSO contain at least one of these seniority signals,
  // OR have NO seniority word at all (then we let it pass — could be mid).
  // We exclude clear juniors / interns.
  excludeTitleKeywords: [
    "junior",
    "jr.",
    "jr ",
    "intern",
    "internship",
    "trainee",
    "graduate",
    "entry level",
    "entry-level",
    "apprentice",
    "lead engineer", // tech leads are usually too senior; comment out if you want them
    "principal",
    "staff engineer",
    "engineering manager",
    "head of",
    "director",
    "cto",
    "frontend",
    "front-end",
    "front end",
    "ios",
    "android",
    "mobile",
    "devops",
    "sre",
    "data engineer",
    "data scientist",
    "machine learning",
    "ml engineer",
  ],

  // Location must signal remote-friendly to Egypt/EMEA.
  // If location text matches any of these, the job passes location filter.
  // If location text is empty/unknown, we keep it and let you decide.
  remoteFriendlyPatterns: [
    /remote/i,
    /worldwide/i,
    /anywhere/i,
    /global/i,
    /emea/i,
    /europe/i,
    /mena/i,
    /gcc/i,
    /africa/i,
    /work from home/i,
    /wfh/i,
  ],

  // Hard reject if location ONLY mentions these regions (no remote)
  hardRejectLocationPatterns: [
    /^us only$/i,
    /^usa only$/i,
    /^united states only$/i,
    /^u\.s\. only$/i,
    /^canada only$/i,
    /^us\/canada$/i,
    /^americas only$/i,
  ],

  // Locations that we highlight as priority (Egypt + GCC + nearby)
  // These tags appear in the Priority column of the sheet.
  priorityLocationPatterns: [
    /egypt/i,
    /cairo/i,
    /gcc/i,
    /saudi/i,
    /\bksa\b/i,
    /\buae\b/i,
    /dubai/i,
    /abu dhabi/i,
    /kuwait/i,
    /qatar/i,
    /bahrain/i,
    /oman/i,
    /mena/i,
    /middle east/i,
  ],

  // Sources to fetch from
  sources: {
    remoteok: { enabled: true },
    weworkremotely: { enabled: true },
    larajobs: { enabled: true },
    laravelio: { enabled: true },
  },

  // How many days back to keep listings (older ones get dropped)
  maxAgeDays: 30,
};
