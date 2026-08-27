import type { InformationNeed, Outcome } from "../domain/types";

export type RetrievalExecutionState =
  "CONFORMING" | "PARTIAL" | "IN_SCOPE_EMPTY" | "OUT_OF_SNAPSHOT";

export type ClassificationInput = {
  need: Pick<InformationNeed, "resolutionPreference">;
  execution: RetrievalExecutionState;
  directFinding?: boolean;
  derivedFinding?: boolean;
  evidenceConflict?: boolean;
  officialServiceRoute?: boolean;
};

/**
 * The only place where an executed retrieval state becomes a citizen outcome.
 * Model/provider failures are intentionally not representable by this type.
 */
export function classifyOutcome(input: ClassificationInput): Outcome {
  if (input.execution === "OUT_OF_SNAPSHOT") return "OUTSIDE_SNAPSHOT_COVERAGE";
  if (input.officialServiceRoute) return "OFFICIAL_SERVICE_ROUTE";
  if (input.execution === "IN_SCOPE_EMPTY") return "NO_RELIABLE_FINDING";
  if (input.evidenceConflict) return "EVIDENCE_CONFLICT";
  if (input.execution === "PARTIAL") return "PARTIALLY_RESOLVED";
  if (input.need.resolutionPreference === "formal")
    return "FORMAL_RESPONSE_REQUIRED";
  if (input.derivedFinding) return "DERIVED_FINDING";
  if (input.directFinding) return "SOURCE_RESOLVED";
  return "NO_RELIABLE_FINDING";
}
