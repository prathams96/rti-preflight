import type {
  Clarification,
  InformationNeed,
  ScenarioId,
} from "../domain/types";
import { resolveAuthorityName } from "../model/authority-registry";
import { classifyEpfoRecordSubject } from "../service/epfo-route";

export const SCENARIO_PROMPTS = [
  {
    id: "ncrb-property" as const,
    label: "Explore hidden public data",
    hiLabel: "सार्वजनिक आँकड़ों में छिपा पैटर्न देखें",
    prompt:
      "Between 2021 and 2023, which States/UTs reported an increase in the value of property stolen but a decline in the percentage recovered?",
    hiPrompt:
      "2021 और 2023 के बीच किन राज्यों/केंद्र शासित प्रदेशों में रिपोर्ट की गई चोरी की संपत्ति का मूल्य बढ़ा लेकिन बरामदगी प्रतिशत घटा?",
  },
  {
    id: "previous-rti" as const,
    label: "Find an earlier RTI response",
    hiLabel: "पिछला RTI उत्तर खोजें",
    prompt:
      "Find an earlier RTI response relevant to a selected Central information need.",
    hiPrompt: "चुनी गई केंद्रीय सूचना-ज़रूरत से संबंधित पिछला RTI उत्तर खोजें।",
  },
  {
    id: "railway-filing" as const,
    label: "Prepare a new RTI",
    hiLabel: "नई RTI तैयार करें",
    prompt:
      "How much was spent maintaining lifts and escalators at New Delhi Railway Station during FY 2024–25, and which contractors received the work?",
    hiPrompt:
      "वित्तीय वर्ष 2024–25 में नई दिल्ली रेलवे स्टेशन पर लिफ्ट और एस्केलेटर के रखरखाव पर कितना खर्च हुआ और किन ठेकेदारों को काम मिला?",
  },
  {
    id: "epfo-status" as const,
    label: "Check an EPF claim",
    hiLabel: "EPF दावा जाँचें",
    prompt: "What is the status of my EPF claim?",
    hiPrompt: "मेरे EPF दावे की स्थिति क्या है?",
  },
] satisfies ReadonlyArray<{
  id: ScenarioId;
  label: string;
  hiLabel: string;
  prompt: string;
  hiPrompt: string;
}>;

export const CPCB_CONFLICT_DECISION = {
  status: "cut" as const,
  decidedAt: "2026-08-27",
  reason:
    "No pair of official CPCB publications has been approved as materially conflicting, scope-compatible evidence for this prototype. The scenario is disabled until that evidence gate passes.",
  reviewedSources: [
    {
      url: "https://cpcb.nic.in/publications-3/",
      retrievedAt: "2026-08-27",
      authority: "Central Pollution Control Board",
      measure: "Publication and air-quality-data catalogue",
      geography: "Not a measurement representation",
      period: "Not specified",
      unit: "Not specified",
      methodology: "Index/navigation page",
      applicability: "Not comparable evidence for a material conflict",
    },
    {
      url: "https://cpcb.nic.in/Introduction/",
      retrievedAt: "2026-08-27",
      authority: "Central Pollution Control Board",
      measure: "National Air Monitoring Programme description",
      geography: "National programme and an ITO example",
      period: "Not specified",
      unit: "Not specified",
      methodology: "Programme description, not a paired publication value",
      applicability: "Not comparable evidence for a material conflict",
    },
    {
      url: "https://cpcb.nic.in/openpdffile.php?id=UmVwb3J0RmlsZXMvMTY2OV8xNzI3NDE0NTc1X21lZGlhcGhvdG8yOTAyNy5wZGY%3D",
      retrievedAt: "2026-08-27",
      authority: "Central Pollution Control Board",
      measure: "Ambient air quality monitoring and annual pollutant values",
      geography: "Million-plus cities and monitoring stations",
      period: "2022–23",
      unit: "µg/m³ for reported criteria pollutants",
      methodology: "NAMP and CAAQMS contexts are described separately",
      applicability:
        "Single official report; no compatible disagreeing counterpart approved",
    },
  ],
} as const;

