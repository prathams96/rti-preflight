import {
  clarificationsForNeeds,
  interpretWithFixture,
} from "../content/scenarios";
import type {
  CalculationMetadata,
  EvidenceItem,
  InformationNeed,
  NeedInterpretation,
  ResultColumn,
  RenderableResolution,
  TabularResult,
  Language,
} from "../domain/types";
import {
  groundingForFixtureValue,
  hashPlan,
  validateSnapshot,
  type Snapshot,
} from "../evidence/snapshot";
import {
  resolveEpfoServiceRoute,
  classifyEpfoRecordSubject,
} from "../service/epfo-route";
import type { InterpretationAdapter } from "../model/adapter";
import { redactSensitiveIdentifiers } from "../model/redaction";
import { DeterministicInterpretationAdapter } from "../model/fake-adapter";
import { DeterministicPlanAdapter } from "../model/fake-plan-adapter";
import { measureBinding, type PlanAdapter } from "../model/plan-adapter";
import { OpenAICalcPlanAdapter } from "../model/openai-plan-adapter.server";
import { normalizeTraceId } from "../observability";
import {
  executePlan,
  type CalcPlan,
  type RegisteredMeasure,
  type RegisteredTable,
} from "../calc/registered-table";
import { matchRegisteredTable, validatePlanForNeed } from "./calc-planning";
import { classifyOutcome } from "./classifier";
import { informationNeedEditErrors } from "./need-validation";
import {
  OpenAINarrationAdapter,
  narrateOrFallback,
} from "../model/narration-adapter.server";
import type { PreflightModule } from "./interface";

function validNeed(need: InformationNeed): boolean {
  return (
    Boolean(
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
    ) && informationNeedEditErrors(need).length === 0
  );
}

