// Deterministic job classification and scoring tailored to the candidate
// profile. The matcher favors explainability over opaque recommendations.

import { createHash } from "node:crypto";
import { CONFIG } from "./config.js";

const ROLE = {
  LARAVEL_BACKEND: "Laravel/PHP Backend",
  BACKEND: "Backend",
  PRODUCT_ENGINEER: "Product Engineer",
  FULL_STACK: "Backend-Focused Full-Stack",
  STRETCH: "Stretch",
  REJECTED: "Rejected Role",
  OTHER: "Other",
};

const REJECTED_TITLE_PATTERNS = [
  /\bproduct\s+manager\b/i,
  /\bproject\s+manager\b/i,
  /\bprogram\s+manager\b/i,
  /\bengineering\s+manager\b/i,
  /\bmanager,\s*engineering\b/i,
  /\bhead\s+of\b/i,
  /\bdirector\b/i,
  /\bcto\b/i,
  /\bchief technology officer\b/i,
  /\bfront[\s-]?end\b/i,
  /\bmobile\b/i,
  /\bios\b/i,
  /\bandroid\b/i,
  /\bdevops\b/i,
  /\bdevsecops\b/i,
  /\bsite reliability\b/i,
  /\bsre\b/i,
  /\bsecurity engineer\b/i,
  /\bdata engineer\b/i,
  /\bdata scientist\b/i,
  /\bmachine learning\b/i,
  /\bml engineer\b/i,
  /\b(?:ai|genai) engineer\b/i,
  /\bgenai\b/i,
  /\bartificial intelligence engineer\b/i,
  /\bqa\b/i,
  /\bquality assurance\b/i,
  /\btest engineer\b/i,
  /\bsupport engineer\b/i,
  /\bsolutions? engineer\b/i,
  /\bsolutions? architect\b/i,
  /\bsales engineer\b/i,
  /\bcustomer success\b/i,
  /\bprofessional services\b/i,
  /\bdeveloper advocate\b/i,
  /\bdeveloper marketer\b/i,
  /\brelease engineer\b/i,
  /\binfrastructure engineer\b/i,
  /\bplatform operations\b/i,
  /\bdata platform\b/i,
  /\bsecurity\b/i,
  /\biam engineer\b/i,
  /\bendpoint engineer\b/i,
];

const JUNIOR_PATTERNS = [
  /\bjunior\b/i,
  /\bjr\.?\b/i,
  /\bintern(ship)?\b/i,
  /\btrainee\b/i,
  /\bgraduate\b/i,
  /\bentry[\s-]?level\b/i,
  /\bapprentice\b/i,
  /\bassociate\s+(software|backend|product|php|full[\s-]?stack)\b/i,
];

const STRETCH_PATTERNS = [
  /\btechnical lead\b/i,
  /\btech lead\b/i,
  /\blead (backend|software|product|php|laravel|full[\s-]?stack) engineer\b/i,
  /\bstaff (backend|software|product|php|laravel|full[\s-]?stack) engineer\b/i,
  /\bprincipal (backend|software|product|php|laravel|full[\s-]?stack) engineer\b/i,
  /\b(?:software|backend|application) architect\b/i,
];

const PRODUCT_ENGINEER_PATTERNS = [
  /\bproduct engineer\b/i,
  /\bsoftware engineer[,\s-]+product\b/i,
  /\bproduct software engineer\b/i,
  /\bproduct-focused engineer\b/i,
  /\bproduct focused engineer\b/i,
  /\bproduct developer\b/i,
];

const BACKEND_PATTERNS = [
  /\bback[\s-]?end\b/i,
  /\bserver[\s-]?side\b/i,
  /\bapi engineer\b/i,
  /\bplatform engineer\b/i,
];

const LARAVEL_PATTERNS = [
  /\bphp\b/i,
  /\blaravel\b/i,
  /\bsymfony\b/i,
];

const FULL_STACK_PATTERNS = [
  /\bfull[\s-]?stack\b/i,
  /\ball[\s-]?stack\b/i,
];