const DEFAULT_PREFERENCE = "unsure" as const;

const ENGLISH_DRAFTING_ACTION =
  "(?:prepare|draft|write|file|submit|make|create)";
const HINDI_DRAFTING_ACTION =
  "(?:तैयार|ड्राफ्ट|लिख|दाखिल|फाइल|बना|prepare|draft|write|file|submit|make|create)";
const ENGLISH_RTI_OBJECT = "(?:a\\s+|an\\s+|the\\s+)?(?:new\\s+)?rti\\b";
const RTI_REFERENCE = "(?:आरटीआई|rti)";

const EXPLICIT_ENGLISH_DRAFTING_INTENT = new RegExp(
  `\\b(?:help(?:\\s+me)?(?:\\s+to)?\\s+)?${ENGLISH_DRAFTING_ACTION}\\s+${ENGLISH_RTI_OBJECT}|\\b(?:please\\s+)?help(?:\\s+me)?(?:\\s+to)?\\s+${ENGLISH_DRAFTING_ACTION}\\s+(?:an?\\s+)?rti\\b|\\b(?:i\\s+want|i\\s+need|please)\\s+(?:to\\s+)?${ENGLISH_DRAFTING_ACTION}\\s+(?:an?\\s+)?rti\\b|\\brti\\b[\\s\\S]{0,70}\\b${ENGLISH_DRAFTING_ACTION}\\b`,
  "i",
);

const EXPLICIT_HINDI_OR_MIXED_DRAFTING_INTENT = new RegExp(
  `(?:${RTI_REFERENCE})[\\s\\S]{0,80}${HINDI_DRAFTING_ACTION}(?:\\s+करना\\s+है)?|${HINDI_DRAFTING_ACTION}[\\s\\S]{0,80}(?:${RTI_REFERENCE})`,
  "iu",
);

const ENGLISH_NEGATION =
  "(?:don't|dont|do\\s+not|doesn't|does\\s+not|didn't|did\\s+not|won't|will\\s+not|wouldn't|would\\s+not|can't|cannot|can\\s+not|shouldn't|should\\s+not|never|not\\s+(?:want|need|wish|intend|plan|looking|trying|going|willing))";
const HINDI_NEGATION = "(?:नहीं|नही|\\bnahi\\b|\\bnahin\\b|मत|\\bmat\\b)";

const NEGATED_ENGLISH_DRAFTING_INTENT = new RegExp(
  `(?:\\b${ENGLISH_NEGATION}\\b[\\s\\S]{0,60}\\b${ENGLISH_DRAFTING_ACTION}\\s+${ENGLISH_RTI_OBJECT}|\\bnot\\s+(?:to\\s+)?${ENGLISH_DRAFTING_ACTION}\\s+${ENGLISH_RTI_OBJECT})`,
  "i",
);

const NEGATED_HINDI_OR_MIXED_DRAFTING_INTENT = new RegExp(
  `(?:${RTI_REFERENCE})[\\s\\S]{0,48}${HINDI_NEGATION}[\\s\\S]{0,32}${HINDI_DRAFTING_ACTION}|(?:${RTI_REFERENCE})[\\s\\S]{0,48}${HINDI_DRAFTING_ACTION}[\\s\\S]{0,24}${HINDI_NEGATION}(?:\\s+(?:करना|करनी|करने|करूँ|करता|करती|चाहता|चाहती|है|हूँ|हैं|hai|hoon|karna|karni|karne|chahta|chahti))?|${HINDI_NEGATION}[\\s\\S]{0,48}${RTI_REFERENCE}[\\s\\S]{0,48}${HINDI_DRAFTING_ACTION}`,
  "iu",
);

/**
 * Detect an explicit request to prepare, write, draft, or file a new RTI.
 * This is deterministic routing metadata, not a model-generated conclusion.
 */
