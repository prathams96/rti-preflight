import type { InformationNeed } from "../domain/types";
import {
  type CalcPlan,
  type RegisteredMeasure,
  type RegisteredTable,
} from "../calc/registered-table";

export type PlanInput = {
  need: InformationNeed;
  table: RegisteredTable;
  approvedCapability: {
    authority: string;
    resourceId: string;
    measures: readonly string[];
    periods: readonly string[];
    operations: readonly string[];
  };
};

export type PlanAdapter = {
  plan(input: PlanInput): Promise<CalcPlan>;
};

export function measureBinding(
  table: RegisteredTable,
  name: string,
): RegisteredMeasure | undefined {
  return table.measures?.find(
    (measure) => measure.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
}

export function planForAnalysis(
  need: InformationNeed,
  table: RegisteredTable,
): CalcPlan {
  const intent = need.analysisIntent;
  if (!intent || intent.predicates.length === 0)
    throw new Error("PLAN_INPUT_MISSING_ANALYSIS_INTENT");
  const dimensions = table.columns.filter(
    (column) => column.kind === "dimension",
  );
  const geographyColumn = dimensions[0]?.key;
  if (!geographyColumn) throw new Error("PLAN_GEOGRAPHY_COLUMN_MISSING");

  const derivations = intent.predicates.map((predicate) => {
    const binding = measureBinding(table, predicate.measure);
    const left = binding?.periodColumns[predicate.toPeriod];
    const right = binding?.periodColumns[predicate.fromPeriod];
    if (!binding || !left || !right)
      throw new Error("PLAN_MEASURE_PERIOD_UNSUPPORTED");
    const prefix =
      binding.name === "value of property stolen" ? "stolen" : "recovery";
    return {
      predicate,
      binding,
      left,
      right,
      delta: `${prefix}_delta`,
    };
  });
  const filters = derivations.map(({ predicate, left, right }) => ({
    kind: "compare" as const,
    column: left,
    operator:
      predicate.comparison === "increase" ? ("gt" as const) : ("lt" as const),
    value: { column: right },
  }));
  const predicate =
    filters.length === 1
      ? filters[0]
      : {
          kind: intent.logic === "or" ? ("any" as const) : ("all" as const),
          predicates: filters,
        };
  const ranking = intent.ranking
    ? derivations.find(
        ({ binding }) => binding.name === intent.ranking?.measure,
      )
    : undefined;
  const output = [
    geographyColumn,
    ...derivations.flatMap(({ left, right, delta }) => [right, left, delta]),
  ];
  const steps: CalcPlan["steps"] = [
    {
      kind: "excludeAggregates",
      column: geographyColumn,
      values: table.aggregateRowKeys ?? [],
    },
    ...derivations.map(({ delta, left, right }) => ({
      kind: "derive" as const,
      column: delta,
      operation: "delta" as const,
      left: { column: left },
      right: { column: right },
      displayScale: 1,
    })),
    { kind: "filter" as const, predicate },
    ...(ranking
      ? [
          {
            kind: "excludeNulls" as const,
            columns: [ranking.delta],
          },
        ]
      : []),
    ranking
      ? {
          kind: "sort" as const,
          keys: [
            {
              column: ranking.delta,
              direction: intent.ranking!.direction,
            },
          ],
        }
      : {
          kind: "sort" as const,
          keys: [{ column: geographyColumn, direction: "asc" as const }],
        },
    ...(ranking
      ? [{ kind: "limit" as const, count: intent.ranking!.limit }]
      : []),
    { kind: "project" as const, columns: output },
  ];
  return {
    version: "registered-table-model-plan-v1",
    tableId: table.id,
    steps,
    output,
  };
}
