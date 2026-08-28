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
  analysisIntent?: AnalysisIntent;
  /** The citizen explicitly asked for a new RTI draft or filing journey. */
  draftingIntent?: boolean;
  recordSubject?: "own" | "another" | "unspecified";
  presentation?: {
    language: Language;
    canonicalNeed: string;
    measure: string;
    geography: string;
    period: string;
    breakdown: string;
    informationHolder: string;
    unresolvedClarifications: string[];
  };
};

export type ScenarioId =
  | "ncrb-property"
  | "previous-rti"
  | "epfo-status"
  | "cpcb-conflict"
  | "railway-filing"
  | "unsupported";

export type AnalysisPredicate = {
  measure: string;
  comparison: "increase" | "decrease";
  fromPeriod: string;
  toPeriod: string;
};

export type AnalysisIntent = {
  predicates: AnalysisPredicate[];
  logic: "and" | "or";
  ranking?: {
    measure: string;
    direction: "asc" | "desc";
    limit: number;
  };
};

export type NeedInterpretation = {
  originalText: string;
  redactedText: string;
  needs: InformationNeed[];
  clarifications: Clarification[];
  traceId: string;
  language: Language;
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
  | "EVIDENCE_CONFLICT"
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
  url?: string;
  alternateUrl?: string;
  applicablePeriod: string;
  publicationDate?: string;
  scope?: string;
  methodology?: string;
  syntheticDisclosure?: string;
  extract: string;
  translationStatus: "original" | "machine_translated";
  grounding: GroundingReference[];
};

export type DerivedRow = {
  geography: string;
  columns: DerivedColumn[];
  stolen2021?: string;
  stolen2023?: string;
  stolenDelta?: string;
  recovery2021?: string;
  recovery2023?: string;
  recoveryDelta?: string;
  unit?: "INR crore";
  lineage: GroundingReference[];
  calculationMetadata?: CalculationMetadata;
};

export type DerivedColumn = {
  key: string;
  label: string;
  value: string;
};

export type CalculationMetadata = {
  representationHash: string;
  planHash: string;
  engineVersion: string;
  engineHash: string;
  policyVersion: string;
  policyHash: string;
};

export type ExecutionReceipt = {
  snapshotHash: string;
  capabilityManifestHash: string;
  retrievalPlanHash: string;
  checkedResourceIds: string[];
  gapManifest: string[];
  executedAt: string;
  engineVersion?: string;
  engineHash?: string;
  policyVersion?: string;
  policyHash?: string;
};

export type NarrationState = "deterministic" | "verified_model";

export type RenderableResolution = {
  outcome: Outcome;
  headline: string;
  meaning: string;
  evidenceStatus: string;
  evidence: EvidenceItem[];
  rows: DerivedRow[];
  gaps: string[];
  planningFailure?: {
    stage: "provider" | "parse" | "validation" | "execution";
    code: string;
  };
  searchScope: string;
  recommendedAction: string;
  calculation?: {
    operation: string;
    filters: string[];
    caveat: string;
    planHash: string;
  };
  executionReceipt?: ExecutionReceipt;
  calculationMetadata?: CalculationMetadata;
  narration?: NarrationState;
  narrationRejectionCode?: string;
  narrationLanguage?: Language;
  coverageManifest?: {
    capabilityManifestHash: string;
    checkedAuthority: string;
    checkedResourceIds: string[];
    limitation: string;
  };
  researchFinding?: {
    outcome: Outcome;
    headline: string;
    evidenceStatus: string;
    evidence: EvidenceItem[];
    rows: DerivedRow[];
  };
  formalResponseReason?: string;
  serviceRoute?: {
    id: string;
    purpose: string;
    officialUrl: string;
    verifiedAt: string;
    primarySourceUrls: string[];
  };
  traceId: string;
};