const PRIMARY_STACK_MISMATCHES = [
  { label: "Java", pattern: /\bjava\b/i },
  { label: "Go", pattern: /\bgolang\b|\bgo developer\b|\bgo engineer\b/i },
  { label: "Python", pattern: /\bpython\b/i },
  { label: "Rust", pattern: /\brust\b/i },
  { label: ".NET", pattern: /\.net\b|\bc#\b/i },
  { label: "Ruby", pattern: /\bruby\b|\brails\b/i },
];

const HARD_LOCATION_REJECTIONS = [
  /\bus(?:a)?[\s/-]*only\b/i,
  /\bunited states[\s/-]*only\b/i,
  /\bu\.s\.[\s/-]*only\b/i,
  /\bcanada[\s/-]*only\b/i,
  /\bus\s*(?:\/|and|&)\s*canada\b/i,
  /\bamericas?[\s/-]*only\b/i,
  /\bnorth america[\s/-]*only\b/i,
  /\bapac[\s/-]*only\b/i,
  /\basia pacific[\s/-]*only\b/i,
];

const EXPLICIT_UNSUPPORTED_REMOTE_LOCATIONS = [
  /\b(?:united states|usa|u\.s\.|canada)\b/i,
  /\b(?:australia|new zealand|india|singapore)\b/i,
];

const DESCRIPTION_LOCATION_REJECTIONS = [
  /\bmust be (?:located|based|resident) in (?:the )?(?:us|u\.s\.|usa|united states|canada)\b/i,
  /\b(?:us|u\.s\.|usa|united states|canada) work authorization required\b/i,
];

const HYBRID_OR_OFFICE_PATTERNS = [
  /\bhybrid\b/i,
  /\bon[\s-]?site\b/i,
  /\bin[\s-]?office\b/i,
  /\boffice[\s-]?based\b/i,
];

const RESTRICTED_LOCATION_IN_TITLE_PATTERNS = [
  /\b(?:belo horizonte|campinas|florian[oó]polis|s[aã]o paulo)\b/i,
  /\bmontevideo\b/i,
  /\bmexico city\b/i,
  /\b(?:brazil|mexico|colombia|argentina|chile|peru|uruguay)\b/i,
  /\b(?:india|singapore|australia|new zealand)\b/i,
  /\b(?:united states|usa|canada)\b/i,
];

const EGYPT_MENA_PATTERNS = [
  /\begypt\b/i,
  /\bcairo\b/i,
  /\bmena\b/i,
  /\bmiddle east\b/i,
  /\bgcc\b/i,
  /\bsaudi\b/i,
  /\bksa\b/i,
  /\buae\b/i,
  /\bdubai\b/i,
  /\babu dhabi\b/i,
  /\bkuwait\b/i,
  /\bqatar\b/i,
  /\bbahrain\b/i,
  /\boman\b/i,
];

const WORLDWIDE_PATTERNS = [
  /\bworldwide\b/i,
  /\banywhere\b/i,
  /\bglobal\b/i,
  /\bwork from anywhere\b/i,
];

const EMEA_AFRICA_PATTERNS = [
  /\bemea\b/i,
  /\bafrica\b/i,
  /\b(?:north|northern|south|southern|east|eastern|west|western|central) africa\b/i,
  /\b(?:algeria|angola|benin|botswana|burkina faso|burundi|cabo verde|cape verde|cameroon|central african republic|chad|comoros|congo|c[oô]te d['’]ivoire|ivory coast|djibouti|equatorial guinea|eritrea|eswatini|ethiopia|gabon|gambia|ghana|guinea-bissau|kenya|lesotho|liberia|libya|madagascar|malawi|mali|mauritania|mauritius|morocco|mozambique|namibia|niger|nigeria|rwanda|s[aã]o tom[eé]|senegal|seychelles|sierra leone|somalia|south sudan|sudan|tanzania|togo|tunisia|uganda|zambia|zimbabwe)\b/i,
];

const EUROPE_PATTERNS = [
  /\beurope\b/i,
  /\beuropean union\b/i,
  /\beu only\b/i,
];

const REMOTE_PATTERNS = [
  /\bremote\b/i,
  /\bwork from home\b/i,
  /\bwfh\b/i,
];

const EMPLOYMENT_PATTERNS = [
  { label: "Freelance", pattern: /\bfreelance\b/i },
  { label: "Contractor", pattern: /\bcontract(or)?\b/i },
  { label: "Employer of Record", pattern: /\bemployer of record\b|\beor\b/i },
  { label: "Employee", pattern: /\bfull[\s-]?time\b|\bemployee\b/i },
];

function text(value) {
  return (value || "").toString().replace(/\s+/g, " ").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function includesAny(haystack, values) {
  const normalized = lower(haystack);
  return values.filter((value) => normalized.includes(value.toLowerCase()));
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizedCompany(value) {
  return lower(value)
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedTitle(value) {
  return lower(value)
    .replace(/\bsr\.?(?=\s|$)/g, "senior")
    .replace(/\bback[\s-]?end\b/g, "backend")
    .replace(/\bfull[\s-]?stack\b/g, "fullstack")
    .replace(/\bsoftware developer\b/g, "software engineer")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

export function createDedupeKey(job) {
  const raw = `${normalizedCompany(job.company)}\n${normalizedTitle(job.title)}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function classifyRole(job) {
  const title = text(job.title);
  const haystack = `${title} ${text(job.tags)} ${text(job.description)}`;
  const engineeringTitle =
    /\b(engineer|developer|software|programmer|architect)\b/i.test(
      title
    );

  if (!title) {
    return {
      category: ROLE.OTHER,
      rejected: true,
      reason: "Missing job title",
    };
  }
  if (matchesAny(title, JUNIOR_PATTERNS)) {
    return {
      category: ROLE.REJECTED,
      rejected: true,
      reason: "Junior or entry-level role",
    };
  }
  if (matchesAny(title, REJECTED_TITLE_PATTERNS)) {
    return {
      category: ROLE.REJECTED,
      rejected: true,
      reason: "Role family is outside the target profile",
    };
  }
  if (matchesAny(title, STRETCH_PATTERNS)) {
    return {
      category: ROLE.STRETCH,
      rejected: false,
      stretch: true,
      reason: "Hands-on lead, staff, principal, or architecture opportunity",
    };
  }
  if (matchesAny(title, PRODUCT_ENGINEER_PATTERNS)) {
    return {
      category: ROLE.PRODUCT_ENGINEER,
      rejected: false,
      reason: "Product engineering title",
    };
  }
  if (
    engineeringTitle &&
    matchesAny(haystack, LARAVEL_PATTERNS)
  ) {
    return {
      category: ROLE.LARAVEL_BACKEND,
      rejected: false,
      reason: "PHP, Laravel, or Symfony role",
    };
  }
  if (matchesAny(title, BACKEND_PATTERNS)) {
    return {
      category: ROLE.BACKEND,
      rejected: false,
      reason: "Backend engineering title",
    };
  }
  if (matchesAny(title, FULL_STACK_PATTERNS)) {
    const backendEvidence =
      matchesAny(haystack, [...LARAVEL_PATTERNS, ...BACKEND_PATTERNS]) ||
      /\b(api|database|mysql|postgres|server|services)\b/i.test(haystack);
    return {
      category: ROLE.FULL_STACK,
      rejected: false,
      manualReview: !backendEvidence,
      reason: backendEvidence
        ? "Full-stack role with backend evidence"
        : "Full-stack role with unclear backend emphasis",
    };
  }

  return {
    category: ROLE.OTHER,
    rejected: true,
    reason: "Title does not match a target engineering role",
  };
}

export function analyzeEligibility(job) {
  const title = text(job.title);
  const location = text(job.location);
  const description = text(job.description);

  if (
    matchesAny(`${title} ${location}`, HYBRID_OR_OFFICE_PATTERNS) ||
    /\b(?:must|required|expected)\b.{0,40}\b(?:office|on[\s-]?site)\b/i.test(
      description
    )
  ) {
    return {
      status: "Not eligible",
      points: 0,
      hardReject: true,
      reason: "Hybrid or office attendance required",
    };
  }
  if (matchesAny(title, RESTRICTED_LOCATION_IN_TITLE_PATTERNS)) {
    return {
      status: "Not eligible",
      points: 0,
      hardReject: true,
      reason: "Job title specifies a hiring location outside accepted regions",
    };
  }
  if (
    matchesAny(location, HARD_LOCATION_REJECTIONS) ||
    matchesAny(description, DESCRIPTION_LOCATION_REJECTIONS)
  ) {
    return {
      status: "Not eligible",
      points: 0,
      hardReject: true,
      reason: "Hiring geography or work authorization excludes Egypt",
    };
  }
  const hasAcceptedLocation = matchesAny(location, [
    ...EGYPT_MENA_PATTERNS,
    ...WORLDWIDE_PATTERNS,
    ...EMEA_AFRICA_PATTERNS,
  ]);
  if (
    !hasAcceptedLocation &&
    matchesAny(location, EXPLICIT_UNSUPPORTED_REMOTE_LOCATIONS)
  ) {
    return {
      status: "Not eligible",
      points: 0,
      hardReject: true,
      reason: "Remote role is tied to a hiring country outside accepted regions",
    };
  }
  if (matchesAny(location, EGYPT_MENA_PATTERNS)) {
    return {
      status: "Eligible - Egypt/MENA/GCC",
      points: 30,
      hardReject: false,
      reason: "Egypt, MENA, or GCC eligibility",
    };
  }
  if (matchesAny(location, WORLDWIDE_PATTERNS)) {
    return {
      status: "Eligible - Worldwide",
      points: 28,
      hardReject: false,
      reason: "Worldwide or anywhere hiring",
    };
  }
  if (matchesAny(location, EMEA_AFRICA_PATTERNS)) {
    return {
      status: "Eligible - EMEA/Africa",
      points: 27,
      hardReject: false,
      reason: "EMEA or Africa eligibility",
    };
  }
  if (matchesAny(location, EUROPE_PATTERNS)) {
    return {
      status: "Unclear - Europe only",
      points: 12,
      hardReject: false,
      manualReview: true,
      reason: "Europe-only eligibility needs manual confirmation",
    };
  }
  if (matchesAny(location, REMOTE_PATTERNS)) {
    return {
      status: "Probably eligible - Remote",
      points: 18,
      hardReject: false,
      manualReview: true,
      reason: "Remote role with unspecified international eligibility",
    };
  }
  if (!location || lower(location) === "not specified") {
    return {
      status: "Unclear",
      points: 8,
      hardReject: false,
      manualReview: true,
      reason: "Location eligibility is not specified",
    };
  }
  return {
    status: "Not eligible",
    points: 0,
    hardReject: true,
    reason: `Location is restricted to ${location}`,
  };
}

export function analyzeDescription(job) {
  const title = text(job.title);
  const description = text(job.description);
  const tags = text(job.tags);
  const haystack = `${title} ${tags} ${description}`;
  const strongSkills = includesAny(
    haystack,
    CONFIG.matching.strongSkills
  );
  const transferableSkills = includesAny(
    haystack,
    CONFIG.matching.transferableSkills
  );
  const domains = includesAny(
    haystack,
    CONFIG.matching.preferredDomains
  );
  const productSignals = includesAny(
    haystack,
    CONFIG.matching.productOwnershipSignals
  );
  const employmentTypes = EMPLOYMENT_PATTERNS.filter(({ pattern }) =>
    pattern.test(haystack)
  ).map(({ label }) => label);
  const titleMismatch = PRIMARY_STACK_MISMATCHES.find(({ pattern }) =>
    pattern.test(title)
  );
  const hasCandidatePrimaryStack = matchesAny(
    haystack,
    LARAVEL_PATTERNS
  );

  return {
    strongSkills: unique(strongSkills),
    transferableSkills: unique(transferableSkills),
    domains: unique(domains),
    productSignals: unique(productSignals),
    employmentTypes: unique(employmentTypes),
    primaryStackMismatch:
      titleMismatch && !hasCandidatePrimaryStack
        ? titleMismatch.label
        : "",
    hasUsefulDescription: description.length >= 160,
  };
}

export function isRecent(job, now = new Date()) {
  if (!job.datePosted) return true;
  const posted = new Date(job.datePosted);
  if (Number.isNaN(posted.getTime())) return true;
  const ageDays = (now.getTime() - posted.getTime()) / 86_400_000;
  return ageDays <= CONFIG.maxAgeDays;
}

export function priorityTag(job) {
  return matchesAny(text(job.location), EGYPT_MENA_PATTERNS)
    ? "⭐ PRIORITY"
    : "";
}

export function evaluateJob(job, now = new Date()) {
  const role = classifyRole(job);
  const eligibility = analyzeEligibility(job);
  const signals = analyzeDescription(job);
  const reasons = [];
  const gaps = [];

  if (job.previouslyAppliedCompany) {
    reasons.push("↩︎ Previously applied to this company");
  }

  let score = eligibility.points;
  reasons.push(eligibility.reason);

  const rolePoints = {
    [ROLE.LARAVEL_BACKEND]: 20,
    [ROLE.PRODUCT_ENGINEER]: 20,
    [ROLE.BACKEND]: 18,
    [ROLE.FULL_STACK]: 15,
    [ROLE.STRETCH]: 12,
  }[role.category] || 0;
  score += rolePoints;
  reasons.push(role.reason);

  let technologyPoints = 0;
  const hasPhpLaravel = signals.strongSkills.some((skill) =>
    ["php", "laravel"].includes(skill)
  );
  const hasSymfony = signals.strongSkills.includes("symfony");
  if (hasPhpLaravel) technologyPoints += 12;
  if (hasSymfony) technologyPoints += 5;
  technologyPoints += Math.min(
    8,
    signals.strongSkills.filter(
      (skill) => !["php", "laravel", "symfony"].includes(skill)
    ).length * 2
  );
  technologyPoints += Math.min(
    3,
    signals.transferableSkills.length
  );
  technologyPoints = clamp(technologyPoints, 0, 20);
  score += technologyPoints;
  if (signals.strongSkills.length) {
    reasons.push(
      `Relevant skills: ${signals.strongSkills.slice(0, 5).join(", ")}`
    );
  } else {
    gaps.push("No strong stack evidence in available listing text");
  }

  const seniorityPoints = /\bsenior\b|\bsr\.?\b/i.test(job.title)
    ? 10
    : role.stretch
      ? 8
      : 6;
  score += seniorityPoints;

  const domainPoints = Math.min(10, signals.domains.length * 5);
  score += domainPoints;
  if (signals.domains.length) {
    reasons.push(
      `Preferred domain: ${signals.domains.slice(0, 2).join(", ")}`
    );
  }

  const productPoints = Math.min(
    10,
    signals.productSignals.length * 2
  );
  score += productPoints;
  if (signals.productSignals.length) {
    reasons.push("Product ownership signals found");
  }

  if (signals.employmentTypes.length) {
    reasons.push(
      `Employment: ${signals.employmentTypes.join(", ")}`
    );
  }
  if (signals.primaryStackMismatch) {
    gaps.push(
      `${signals.primaryStackMismatch} appears to be the primary stack`
    );
  }
  if (!signals.hasUsefulDescription) {
    gaps.push("Description unavailable or too limited");
  }
  if (!isRecent(job, now)) {
    gaps.push(`Listing is older than ${CONFIG.maxAgeDays} days`);
  }

  score = clamp(score, 0, 100);

  let recommendation;
  const hardRejectionReasons = [];
  if (role.rejected) hardRejectionReasons.push(role.reason);
  if (eligibility.hardReject) {
    hardRejectionReasons.push(eligibility.reason);
  }
  if (signals.primaryStackMismatch) {
    hardRejectionReasons.push(
      `Primary stack mismatch: ${signals.primaryStackMismatch}`
    );
  }
  if (!isRecent(job, now)) {
    hardRejectionReasons.push("Listing is too old");
  }

  if (hardRejectionReasons.length) {
    recommendation = "Reject";
  } else if (role.stretch) {
    if (
      score >= CONFIG.matching.recommendations.manualReview
    ) {
      recommendation = "Stretch";
    } else {
      recommendation = "Reject";
      hardRejectionReasons.push(
        "Stretch role score is below the review threshold"
      );
    }
  } else if (role.manualReview || eligibility.manualReview) {
    if (
      score >= CONFIG.matching.recommendations.manualReview
    ) {
      recommendation = "Manual Review";
    } else {
      recommendation = "Reject";
      hardRejectionReasons.push(
        "Fit score is below the review threshold"
      );
    }
  } else if (
    score >= CONFIG.matching.recommendations.applyToday
  ) {
    recommendation = "Apply Today";
  } else if (
    score >= CONFIG.matching.recommendations.strongMatch
  ) {
    recommendation = "Strong Match";
  } else if (
    score >= CONFIG.matching.recommendations.manualReview
  ) {
    recommendation = "Manual Review";
  } else {
    recommendation = "Reject";
    hardRejectionReasons.push("Fit score is below the review threshold");
  }

  const confidence =
    signals.hasUsefulDescription &&
    !eligibility.manualReview
      ? "High"
      : signals.hasUsefulDescription || !eligibility.manualReview
        ? "Medium"
        : "Low";

  return {
    ...job,
    roleCategory: role.category,
    eligibility: eligibility.status,
    fitScore: score,
    recommendation,
    matchReasons: unique(reasons).join(" · "),
    gaps: unique([
      ...gaps,
      ...hardRejectionReasons,
    ]).join(" · "),
    confidence,
    dedupeKey: createDedupeKey(job),
    priority: priorityTag(job),
  };
}

function sourcePreference(job) {
  const index = CONFIG.matching.sourcePreference.indexOf(job.source);
  return index === -1
    ? CONFIG.matching.sourcePreference.length
    : index;
}

function directApplicationScore(job) {
  try {
    const hostname = new URL(job.url).hostname;
    return /greenhouse|lever|ashbyhq|workable|rippling|gem\.com/i.test(
      hostname
    )
      ? 2
      : 0;
  } catch {
    return 0;
  }
}

function betterDuplicate(left, right) {
  const directDifference =
    directApplicationScore(right) - directApplicationScore(left);
  if (directDifference) return directDifference > 0 ? right : left;

  const descriptionDifference =
    text(right.description).length - text(left.description).length;
  if (descriptionDifference) {
    return descriptionDifference > 0 ? right : left;
  }

  return sourcePreference(right) < sourcePreference(left)
    ? right
    : left;
}

export function deduplicateJobs(jobs) {
  const byKey = new Map();
  for (const job of jobs) {
    const key = job.dedupeKey || createDedupeKey(job);
    const current = byKey.get(key);
    byKey.set(key, current ? betterDuplicate(current, job) : job);
  }
  return [...byKey.values()];
}

export function limitJobsPerCompany(
  jobs,
  limit = CONFIG.matching.maxRowsPerCompany
) {
  if (!Number.isInteger(limit) || limit < 1) return [...jobs];
  const counts = new Map();
  return jobs.filter((job) => {
    const company = normalizedCompany(job.company);
    if (!company) return true;
    const count = counts.get(company) || 0;
    if (count >= limit) return false;
    counts.set(company, count + 1);
    return true;
  });
}

export function evaluateJobs(jobs, now = new Date()) {
  const evaluated = jobs.map((job) => evaluateJob(job, now));
  const deduplicated = deduplicateJobs(evaluated);
  const sorted = deduplicated.sort((left, right) => {
    if (left.fitScore !== right.fitScore) {
      return right.fitScore - left.fitScore;
    }
    return (right.datePosted || "").localeCompare(
      left.datePosted || ""
    );
  });

  const acceptedCandidates = sorted.filter((job) =>
    ["Apply Today", "Strong Match", "Manual Review"].includes(
      job.recommendation
    )
  );
  const stretchCandidates = sorted.filter(
    (job) => job.recommendation === "Stretch"
  );
  const rejectedCandidates = sorted.filter(
    (job) => job.recommendation === "Reject"
  );
  const accepted = limitJobsPerCompany(acceptedCandidates);
  const stretch = limitJobsPerCompany(stretchCandidates);
  const rejected = limitJobsPerCompany(rejectedCandidates);

  return {
    accepted,
    stretch,
    rejected,
    all: [...accepted, ...stretch, ...rejected],
    duplicateCount: evaluated.length - deduplicated.length,
    companyLimitCount:
      acceptedCandidates.length - accepted.length +
      stretchCandidates.length - stretch.length +
      rejectedCandidates.length - rejected.length,
  };
}

// Backward-compatible helper for callers that only need accepted jobs.
export function filterJobs(jobs) {
  return evaluateJobs(jobs).accepted;
}