export function hasExplicitDraftingIntent(text: string): boolean {
  const normalized = text.replace(/[“”‘’]/g, "'");
  const clauses = normalized.split(
    /(?:[.!?,;:]+|\b(?:but|however|instead)\b|(?:पर|लेकिन|बल्कि))/iu,
  );

  return clauses.some((clause) => {
    const hasPositiveIntent =
      EXPLICIT_ENGLISH_DRAFTING_INTENT.test(clause) ||
      EXPLICIT_HINDI_OR_MIXED_DRAFTING_INTENT.test(clause);
    if (!hasPositiveIntent) return false;

    return (
      !NEGATED_ENGLISH_DRAFTING_INTENT.test(clause) &&
      !NEGATED_HINDI_OR_MIXED_DRAFTING_INTENT.test(clause)
    );
  });
}

/** Existing NCRB evidence may still be shown; other explicit RTI goals draft directly. */
export function shouldPreferDraftingRoute(
  need: Pick<InformationNeed, "draftingIntent" | "scenario">,
): boolean {
  return Boolean(need.draftingIntent && need.scenario !== "ncrb-property");
}

/**
 * Classify a single model-returned need from its own canonical content,
 * independent of sibling needs or any seeded fixture normalization applied to
 * another index. Drafting intent is a citizen-level signal, so a synthetic
 * previous-response still must not surface as a search scenario.
 */
export function scenarioForModelNeed(
  content: string,
  hasDraftingIntent: boolean,
): ScenarioId {
  if (
    hasDraftingIntent &&
    /(?:earlier|previous|पुरानी|पिछली|पहले की)\s*(?:rti|आरटीआई)/iu.test(content)
  )
    return "unsupported";
  return scenarioForText(content);
}

export function scenarioForText(text: string): ScenarioId {
  const normalized = text.toLocaleLowerCase();
  // An explicit drafting goal must not be mistaken for the synthetic
  // previous-response example just because both mention an earlier RTI.
  if (
    hasExplicitDraftingIntent(text) &&
    /(?:earlier|previous|पुरानी|पिछली|पहले की)\s*(?:rti|आरटीआई)/iu.test(text)
  )
    return "unsupported";
  if (
    (normalized.includes("property") && normalized.includes("stolen")) ||
    (text.includes("चोरी") && text.includes("संपत्ति"))
  )
    return "ncrb-property";
  if (
    normalized.includes("railway") ||
    normalized.includes("escalator") ||
    normalized.includes("lift") ||
    text.includes("रेलवे") ||
    text.includes("एस्केलेटर") ||
    text.includes("लिफ्ट")
  ) {
    return "railway-filing";
  }
  if (
    normalized.includes("epf") ||
    normalized.includes("epfo") ||
    normalized.includes("provident fund") ||
    text.includes("EPF") ||
    text.includes("भविष्य निधि")
  ) {
    return "epfo-status";
  }
  // The CPCB conflict gate is explicitly cut until two compatible official
  // representations are approved. Never turn a free-text query into a
  // fabricated conflict scenario.
  if (normalized.includes("cpcb") || normalized.includes("air quality"))
    return "unsupported";
  if (
    normalized.includes("earlier rti") ||
    normalized.includes("previous rti") ||
    text.includes("पिछला RTI")
  )
    return "previous-rti";
  return "unsupported";
}

