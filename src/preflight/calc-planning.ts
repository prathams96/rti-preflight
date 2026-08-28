import type { AnalysisIntent, InformationNeed } from "../domain/types";
import {
  snapshot as defaultSnapshot,
  type Snapshot,
} from "../evidence/snapshot";
import { ncrbRegisteredTable } from "../calc/ncrb-plan";
import {
  validatePlan,
  type CalcPlan,
  type Predicate,
  type RegisteredTable,
} from "../calc/registered-table";
import { measureBinding, type PlanInput } from "../model/plan-adapter";

export type RegisteredTableCandidate = PlanInput;

function yearsForNeed(need: InformationNeed): string[] {
  return [
    ...new Set(
      [...need.period.matchAll(/\b(20\d{2})\b/g)].map((match) => match[1]),
    ),
  ];
}

/** Match a confirmed need to an approved registered table before model planning. */
export function matchRegisteredTable(
  need: InformationNeed,
  source: Snapshot = defaultSnapshot,
): RegisteredTableCandidate | undefined {
  const table = ncrbRegisteredTable(source);
  const intent = need.analysisIntent;
  const periods = yearsForNeed(need);
  if (
    source.source.id !== table.id ||
    need.informationHolder !== "National Crime Records Bureau" ||
    !/states?|union territories?|states?\/uts?/i.test(need.geography)
  )
    return undefined;

  // A model-backed need without structured analytical intent still matched an
  // approved capability, but it must fail in planning rather than be treated
  // as a source-coverage miss or reinterpreted from free text.
  if (!intent) {
    return need.scenario === "ncrb-property"
      ? {
          need,
          table,
          approvedCapability: {
            authority: "National Crime Records Bureau",
            resourceId: table.id,
            measures: source.capabilityManifest.measures,
            periods: source.capabilityManifest.periods,
            operations: source.capabilityManifest.operations,
          },
        }
      : undefined;
  }

  if (
    intent.predicates.length === 0 ||
    periods.length !== 2 ||
    intent.predicates.some(
      (predicate) =>
        predicate.fromPeriod !== periods[0] ||
        predicate.toPeriod !== periods[1] ||
        !measureBinding(table, predicate.measure) ||
        !measureBinding(table, predicate.measure)?.periodColumns[
          predicate.fromPeriod
        ] ||
        !measureBinding(table, predicate.measure)?.periodColumns[
          predicate.toPeriod
        ],
    )
  )
    return undefined;
  return {
    need,
    table,
    approvedCapability: {
      authority: "National Crime Records Bureau",
      resourceId: table.id,
      measures: source.capabilityManifest.measures,
      periods: source.capabilityManifest.periods,
      operations: source.capabilityManifest.operations,
    },
  };
}

function predicateLeaves(predicate: Predicate): Predicate[] {
  if (predicate.kind === "all" || predicate.kind === "any")
    return predicate.predicates.flatMap(predicateLeaves);
  return [predicate];
}

function comparePredicate(
  predicate: Predicate,
): predicate is Extract<Predicate, { kind: "compare" }> {
  return predicate.kind === "compare" && typeof predicate.value === "object";
}

function expectedFilter(
  intent: AnalysisIntent,
  table: RegisteredTable,
): Predicate[] {
  return intent.predicates.map((predicate) => {
    const binding = measureBinding(table, predicate.measure);
    const left = binding?.periodColumns[predicate.toPeriod];
    const right = binding?.periodColumns[predicate.fromPeriod];
    if (!left || !right) throw new Error("PLAN_MEASURE_PERIOD_UNSUPPORTED");
    return {
      kind: "compare" as const,
      column: left,
      operator:
        predicate.comparison === "increase" ? ("gt" as const) : ("lt" as const),
      value: { column: right },
    };
  });
}

function sameCompare(a: Predicate, b: Predicate): boolean {
  return (
    comparePredicate(a) &&
    comparePredicate(b) &&
    a.column === b.column &&
    a.operator === b.operator &&
    typeof a.value === "object" &&
    typeof b.value === "object" &&
    a.value.column === b.value.column
  );
}

