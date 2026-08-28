import type {
  CalculationMetadata,
  DerivedRow,
  EvidenceItem,
  ExecutionReceipt,
  GroundingReference,
  InformationNeed,
  Language,
  RenderableResolution,
} from "../domain/types";
import { redactSensitiveIdentifiers } from "../model/redaction";

export const EVIDENCE_BRIEF_VERSION = "1" as const;
export const EVIDENCE_BRIEF_DISCLOSURE =
  "Independent research assistant—not an official RTI response." as const;

export type EvidenceBriefInput = {
  need: InformationNeed;
  result: RenderableResolution;
  searchDate: string;
  language?: Language;
};

export type EvidenceBrief = {
  artifactVersion: typeof EVIDENCE_BRIEF_VERSION;
  kind: "evidence-brief";
  productName: "RTI Tathya";
  disclosure: typeof EVIDENCE_BRIEF_DISCLOSURE;
  searchDate: string;
  confirmedInformationNeed: {
    id: string;
    canonicalNeed: string;
    measure: string;
    geography: string;
    period: string;
    breakdown: string;
    informationHolder: string;
    informationHolderStatus: InformationNeed["informationHolderStatus"];
    resolutionPreference: InformationNeed["resolutionPreference"];
    unresolvedClarifications: string[];
  };
  result: {
    outcome: RenderableResolution["outcome"];
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
    calculationMetadata?: CalculationMetadata;
    coverageManifest?: NonNullable<RenderableResolution["coverageManifest"]>;
    researchFinding?: {
      outcome: RenderableResolution["outcome"];
      headline: string;
      evidenceStatus: string;
      evidence: EvidenceItem[];
      rows: DerivedRow[];
    };
    formalResponseReason?: string;
  };
};

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      freeze(child);
  }
  return value;
}

function safeText(value: string): string {
  return redactSensitiveIdentifiers(value).redacted;
}

function publicEvidence(item: EvidenceItem): EvidenceItem {
  return {
    id: item.id,
    sourceTitle: safeText(item.sourceTitle),
    publisher: safeText(item.publisher),
    sourceType: item.sourceType,
    ...(item.url === undefined ? {} : { url: item.url }),
    ...(item.alternateUrl === undefined
      ? {}
      : { alternateUrl: item.alternateUrl }),
    applicablePeriod: safeText(item.applicablePeriod),
    ...(item.publicationDate === undefined
      ? {}
      : { publicationDate: safeText(item.publicationDate) }),
    ...(item.scope === undefined ? {} : { scope: safeText(item.scope) }),
    ...(item.methodology === undefined
      ? {}
      : { methodology: safeText(item.methodology) }),
    ...(item.syntheticDisclosure === undefined
      ? {}
      : { syntheticDisclosure: safeText(item.syntheticDisclosure) }),
    extract: safeText(item.extract),
    translationStatus: item.translationStatus,
    grounding: item.grounding.map(publicGrounding),
  };
}

function publicGrounding(reference: GroundingReference): GroundingReference {
  return {
    sourceBlobHash: reference.sourceBlobHash,
    representationHash: reference.representationHash,
    locator: clone(reference.locator),
    locatedContent: safeText(reference.locatedContent),
    locatedContentHash: reference.locatedContentHash,
    extractionMethod: safeText(reference.extractionMethod),
    extractionVersion: reference.extractionVersion,
    confidence: reference.confidence,
  };
}

function publicRow(row: DerivedRow): DerivedRow {
  return {
    geography: row.geography,
    stolen2021: row.stolen2021,
    stolen2023: row.stolen2023,
    stolenDelta: row.stolenDelta,
    recovery2021: row.recovery2021,
    recovery2023: row.recovery2023,
    recoveryDelta: row.recoveryDelta,
    unit: row.unit,
    lineage: row.lineage.map(publicGrounding),
    ...(row.calculationMetadata === undefined
      ? {}
      : { calculationMetadata: clone(row.calculationMetadata) }),
  };
}

function publicReceipt(
  receipt: ExecutionReceipt | undefined,
): ExecutionReceipt | undefined {
  return receipt === undefined
    ? undefined
    : {
        snapshotHash: receipt.snapshotHash,
        capabilityManifestHash: receipt.capabilityManifestHash,
        retrievalPlanHash: receipt.retrievalPlanHash,
        checkedResourceIds: [...receipt.checkedResourceIds],
        gapManifest: [...receipt.gapManifest],
        executedAt: receipt.executedAt,
        ...(receipt.engineVersion === undefined
          ? {}
          : { engineVersion: receipt.engineVersion }),
        ...(receipt.engineHash === undefined
          ? {}
          : { engineHash: receipt.engineHash }),
        ...(receipt.policyVersion === undefined
          ? {}
          : { policyVersion: receipt.policyVersion }),
        ...(receipt.policyHash === undefined
          ? {}
          : { policyHash: receipt.policyHash }),
      };
}

function publicResearchFinding(
  finding: RenderableResolution["researchFinding"],
) {
  return finding === undefined
    ? undefined
    : {
        outcome: finding.outcome,
        headline: safeText(finding.headline),
        evidenceStatus: safeText(finding.evidenceStatus),
        evidence: finding.evidence.map(publicEvidence),
        rows: finding.rows.map(publicRow),
      };
}

