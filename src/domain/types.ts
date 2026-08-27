export type Language = "en" | "hi";

export type ResolutionPreference = "published" | "formal" | "unsure";

export type InformationNeed = {
  id: string;
  originalText: string;
  canonicalNeed: string;
  measure: string;
  geography: string;
  period: string;
  breakdown: string;
  informationHolder: string;
  informationHolderStatus: "verified" | "unverified";
  resolutionPreference: ResolutionPreference;
  unresolvedClarifications: string[];
  scenario: ScenarioId;
};

export type ScenarioId =
  | "ncrb-property"
  | "previous-rti"
  | "epfo-status"
  | "cpcb-conflict"
  | "railway-filing"
  | "unsupported";

export type NeedInterpretation = {
  originalText: string;
  redactedText: string;
  needs: InformationNeed[];
  clarifications: Clarification[];
  traceId: string;
};

export type Clarification = {
  id: string;
  question: string;
  blocking: boolean;
  options: string[];
};

export type Outcome =
  | "SOURCE_RESOLVED"
  | "DERIVED_FINDING"
  | "PARTIALLY_RESOLVED"
  | "FORMAL_RESPONSE_REQUIRED"
  | "NO_RELIABLE_FINDING"
  | "OUTSIDE_SNAPSHOT_COVERAGE"
  | "OFFICIAL_SERVICE_ROUTE";

export type GroundingReference = {
  sourceBlobHash: string;
  representationHash: string;
  locator:
    | { kind: "cell"; rowKey: string; colKey: string }
    | { kind: "jsonPointer"; pointer: string };
  locatedContent: string;
  locatedContentHash: string;
  extractionMethod: string;
  extractionVersion: string;
  confidence: "exact" | "inferred_header";
};

export type EvidenceItem = {
  id: string;
  sourceTitle: string;
  publisher: string;
  sourceType:
    "official_dataset" | "rti_response_fixture" | "official_service_route";
  url: string;
  applicablePeriod: string;
  extract: string;
  translationStatus: "original" | "machine_translated";
  grounding: GroundingReference[];
};

export type DerivedRow = {
  geography: string;
  stolen2021: string;
  stolen2023: string;
  stolenDelta: string;
  recovery2021: string;
  recovery2023: string;
  recoveryDelta: string;
  unit: "INR crore";
  lineage: GroundingReference[];
};

export type ExecutionReceipt = {
  snapshotHash: string;
  capabilityManifestHash: string;
  retrievalPlanHash: string;
  checkedResourceIds: string[];
  gapManifest: string[];
  executedAt: string;
};

export type RenderableResolution = {
  outcome: Outcome;
  headline: string;
  meaning: string;
  evidenceStatus: string;
  evidence: EvidenceItem[];
  rows: DerivedRow[];
  gaps: string[];
  searchScope: string;
  recommendedAction: string;
  calculation?: {
    operation: string;
    filters: string[];
    caveat: string;
    planHash: string;
  };
  executionReceipt?: ExecutionReceipt;
  traceId: string;
};
