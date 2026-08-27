import { createHash } from "node:crypto";
import {
  clarificationsForNeeds,
  interpretWithFixture,
} from "../content/scenarios";
import type {
  CalculationMetadata,
  EvidenceItem,
  InformationNeed,
  NeedInterpretation,
  RenderableResolution,
} from "../domain/types";
import {
  hashPlan,
  validateSnapshot,
  type Snapshot,
} from "../evidence/snapshot";
import type { InterpretationAdapter } from "../model/adapter";
import { redactSensitiveIdentifiers } from "../model/redaction";
import { DeterministicInterpretationAdapter } from "../model/fake-adapter";
import { executeNcrbPlan } from "../calc/ncrb-plan";
import { classifyOutcome } from "./classifier";
import {
  OpenAINarrationAdapter,
  narrateOrFallback,
} from "../model/narration-adapter.server";
import type { PreflightModule } from "./interface";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validNeed(need: InformationNeed): boolean {
  return Boolean(
    need &&
    typeof need === "object" &&
    typeof need.originalText === "string" &&
    typeof need.canonicalNeed === "string" &&
    typeof need.measure === "string" &&
    typeof need.geography === "string" &&
    typeof need.period === "string" &&
    typeof need.breakdown === "string" &&
    typeof need.informationHolder === "string" &&
    ["published", "formal", "unsure"].includes(need.resolutionPreference) &&
    Array.isArray(need.unresolvedClarifications) &&
    typeof need.scenario === "string",
  );
}

function redactedInterpretation(
  text: string,
  traceId: string,
): NeedInterpretation {
  const { redacted } = redactSensitiveIdentifiers(text);
  const needs = interpretWithFixture(redacted);
  return {
    originalText: text,
    redactedText: redacted,
    needs,
    clarifications: clarificationsForNeeds(needs).slice(0, 2),
    traceId,
  };
}

function redactedNeed(need: InformationNeed): InformationNeed {
  const redact = (value: string) => redactSensitiveIdentifiers(value).redacted;
  return {
    ...need,
    originalText: redact(need.originalText),
    canonicalNeed: redact(need.canonicalNeed),
    measure: redact(need.measure),
    geography: redact(need.geography),
    period: redact(need.period),
    breakdown: redact(need.breakdown),
    informationHolder: redact(need.informationHolder),
  };
}

function formalResponse(
  base: RenderableResolution,
  reason: string,
): RenderableResolution {
  return {
    ...base,
    outcome: "FORMAL_RESPONSE_REQUIRED",
    headline:
      "A new written response remains available for this Information Need.",
    meaning: `${base.meaning} You chose a formal response, so the related Research Finding is preserved while you decide whether to prepare a Filing Draft.`,
    recommendedAction:
      "Review the formal-response path and prepare a Filing Draft when ready.",
    researchFinding: {
      outcome: base.outcome,
      headline: base.headline,
      evidenceStatus: base.evidenceStatus,
      evidence: base.evidence,
      rows: base.rows,
    },
    formalResponseReason: reason,
  };
}

function receipt(
  source: Snapshot,
  planHash: string,
  checkedResourceIds: string[],
  gaps: string[],
  metadata?: CalculationMetadata,
) {
  return {
    snapshotHash: source.representation.hash,
    capabilityManifestHash: source.capabilityManifest.hash,
    retrievalPlanHash: planHash,
    checkedResourceIds,
    gapManifest: gaps,
    executedAt: "2026-08-27T00:00:00.000Z",
    ...(metadata
      ? {
          engineVersion: metadata.engineVersion,
          engineHash: metadata.engineHash,
          policyVersion: metadata.policyVersion,
          policyHash: metadata.policyHash,
        }
      : {}),
  };
}

function signed(value: string): string {
  return `${value.startsWith("-") ? "−" : "+"}${value.replace(/^-/, "")}`;
}