function needForScenario(
  text: string,
  id: ScenarioId,
  suffix = "1",
): InformationNeed {
  const common = {
    id: `${id}-${suffix}`,
    originalText: text,
    breakdown: "Not yet specified",
    resolutionPreference: DEFAULT_PREFERENCE,
    unresolvedClarifications: [] as string[],
    scenario: id,
    informationHolderStatus: "unverified" as const,
    draftingIntent: hasExplicitDraftingIntent(text),
  };

  switch (id) {
    case "ncrb-property":
      return {
        ...common,
        canonicalNeed:
          "Identify individual States/UTs where reported property stolen increased and recovery percentage declined between 2021 and 2023.",
        measure: "Value of property stolen and percentage recovered",
        geography: "All States/UTs",
        period: "2021 versus 2023",
        breakdown: "State / UT",
        informationHolder: "National Crime Records Bureau",
        informationHolderStatus: "verified",
      };
    case "railway-filing":
      return {
        ...common,
        canonicalNeed:
          "Records of lift and escalator maintenance expenditure and contractors at New Delhi Railway Station.",
        measure:
          "Maintenance expenditure, work orders, contracts, and contractor names",
        geography: "New Delhi Railway Station",
        period: "Financial year 2024–25",
        breakdown: "Contractor",
        informationHolder: "Northern Railway",
        informationHolderStatus: "verified",
      };
    case "epfo-status": {
      const subject = classifyEpfoRecordSubject(text);
      const recordSubject =
        subject === "own-record"
          ? "own"
          : subject === "another-person"
            ? "another"
            : "unspecified";
      const subjectFields =
        recordSubject === "own"
          ? {
              canonicalNeed: "The status of the citizen's own EPF claim.",
              measure: "Status of my EPF claim",
              geography: "My EPFO account",
            }
          : recordSubject === "another"
            ? {
                canonicalNeed:
                  "A record concerning another person's EPF claim, subject to lawful access.",
                measure: "Status of another person's EPF claim",
                geography: "Another person's EPFO account",
              }
            : {
                canonicalNeed:
                  "An EPF claim record whose subject must be confirmed.",
                measure: "Status of an EPF claim",
                geography: "EPFO account subject to confirmation",
              };
      return {
        ...common,
        ...subjectFields,
        period: "Current claim",
        breakdown: "Claim",
        informationHolder: "Employees' Provident Fund Organisation",
        informationHolderStatus: "verified",
        recordSubject,
      };
    }
    case "previous-rti":
      return {
        ...common,
        canonicalNeed:
          "A previously issued response relevant to a Central information need.",
        measure: "Relevant earlier RTI response",
        geography: "A selected Central public authority",
        period: "Not specified",
        breakdown: "Public authority",
        informationHolder: "Central public authority",
        informationHolderStatus: "unverified",
      };
    case "cpcb-conflict":
      return {
        ...common,
        canonicalNeed:
          "Compare an air-quality metric represented differently in two CPCB publications.",
        measure: "Air-quality metric",
        geography: "As covered by the publications",
        period: "Applicable publication periods",
        breakdown: "Publication",
        informationHolder: "Central Pollution Control Board",
        informationHolderStatus: "verified",
      };
    default:
      return {
        ...common,
        canonicalNeed: text.trim() || "An unspecified public-information need.",
        measure: "The public record or measure requested",
        geography: "Not yet specified",
        period: "Not yet specified",
        informationHolder: "To be confirmed",
        unresolvedClarifications: [
          "Which municipal corporation or city, and which financial year should be checked?",
        ],
      };
  }
}

export function interpretWithFixture(text: string): InformationNeed[] {
  const fragments = text
    .split(/\s+(?:also|and separately|plus separately)\s+/i)
    .map((fragment) => fragment.trim())
    .filter(Boolean);
  return fragments.map((fragment, index) => {
    const need = needForScenario(
      fragment,
      scenarioForText(fragment),
      String(index + 1),
    );
    const authority = resolveAuthorityName(need.informationHolder);
    return authority
      ? {
          ...need,
          informationHolder: authority.name,
          informationHolderStatus: "verified" as const,
        }
      : need;
  });
}

export function clarificationsForNeeds(
  needs: InformationNeed[],
): Clarification[] {
  return needs.flatMap((need) =>
    need.unresolvedClarifications.map((question, index) => ({
      id: `${need.id}-clarification-${index + 1}`,
      question,
      blocking: true,
      options: ["I’m not sure"],
    })),
  );
}