function redactedInterpretation(
  text: string,
  traceId: string,
  language: Language = "en",
): NeedInterpretation {
  const { redacted } = redactSensitiveIdentifiers(text);
  const needs = interpretWithFixture(redacted);
  return {
    originalText: text,
    redactedText: redacted,
    needs,
    clarifications: clarificationsForNeeds(needs).slice(0, 2),
    traceId,
    language,
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
      "You can ask the relevant government authority for a written reply",
    meaning: `${base.meaning} You chose a written reply, so you can prepare an RTI draft for the relevant authority.`,
    recommendedAction: "Prepare an RTI draft when you are ready.",
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

function displayColumn(
  key: string,
  value: string,
  table: RegisteredTable,
  plan: CalcPlan,
): { key: string; label: string; value: string } {
  const column = table.columns.find((candidate) => candidate.key === key);
  const derive = plan.steps.find(
    (step): step is Extract<CalcPlan["steps"][number], { kind: "derive" }> =>
      step.kind === "derive" && step.column === key,
  );
  if (derive) {
    const source = table.columns.find(
      (candidate) => candidate.key === derive.left.column,
    );
    return {
      key,
      label: "Change",
      value: `${signed(value)}${source?.unit === "%" ? " pp" : ""}`,
    };
  }
  if (column?.unit === "INR crore")
    return { key, label: column.displayLabel ?? key, value: `₹${value} crore` };
  if (column?.unit === "%")
    return { key, label: column.displayLabel ?? key, value: `${value}%` };
  return {
    key,
    label: column?.displayLabel ?? key.replaceAll("_", " "),
    value,
  };
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

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function measureValue(
  value: string | null,
  unit: RegisteredMeasure["unit"],
): string | null {
  if (value === null) return null;
  if (unit === "INR crore") return `₹${value} crore`;
  if (unit === "%") return `${value}%`;
  return value;
}

function comparisonValue(
  fromValue: string | null,
  toValue: string | null,
  unit: RegisteredMeasure["unit"],
): string | null {
  const from = measureValue(fromValue, unit);
  const to = measureValue(toValue, unit);
  return from === null || to === null ? null : `${from} → ${to}`;
}

function deltaValue(
  value: string | null,
  unit: RegisteredMeasure["unit"],
): string | null {
  if (value === null) return null;
  return `${signed(value)}${unit === "%" ? " pp" : ""}`;
}

function resultTableForExecution(
  plan: CalcPlan,
  table: RegisteredTable,
  rows: ReturnType<typeof executePlan>["rows"],
  need: InformationNeed,
): TabularResult {
  const geographyKey = plan.output[0];
  const geographyColumn = table.columns.find(
    (column) => column.key === geographyKey,
  );
  if (!geographyColumn) throw new Error("PLAN_GEOGRAPHY_COLUMN_MISSING");

  const views = need.analysisIntent!.predicates.map((predicate) => {
    const measure = measureBinding(table, predicate.measure);
    const fromColumn = measure?.periodColumns[predicate.fromPeriod];
    const toColumn = measure?.periodColumns[predicate.toPeriod];
    const deltaStep = plan.steps.find(
      (step): step is Extract<CalcPlan["steps"][number], { kind: "derive" }> =>
        step.kind === "derive" &&
        step.operation === "delta" &&
        step.left.column === toColumn &&
        step.right?.column === fromColumn,
    );
    if (!measure || !fromColumn || !toColumn || !deltaStep)
      throw new Error("PLAN_PRESENTATION_SCHEMA_MISSING");
    const label = measure.displayLabel ?? titleCase(measure.name);
    return {
      measure,
      fromColumn,
      toColumn,
      deltaColumn: deltaStep.column,
      comparisonColumn: `${deltaStep.column}_comparison`,
      columns: [
        {
          key: `${deltaStep.column}_comparison`,
          label: `${label} ${predicate.fromPeriod} → ${predicate.toPeriod}`,
          format: "comparison" as const,
        },
        { key: deltaStep.column, label: "Change", format: "delta" as const },
      ] satisfies ResultColumn[],
    };
  });

  return {
    columns: [
      {
        key: geographyKey,
        label: geographyColumn.displayLabel ?? titleCase(geographyKey),
        format: "text",
      },
      ...views.flatMap((view) => view.columns),
    ],
    rows: rows.map((row) => ({
      key: row.rowKey,
      values: {
        [geographyKey]: row.values[geographyKey],
        ...Object.fromEntries(
          views.flatMap((view) => [
            [
              view.comparisonColumn,
              comparisonValue(
                row.values[view.fromColumn],
                row.values[view.toColumn],
                view.measure.unit,
              ),
            ],
            [
              view.deltaColumn,
              deltaValue(row.values[view.deltaColumn], view.measure.unit),
            ],
          ]),
        ),
      },
    })),
  };
}

function derivedTableResolution(
  need: InformationNeed,
  source: Snapshot,
  traceId: string,
  plan: CalcPlan,
  table: RegisteredTable,
): RenderableResolution {
  const execution = executePlan(plan, table);
  const metadata = execution.metadata;
  const resultTable = resultTableForExecution(
    plan,
    table,
    execution.rows,
    need,
  );
  const rows = execution.rows.map((row) => ({
    geography: row.values[plan.output[0]]!,
    columns: plan.output
      .filter((column) => column !== plan.output[0])
      .map((column) => displayColumn(column, row.values[column]!, table, plan)),
    ...(row.values.stolen_2021 ? { stolen2021: row.values.stolen_2021 } : {}),
    ...(row.values.stolen_2023 ? { stolen2023: row.values.stolen_2023 } : {}),
    ...(row.values.stolen_delta
      ? { stolenDelta: signed(row.values.stolen_delta) }
      : {}),
    ...(row.values.recovery_2021
      ? { recovery2021: row.values.recovery_2021 }
      : {}),
    ...(row.values.recovery_2023
      ? { recovery2023: row.values.recovery_2023 }
      : {}),
    ...(row.values.recovery_delta
      ? { recoveryDelta: `${signed(row.values.recovery_delta)} pp` }
      : {}),
    ...(row.values.stolen_2021 ? { unit: "INR crore" as const } : {}),
    lineage: uniqueLineage(row),
    calculationMetadata: metadata,
  }));
  const intent = need.analysisIntent!;
  const filters = intent.predicates.map((predicate) => {
    const label =
      measureBinding(table, predicate.measure)?.comparisonLabel ??
      predicate.measure;
    return `${predicate.toPeriod} ${label} ${predicate.comparison === "increase" ? ">" : "<"} ${predicate.fromPeriod} ${label}`;
  });
  const operation = `Compare ${intent.predicates
    .map((predicate) => predicate.measure)
    .join(` ${intent.logic.toUpperCase()} `)} for each individual State/UT.`;
  const evidenceGroundings = rows.flatMap((row) => row.lineage);
  const base: RenderableResolution = {
    outcome: classifyOutcome({
      need: { resolutionPreference: "published" },
      execution: rows.length > 0 ? "CONFORMING" : "IN_SCOPE_EMPTY",
      derivedFinding: rows.length > 0,
    }),
    headline: "We found an answer using official government data",
    meaning: `The answer below was calculated from published NCRB figures for ${intent.predicates[0].fromPeriod} and ${intent.predicates[0].toPeriod}.`,
    evidenceStatus: "Calculated from official data",
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
    resultTable,
    gaps: execution.gaps,
    searchScope:
      "This prototype checks a limited set of saved government sources. It is not searching government systems live. For this check, we looked at the registered NCRB Table 20A.1 and left out three total rows.",
    recommendedAction:
      "Review how this was calculated, or prepare an RTI if you still want a written reply.",
    calculation: {
      operation: operation,
      filters: [
        ...filters,
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
        "You chose a written response from a government authority.",
      )
    : base;
}

function planningFailureResolution(
  need: InformationNeed,
  traceId: string,
  stage: "provider" | "parse" | "validation" | "execution",
  code: string,
): RenderableResolution {
  const base: RenderableResolution = {
    outcome: "NO_RELIABLE_FINDING",
    headline:
      "The registered source was found, but calculation planning was unavailable.",
    meaning:
      "No calculation was executed because the proposed plan was unavailable or did not match the confirmed Information Need.",
    evidenceStatus:
      "Calculation planning unavailable—not a source coverage failure",
    evidence: [],
    rows: [],
    gaps: [`The registered NCRB table was not queried: ${code}.`],
    planningFailure: { stage, code },
    searchScope:
      "The Capability Manifest matched the registered NCRB table, but the calculation plan did not reach deterministic execution.",
    recommendedAction:
      "Try the calculation again or prepare a focused Filing Draft.",
    traceId,
  };
  return need.resolutionPreference === "formal"
    ? formalResponse(
        base,
        "You chose a written response from a government authority.",
      )
    : base;
}

function planningFailureStage(
  code: string,
): "provider" | "parse" | "validation" {
  if (code.includes("PARSE") || code.includes("REFUSED")) return "parse";
  if (
    code === "PLAN_INPUT_MISSING_ANALYSIS_INTENT" ||
    code === "PLAN_MEASURE_PERIOD_UNSUPPORTED" ||
    code === "PLAN_GEOGRAPHY_COLUMN_MISSING"
  )
    return "validation";
  return "provider";
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
    "The sources checked by this prototype did not provide the expenditure, work order, or contractor information.",
  ];
  const base: RenderableResolution = {
    outcome: classifyOutcome({ need, execution: "IN_SCOPE_EMPTY" }),
    headline: "We couldn’t find a reliable public answer",
    meaning:
      "The government sources checked by this prototype do not fully answer your question. An RTI may help you request the information directly from the relevant authority.",
    evidenceStatus: "The sources checked did not provide a reliable answer",
    evidence: [],
    rows: [],
    gaps,
    searchScope:
      "This prototype checks a limited set of saved government sources. It is not searching government systems live.",
    recommendedAction: "Prepare an RTI for the information you still need.",
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
        "You chose a written response from a government authority.",
      )
    : base;
}

function syntheticFixtureResolution(
  need: InformationNeed,
  source: Snapshot,
  traceId: string,
): RenderableResolution {
  const fixture = source.syntheticFixtures.find(
    (item) => item.id === "previous-rti-response-fixture",
  );
  if (!fixture) throw new Error("SYNTHETIC_FIXTURE_NOT_REGISTERED");
  const evidence: EvidenceItem = {
    id: fixture.id,
    sourceTitle: "Earlier RTI response example",
    publisher: "Prototype example",
    sourceType: "rti_response_fixture",
    applicablePeriod: fixture.applicablePeriod,
    extract:
      "This is a fictional, identity-free example about a generic public programme. It is not a real RTI response and does not reproduce a government record.",
    syntheticDisclosure: "Prototype example — this is not a real RTI response.",
    translationStatus: "original",
    grounding: fixture.values.map((value) =>
      groundingForFixtureValue(fixture.id, value.pointer, source),
    ),
  };
  const base: RenderableResolution = {
    outcome: "SOURCE_RESOLVED",
    headline: "We found a similar earlier RTI response",
    meaning:
      "An earlier response may help answer your question before you file a new RTI.",
    evidenceStatus: "Prototype example — this is not a real RTI response.",
    evidence: [evidence],
    rows: [],
    gaps: [],
    searchScope:
      "This prototype checked a saved example of an earlier RTI response.",
    recommendedAction: "Review the earlier response, or prepare a new RTI.",
    traceId,
  };
  return need.resolutionPreference === "formal"
    ? formalResponse(
        base,
        "You chose a written response from a government authority.",
      )
    : base;
}

function epfoSubjectScope(need: InformationNeed) {
  if (need.recordSubject)
    return need.recordSubject === "own"
      ? "own-record"
      : need.recordSubject === "another"
        ? "another-person"
        : "unspecified";
  return classifyEpfoRecordSubject(
    `${need.originalText} ${need.canonicalNeed}`,
  );
}

function epfoResolution(
  need: InformationNeed,
  traceId: string,
): RenderableResolution {
  const decision = resolveEpfoServiceRoute(epfoSubjectScope(need));
  if (decision.kind === "not-own-record-service-route")
    return {
      outcome: "FORMAL_RESPONSE_REQUIRED",
      headline:
        decision.subjectScope === "another-person"
          ? "An official EPFO service cannot show another person’s record."
          : "Confirm whose EPF claim you need before choosing a route.",
      meaning:
        "Having another person’s identifier does not give permission to access their record. This prototype does not request an account number, Aadhaar, PAN, OTP, or government login. You can prepare an RTI draft for records, but the authority’s reply cannot be promised.",
      evidenceStatus: "No personal record was checked",
      evidence: [],
      rows: [],
      gaps: [
        decision.subjectScope === "another-person"
          ? "The requested record is not identified as your own; self-service access is not represented for another person’s record."
          : "The record subject is not clear enough to select an own-record service route.",
      ],
      searchScope:
        "This prototype does not retrieve personal records or accept account identifiers. Only the official service for your own record can be opened.",
      recommendedAction:
        "Prepare an RTI draft for the records, if appropriate.",
      formalResponseReason:
        "The represented authenticated service route is limited to the citizen’s own record.",
      traceId,
    };
  return {
    outcome: "OFFICIAL_SERVICE_ROUTE",
    headline: "You may not need an RTI for this",
    meaning:
      "EPF claim status can be checked through an official EPFO service. For personal claim status, using the official service is usually quicker than filing an RTI. This prototype does not access your record or promise a status.",
    evidenceStatus: "Official service available",
    evidence: [
      {
        id: decision.route.id,
        sourceTitle: "EPFO Member Passbook",
        publisher: decision.route.canonicalHolder,
        sourceType: "official_service_route",
        url: decision.route.officialUrl,
        applicablePeriod: "Current own-record claim status",
        extract:
          "EPF claim status can be checked through an official EPFO service. No account details are requested or transmitted by this prototype.",
        translationStatus: "original",
        grounding: [],
      },
    ],
    rows: [],
    gaps: [],
    searchScope:
      "This prototype identified an official service for your own record. It did not retrieve a personal record or send any identifier.",
    recommendedAction: "Go to the official EPFO service.",
    serviceRoute: {
      id: decision.route.id,
      purpose: decision.route.purpose,
      officialUrl: decision.route.officialUrl,
      verifiedAt: decision.route.verificationDate,
      primarySourceUrls: [...decision.route.primarySourceUrls],
    },
    traceId,
  };
}

async function resolveNeed(
  need: InformationNeed,
  source: Snapshot,
  traceId: string,
  planAdapter: PlanAdapter,
): Promise<RenderableResolution> {
  const candidate = matchRegisteredTable(need, source);
  if (candidate) {
    let plan: CalcPlan;
    try {
      plan = await planAdapter.plan(candidate);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "PLAN_PROVIDER_FAILED";
      const code = message.split(":")[0];
      return planningFailureResolution(
        need,
        traceId,
        planningFailureStage(code),
        code,
      );
    }
    try {
      validatePlanForNeed(plan, candidate);
    } catch (error) {
      return planningFailureResolution(
        need,
        traceId,
        "validation",
        error instanceof Error ? error.message : "PLAN_VALIDATION_FAILED",
      );
    }
    try {
      return derivedTableResolution(
        need,
        source,
        traceId,
        plan,
        candidate.table,
      );
    } catch (error) {
      return planningFailureResolution(
        need,
        traceId,
        "execution",
        error instanceof Error ? error.message : "PLAN_EXECUTION_FAILED",
      );
    }
  }
  if (need.scenario === "railway-filing")
    return noFindingResolution(need, source, traceId);
  if (need.scenario === "epfo-status") return epfoResolution(need, traceId);
  if (need.scenario === "previous-rti")
    return syntheticFixtureResolution(need, source, traceId);
  const grievance =
    /\b(why|failed|delay|delayed|complaint|grievance|problem)\b/i.test(
      `${need.originalText} ${need.canonicalNeed}`,
    );
  return {
    outcome: classifyOutcome({ need, execution: "OUT_OF_SNAPSHOT" }),
    headline: "We couldn’t find a reliable public answer",
    meaning:
      "The government sources checked by this prototype do not fully answer your question. An RTI may help you request the information directly from the relevant authority.",
    evidenceStatus: "The sources checked did not provide a reliable answer",
    evidence: [],
    rows: [],
    gaps: [
      "The sources checked by this prototype did not provide a reliable answer for this question.",
    ],
    searchScope:
      "This prototype checks a limited set of saved government sources. It is not searching government systems live.",
    recommendedAction: grievance
      ? "Prepare an RTI asking for orders, notes, reports, or correspondence."
      : "Review what we checked, change your question, or prepare an RTI draft.",
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
    private readonly planAdapter: PlanAdapter = process.env.OPENAI_API_KEY
      ? new OpenAICalcPlanAdapter()
      : new DeterministicPlanAdapter(),
  ) {}
  interpret(input: {
    text: string;
    traceId: string;
    language?: Language;
  }): Promise<NeedInterpretation> {
    return this.adapter.interpret(input);
  }
  async resolve(input: {
    need: InformationNeed;
    snapshot: Snapshot;
    traceId?: string;
    language?: Language;
  }): Promise<RenderableResolution> {
    if (!validNeed(input.need)) throw new Error("INVALID_NEED");
    validateSnapshot(input.snapshot);
    const result = {
      ...(await resolveNeed(
        input.need,
        input.snapshot,
        normalizeTraceId(input.traceId),
        this.planAdapter,
      )),
      narration: "deterministic" as const,
    };
    if (!process.env.OPENAI_API_KEY) return result;
    return narrateOrFallback({
      adapter: new OpenAINarrationAdapter(),
      need: redactedNeed(input.need),
      result,
      traceId: result.traceId,
      language: input.language,
    });
  }
}

export function createOfflinePreflightModule(): RTIPreflightModule {
  return new RTIPreflightModule({
    interpret: async ({ text, traceId, language }) =>
      redactedInterpretation(text, traceId, language),
  });
}