function uniqueLineage(row: {
  lineage: Record<string, import("../domain/types").GroundingReference[]>;
}): import("../domain/types").GroundingReference[] {
  const seen = new Set<string>();
  return Object.values(row.lineage)
    .flat()
    .filter((reference) => {
      const key = JSON.stringify(reference.locator);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function derivedNcrbResolution(
  need: InformationNeed,
  source: Snapshot,
  traceId: string,
): RenderableResolution {
  const execution = executeNcrbPlan(source);
  const metadata = execution.metadata;
  const rows = execution.rows.map((row) => ({
    geography: row.values.state!,
    stolen2021: row.values.stolen_2021!,
    stolen2023: row.values.stolen_2023!,
    stolenDelta: signed(row.values.stolen_delta!),
    recovery2021: row.values.recovery_2021!,
    recovery2023: row.values.recovery_2023!,
    recoveryDelta: `${signed(row.values.recovery_delta!)} pp`,
    unit: "INR crore" as const,
    lineage: uniqueLineage(row),
    calculationMetadata: metadata,
  }));
  const evidenceGroundings = rows.flatMap((row) => row.lineage);
  const base: RenderableResolution = {
    outcome: classifyOutcome({
      need: { resolutionPreference: "published" },
      execution: "CONFORMING",
      derivedFinding: true,
    }),
    headline: `${rows.length} States/UTs matched the conditions in the official table.`,
    meaning:
      "The reported value of property stolen increased while the reported recovery percentage declined between 2021 and 2023.",
    evidenceStatus:
      "Calculated from official figures—not directly stated by NCRB.",
    evidence: [
      {
        id: "ncrb-table-20a",
        sourceTitle:
          "State/UT-wise Value of Property Stolen and Recovered, 2021–2023",
        publisher: "National Crime Records Bureau, Ministry of Home Affairs",
        sourceType: "official_dataset",
        url: source.source.resourceUrl,
        alternateUrl: source.source.url,
        applicablePeriod: "2021–2023",
        extract:
          "Official table values are compared deterministically for each individual State/UT.",
        translationStatus: "original",
        grounding: evidenceGroundings,
      },
    ],
    rows,
    gaps: execution.gaps,
    searchScope:
      "The prototype Evidence Snapshot checked the NCRB Table 20A.1 CSV for 2021–2023 and excluded three declared aggregate rows.",
    recommendedAction:
      "Review the calculation and save the finding, or prepare an RTI if you still need an official response.",
    calculation: {
      operation:
        "Compare 2021 and 2023 stolen values and recovery percentages for each individual State/UT.",
      filters: [
        "2023 stolen value > 2021 stolen value",
        "2023 recovery percentage < 2021 recovery percentage",
        "exclude declared aggregate rows before comparison",
      ],
      caveat:
        "This identifies a reported data pattern, not a ranking of police performance. NCRB figures are supplied by States/UTs and may reflect differences in reporting and recording. Monetary values are in crore.",
      planHash: metadata.planHash,
    },
    calculationMetadata: metadata,
    executionReceipt: receipt(
      source,
      metadata.planHash,
      [source.source.id],
      execution.gaps,
      metadata,
    ),
    traceId,
  };
  return need.resolutionPreference === "formal"
    ? formalResponse(
        base,
        "The confirmed Information Need selected a new written response.",
      )
    : base;
}

function noFindingResolution(
  need: InformationNeed,
  source: Snapshot,
  traceId: string,
): RenderableResolution {
  const planHash = hashPlan({
    plan: "railway-in-snapshot-no-finding-v2",
    snapshot: source.representation.hash,
  });
  const gaps = [
    "The snapshot contains no supporting expenditure statement, ledger extract, work order, or contractor record for this need.",
  ];
  const base: RenderableResolution = {
    outcome: classifyOutcome({ need, execution: "IN_SCOPE_EMPTY" }),
    headline: "The checked snapshot did not support a reliable finding.",
    meaning:
      "This does not establish that the records are unavailable or unpublished. You can prepare a focused RTI for the missing records.",
    evidenceStatus: "No reliable finding from the checked snapshot",
    evidence: [],
    rows: [],
    gaps,
    searchScope:
      "The prototype Evidence Snapshot checked its registered Northern Railway filing fixture and found no supporting records.",
    recommendedAction: "Prepare a focused RTI asking for the missing records.",
    executionReceipt: receipt(
      source,
      planHash,
      ["northern-railway-filing-fixture"],
      gaps,
    ),
    traceId,
  };
  return need.resolutionPreference === "formal"
    ? formalResponse(
        base,
        "The confirmed Information Need selected a new written response.",
      )
    : base;
}

function syntheticFixtureResolution(
  need: InformationNeed,
  traceId: string,
): RenderableResolution {
  const evidence: EvidenceItem = {
    id: "previous-rti-response-fixture",
    sourceTitle: "Fictional RTI Response Fixture",
    publisher: "Synthetic demonstration authority",
    sourceType: "rti_response_fixture",
    url: "https://example.invalid/rti-response-fixture",
    applicablePeriod: "Not specified",
    extract: "Fictional RTI Response Fixture—not an official response.",
    translationStatus: "original",
    grounding: [
      {
        sourceBlobHash: "synthetic-fixture",
        representationHash: "synthetic-fixture-v1",
        locator: {
          kind: "jsonPointer",
          pointer: "/syntheticFixtures/previous-rti-response-fixture",
        },
        locatedContent:
          "Fictional RTI Response Fixture—not an official response.",
        locatedContentHash: "synthetic-fixture",
        extractionMethod: "fixture-json",
        extractionVersion: "fixture-v1",
        confidence: "exact",
      },
    ],
  };
  const base: RenderableResolution = {
    outcome: "SOURCE_RESOLVED",
    headline: "A synthetic earlier RTI response fixture is available.",
    meaning:
      "This example demonstrates how a previous response could be displayed. It is fictional and does not represent an official response.",
    evidenceStatus: "Found through a synthetic RTI Response Fixture",
    evidence: [evidence],
    rows: [],
    gaps: [],
    searchScope:
      "The prototype checked its clearly labelled synthetic RTI Response Fixture.",
    recommendedAction: "Review the fixture, or prepare a new RTI.",
    traceId,
  };
  return need.resolutionPreference === "formal"
    ? formalResponse(
        base,
        "The confirmed Information Need selected a new written response.",
      )
    : base;
}

function resolveNeed(
  need: InformationNeed,
  source: Snapshot,
  traceId: string,
): RenderableResolution {
  if (
    need.scenario === "ncrb-property" &&
    need.informationHolder === "National Crime Records Bureau" &&
    /property stolen/i.test(need.measure) &&
    /recovery|percentage/i.test(need.measure) &&
    need.geography.toLocaleLowerCase().includes("states") &&
    need.period.includes("2021") &&
    need.period.includes("2023")
  )
    return derivedNcrbResolution(need, source, traceId);
  if (need.scenario === "railway-filing")
    return noFindingResolution(need, source, traceId);
  if (need.scenario === "epfo-status")
    return {
      outcome: "OFFICIAL_SERVICE_ROUTE",
      headline: "This looks like a personal EPF record.",
      meaning:
        "An authenticated EPFO service route is the appropriate first place to check your own claim status. No account details are needed here.",
      evidenceStatus: "Official service route",
      evidence: [
        {
          id: "epfo-claim-status-route",
          sourceTitle: "EPFO Know Your Claim Status",
          publisher: "Employees' Provident Fund Organisation",
          sourceType: "official_service_route",
          url: "https://passbook.epfindia.gov.in/MemberPassBook/login",
          applicablePeriod: "Current own-record claim status",
          extract:
            "The official EPFO service provides a route for a member to check the status of their own claim. This prototype does not enter or transmit account details.",
          translationStatus: "original",
          grounding: [
            {
              sourceBlobHash: "official-epfo-route",
              representationHash: "official-epfo-route-2026-08",
              locator: {
                kind: "jsonPointer",
                pointer: "/services/claim-status",
              },
              locatedContent: "EPFO Know Your Claim Status",
              locatedContentHash: "official-epfo-route",
              extractionMethod: "official-route-record",
              extractionVersion: "route-v1",
              confidence: "exact",
            },
          ],
        },
      ],
      rows: [],
      gaps: [],
      searchScope:
        "The prototype does not retrieve personal records or accept account identifiers.",
      recommendedAction: "Open the official EPFO service route yourself.",
      traceId,
    };
  if (need.scenario === "previous-rti")
    return syntheticFixtureResolution(need, traceId);
  const grievance =
    /\b(why|failed|delay|delayed|complaint|grievance|problem)\b/i.test(
      `${need.originalText} ${need.canonicalNeed}`,
    );
  return {
    outcome: classifyOutcome({ need, execution: "OUT_OF_SNAPSHOT" }),
    headline: "This request is outside the prototype Evidence Snapshot.",
    meaning:
      "The prototype cannot claim that the information is unavailable or unpublished. You can review the scope, edit the need, or prepare a Filing Draft.",
    evidenceStatus: "Outside the prototype Evidence Snapshot",
    evidence: [],
    rows: [],
    gaps: [
      "The requested authority or publication is not registered in this snapshot.",
    ],
    searchScope:
      "The prototype checked its Capability Manifest and found no registered source for this need.",
    recommendedAction: grievance
      ? "Prepare a records-focused Filing Draft asking for orders, notes, reports, or correspondence rather than an explanation of why."
      : "Review Search Scope, edit the Information Need, or prepare a Filing Draft.",
    coverageManifest: {
      capabilityManifestHash: source.capabilityManifest.hash,
      checkedAuthority: need.informationHolder,
      checkedResourceIds: source.capabilityManifest.resourceIds.slice(),
      limitation:
        "Only registered authorities, measures, periods, and source types were checked.",
    },
    traceId,
  };
}

export class RTIPreflightModule implements PreflightModule {
  constructor(
    private readonly adapter: InterpretationAdapter = new DeterministicInterpretationAdapter(),
  ) {}
  interpret(input: {
    text: string;
    traceId: string;
  }): Promise<NeedInterpretation> {
    return this.adapter.interpret(input);
  }
  async resolve(input: {
    need: InformationNeed;
    snapshot: Snapshot;
  }): Promise<RenderableResolution> {
    if (!validNeed(input.need)) throw new Error("INVALID_NEED");
    validateSnapshot(input.snapshot);
    const result = {
      ...resolveNeed(
        input.need,
        input.snapshot,
        sha256(input.need.originalText).slice(0, 16),
      ),
      narration: "deterministic" as const,
    };
    if (!process.env.OPENAI_API_KEY) return result;
    return narrateOrFallback({
      adapter: new OpenAINarrationAdapter(),
      need: redactedNeed(input.need),
      result,
      traceId: result.traceId,
    });
  }
}

export function createOfflinePreflightModule(): RTIPreflightModule {
  return new RTIPreflightModule({
    interpret: async ({ text, traceId }) =>
      redactedInterpretation(text, traceId),
  });
}
