import type {
  Clarification,
  InformationNeed,
  ScenarioId,
} from "../domain/types";
import { resolveAuthorityName } from "../model/authority-registry";

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
  {
    id: "cpcb-conflict" as const,
    label: "Compare official publications",
    prompt:
      "Compare the air-quality metric represented differently in two CPCB publications.",
  },
] satisfies ReadonlyArray<{ id: ScenarioId; label: string; prompt: string }>;

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
  if (normalized.includes("cpcb") || normalized.includes("air quality"))
    return "cpcb-conflict";
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
    case "epfo-status":
      return {
        ...common,
        canonicalNeed: "The status of the citizen's own EPF claim.",
        measure: "Status of my EPF claim",
        geography: "My EPFO account",
        period: "Current claim",
        informationHolder: "Employees' Provident Fund Organisation",
        informationHolderStatus: "verified",
      };
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