function publicResult(result: RenderableResolution): EvidenceBrief["result"] {
  return {
    outcome: result.outcome,
    headline: safeText(result.headline),
    meaning: safeText(result.meaning),
    evidenceStatus: safeText(result.evidenceStatus),
    evidence: result.evidence.map(publicEvidence),
    rows: result.rows.map(publicRow),
    gaps: result.gaps.map(safeText),
    searchScope: safeText(result.searchScope),
    recommendedAction: safeText(result.recommendedAction),
    ...(result.calculation === undefined
      ? {}
      : {
          calculation: {
            operation: safeText(result.calculation.operation),
            filters: result.calculation.filters.map(safeText),
            caveat: safeText(result.calculation.caveat),
            planHash: result.calculation.planHash,
          },
        }),
    ...(publicReceipt(result.executionReceipt) === undefined
      ? {}
      : { executionReceipt: publicReceipt(result.executionReceipt) }),
    ...(result.calculationMetadata === undefined
      ? {}
      : { calculationMetadata: clone(result.calculationMetadata) }),
    ...(result.coverageManifest === undefined
      ? {}
      : { coverageManifest: clone(result.coverageManifest) }),
    ...(publicResearchFinding(result.researchFinding) === undefined
      ? {}
      : { researchFinding: publicResearchFinding(result.researchFinding) }),
    ...(result.formalResponseReason === undefined
      ? {}
      : { formalResponseReason: safeText(result.formalResponseReason) }),
  };
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function validateGrounding(reference: GroundingReference): void {
  if (
    !validHash(reference.sourceBlobHash) ||
    !validHash(reference.representationHash) ||
    !validHash(reference.locatedContentHash) ||
    reference.locatedContent.length === 0
  )
    throw new Error("EVIDENCE_BRIEF_GROUNDING_INVALID");
}

function validateEvidence(items: readonly EvidenceItem[]): void {
  for (const item of items) {
    if (item.sourceType === "rti_response_fixture") {
      if (
        !item.syntheticDisclosure ||
        !/(?:fictional|synthetic|not an official|not a real RTI response)/i.test(
          item.syntheticDisclosure,
        )
      )
        throw new Error("EVIDENCE_BRIEF_SYNTHETIC_DISCLOSURE_MISSING");
    }
    if (
      (item.sourceType === "official_dataset" ||
        item.sourceType === "official_service_route") &&
      !item.url &&
      !item.alternateUrl
    )
      throw new Error("EVIDENCE_BRIEF_SOURCE_LINK_MISSING");
    if (item.sourceType === "official_dataset" && item.grounding.length === 0)
      throw new Error("EVIDENCE_BRIEF_PROVENANCE_MISSING");
    item.grounding.forEach(validateGrounding);
  }
}

/** Validate the public, provenance-preserving shape before it is downloaded. */
export function validateEvidenceBrief(brief: EvidenceBrief): void {
  if (
    brief.artifactVersion !== EVIDENCE_BRIEF_VERSION ||
    brief.kind !== "evidence-brief" ||
    brief.disclosure !== EVIDENCE_BRIEF_DISCLOSURE ||
    !validDate(brief.searchDate)
  )
    throw new Error("EVIDENCE_BRIEF_CONTRACT_INVALID");

  validateEvidence(brief.result.evidence);
  validateEvidence(brief.result.researchFinding?.evidence ?? []);

  for (const row of brief.result.rows) {
    if (brief.result.outcome === "DERIVED_FINDING" && row.lineage.length === 0)
      throw new Error("EVIDENCE_BRIEF_LINEAGE_MISSING");
    row.lineage.forEach(validateGrounding);
  }
  for (const row of brief.result.researchFinding?.rows ?? [])
    row.lineage.forEach(validateGrounding);

  if (
    brief.result.outcome === "DERIVED_FINDING" &&
    (!brief.result.calculation || !brief.result.calculationMetadata)
  )
    throw new Error("EVIDENCE_BRIEF_CALCULATION_METADATA_MISSING");
  if (
    brief.result.outcome === "NO_RELIABLE_FINDING" &&
    !brief.result.executionReceipt
  )
    throw new Error("EVIDENCE_BRIEF_EXECUTION_RECEIPT_MISSING");
  if (
    brief.result.outcome === "OUTSIDE_SNAPSHOT_COVERAGE" &&
    !brief.result.coverageManifest
  )
    throw new Error("EVIDENCE_BRIEF_COVERAGE_MANIFEST_MISSING");
}

/** Build a detached Evidence Brief; internal trace and model-only fields are never copied. */
export function buildEvidenceBrief(input: EvidenceBriefInput): EvidenceBrief {
  const brief: EvidenceBrief = {
    artifactVersion: EVIDENCE_BRIEF_VERSION,
    kind: "evidence-brief",
    productName: "RTI Tathya",
    disclosure: EVIDENCE_BRIEF_DISCLOSURE,
    searchDate: input.searchDate,
    confirmedInformationNeed: {
      id: input.need.id,
      canonicalNeed: safeText(input.need.canonicalNeed),
      measure: safeText(input.need.measure),
      geography: safeText(input.need.geography),
      period: safeText(input.need.period),
      breakdown: safeText(input.need.breakdown),
      informationHolder: safeText(input.need.informationHolder),
      informationHolderStatus: input.need.informationHolderStatus,
      resolutionPreference: input.need.resolutionPreference,
      unresolvedClarifications:
        input.need.unresolvedClarifications.map(safeText),
    },
    result: publicResult(input.result),
  };
  validateEvidenceBrief(brief);
  return freeze(brief);
}

/** Stable JSON representation suitable for Web Share or download fallback. */
export function serializeEvidenceBrief(input: EvidenceBriefInput): string {
  return JSON.stringify(buildEvidenceBrief(input));
}