export function validatePlanForNeed(
  plan: CalcPlan,
  candidate: RegisteredTableCandidate,
): void {
  const { need, table } = candidate;
  const intent = need.analysisIntent;
  if (!intent) throw new Error("PLAN_INPUT_MISSING_ANALYSIS_INTENT");
  validatePlan(plan, table);
  if (plan.tableId !== table.id) throw new Error("PLAN_TABLE_NOT_APPROVED");
  const aggregateStep = plan.steps[0];
  if (
    aggregateStep?.kind !== "excludeAggregates" ||
    aggregateStep.column !== "state" ||
    JSON.stringify(aggregateStep.values) !==
      JSON.stringify(table.aggregateRowKeys ?? [])
  )
    throw new Error("PLAN_AGGREGATE_SCOPE_INVALID");

  const expected = expectedFilter(intent, table);
  const filterSteps = plan.steps.filter((step) => step.kind === "filter");
  if (filterSteps.length !== 1) throw new Error("PLAN_FILTER_COUNT_INVALID");
  const actualFilter = filterSteps[0].predicate;
  const actualLeaves = predicateLeaves(actualFilter);
  if (
    actualLeaves.length !== expected.length ||
    !expected.every((item) =>
      actualLeaves.some((actual) => sameCompare(item, actual)),
    ) ||
    (expected.length > 1 &&
      actualFilter.kind !== (intent.logic === "or" ? "any" : "all")) ||
    (expected.length === 1 && actualFilter.kind !== "compare")
  )
    throw new Error("PLAN_SEMANTIC_FILTER_MISMATCH");

  const expectedOutput = ["state"];
  const expectedDerivations = intent.predicates.map((predicate) => {
    const binding = measureBinding(table, predicate.measure);
    const left = binding!.periodColumns[predicate.toPeriod];
    const right = binding!.periodColumns[predicate.fromPeriod];
    const delta = `${binding!.key}_delta`;
    expectedOutput.push(right, left, delta);
    return { binding: binding!, left, right, delta };
  });
  const derives = plan.steps.filter((step) => step.kind === "derive");
  if (
    derives.length !== expectedDerivations.length ||
    expectedDerivations.some(
      (expectedDerivation) =>
        !derives.some(
          (step) =>
            step.column === expectedDerivation.delta &&
            step.operation === "delta" &&
            step.left.column === expectedDerivation.left &&
            step.right?.column === expectedDerivation.right,
        ),
    )
  )
    throw new Error("PLAN_SEMANTIC_DERIVATION_MISMATCH");
  if (JSON.stringify(plan.output) !== JSON.stringify(expectedOutput))
    throw new Error("PLAN_PROJECTION_MISMATCH");
  const project = plan.steps.at(-1);
  if (
    project?.kind !== "project" ||
    JSON.stringify(project.columns) !== JSON.stringify(expectedOutput)
  )
    throw new Error("PLAN_PROJECT_STEP_MISMATCH");

  const limitSteps = plan.steps.filter((step) => step.kind === "limit");
  const sortSteps = plan.steps.filter((step) => step.kind === "sort");
  if (!intent.ranking) {
    if (limitSteps.length > 0) throw new Error("PLAN_UNREQUESTED_LIMIT");
    if (
      sortSteps.length !== 1 ||
      sortSteps[0].keys.length !== 1 ||
      sortSteps[0].keys[0].column !== "state" ||
      sortSteps[0].keys[0].direction !== "asc"
    )
      throw new Error("PLAN_UNREQUESTED_RANKING");
  } else {
    const rankingBinding = measureBinding(table, intent.ranking.measure);
    const ranked = expectedDerivations.find(
      (derivation) => derivation.binding.key === rankingBinding?.key,
    );
    if (
      !ranked ||
      limitSteps.length !== 1 ||
      limitSteps[0].count !== intent.ranking.limit ||
      sortSteps.length !== 1 ||
      sortSteps[0].keys.length !== 1 ||
      sortSteps[0].keys[0].column !== ranked.delta ||
      sortSteps[0].keys[0].direction !== intent.ranking.direction
    )
      throw new Error("PLAN_RANKING_MISMATCH");
  }
}
