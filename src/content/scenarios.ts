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
    prompt:
      "Between 2021 and 2023, which States/UTs reported an increase in the value of property stolen but a decline in the percentage recovered?",
  },
  {
    id: "previous-rti" as const,
    label: "Find an earlier RTI response",
    prompt:
      "Find an earlier RTI response relevant to a selected Central information need.",
  },
  {
    id: "railway-filing" as const,
    label: "Prepare a new RTI",
    prompt:
      "How much was spent maintaining lifts and escalators at New Delhi Railway Station during FY 2024–25, and which contractors received the work?",
  },
  {
    id: "epfo-status" as const,
    label: "Check an EPF claim",
    prompt: "What is the status of my EPF claim?",
  },
] satisfies ReadonlyArray<{ id: ScenarioId; label: string; prompt: string }>;

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

export function scenarioForText(text: string): ScenarioId {
  const normalized = text.toLocaleLowerCase();
  if (normalized.includes("property") && normalized.includes("stolen"))
    return "ncrb-property";
  if (
    normalized.includes("railway") ||
    normalized.includes("escalator") ||
    normalized.includes("lift")
  ) {
    return "railway-filing";
  }
  if (
    normalized.includes("epf") ||
    normalized.includes("epfo") ||
    normalized.includes("provident fund")
  ) {
    return "epfo-status";
  }
  // The CPCB conflict gate is explicitly cut until two compatible official
  // representations are approved. Never turn a free-text query into a
  // fabricated conflict scenario.
  if (normalized.includes("cpcb") || normalized.includes("air quality"))
    return "unsupported";
  if (normalized.includes("earlier rti") || normalized.includes("previous rti"))
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
    breakdown: "As reported by each State/UT",
    resolutionPreference: DEFAULT_PREFERENCE,
    unresolvedClarifications: [] as string[],
    scenario: id,
    informationHolderStatus: "unverified" as const,
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
          "What specific public information, place, and period should be checked?",
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
