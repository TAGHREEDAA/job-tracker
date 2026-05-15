// All configuration in one place — edit this to tune the tracker.

export const CONFIG = {
  // Job titles MUST contain at least one of these keywords (case-insensitive).
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

  // Title must NOT contain any of these (case-insensitive).
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
    "lead engineer",
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

  // Location must match one of these patterns (remote-friendly to Egypt/EMEA).
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

  // Hard reject if location ONLY mentions these regions
  hardRejectLocationPatterns: [
    /^us only$/i,
    /^usa only$/i,
    /^united states only$/i,
    /^u\.s\. only$/i,
    /^canada only$/i,
    /^us\/canada$/i,
    /^americas only$/i,
  ],

  // Locations that get the ⭐ PRIORITY tag
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
    laravelio: { enabled: false },   // disabled — site structure changed, not fixed
    remotive: { enabled: true },        // NEW
    workingnomads: { enabled: true },   // NEW
    jobspresso: { enabled: true },      // NEW
  },

  // How many days back to keep listings
  maxAgeDays: 30,
};
