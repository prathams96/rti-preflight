import type { GroundingReference } from "../domain/types";
import {
  groundingForCell,
  hashPlan,
  snapshot,
  type NcrbRow,
  type Snapshot,
} from "../evidence/snapshot";
import {
  executePlan,
  type CalcResult,
  type CalcPlan,
  type RegisteredTable,
  type RegisteredRow,
  type RegisteredMeasure,
} from "./registered-table";

export const NCRB_PLAN: CalcPlan = {
  version: "ncrb-derived-finding-v2",
  tableId: "ncrb-property-table-20a",
  semantics: {
    measure:
      "Value of property stolen and percentage recovery of stolen property",
    period: "2021 versus 2023",
    geography: "All States/UTs",
    comparison: "2023 stolen value > 2021 and 2023 recovery percentage < 2021",
    outputShape: "one row per individual State/UT with both deltas",
  },
  steps: [
    {
      kind: "excludeAggregates",
      column: "state",
      values: ["Total State (S)", "Total UT (S)", "Total All India"],
    },
    {
      kind: "derive",
      column: "stolen_delta",
      operation: "delta",
      left: { column: "stolen_2023" },
      right: { column: "stolen_2021" },
      displayScale: 1,
    },
    {
      kind: "derive",
      column: "recovery_delta",
      operation: "delta",
      left: { column: "recovery_2023" },
      right: { column: "recovery_2021" },
      displayScale: 1,
    },
    {
      kind: "filter",
      predicate: {
        kind: "all",
        predicates: [
          {
            kind: "compare",
            column: "stolen_2023",
            operator: "gt",
            value: { column: "stolen_2021" },
          },
          {
            kind: "compare",
            column: "recovery_2023",
            operator: "lt",
            value: { column: "recovery_2021" },
          },
        ],
      },
    },
    { kind: "sort", keys: [{ column: "state", direction: "asc" }] },
    {
      kind: "project",
      columns: [
        "state",
        "stolen_2021",
        "stolen_2023",
        "stolen_delta",
        "recovery_2021",
        "recovery_2023",
        "recovery_delta",
      ],
    },
  ],
  output: [
    "state",
    "stolen_2021",
    "stolen_2023",
    "stolen_delta",
    "recovery_2021",
    "recovery_2023",
    "recovery_delta",
  ],
};

export const NCRB_MEASURES: readonly RegisteredMeasure[] = [
  {
    name: "value of property stolen",
    periodColumns: {
      "2021": "stolen_2021",
      "2022": "stolen_2022",
      "2023": "stolen_2023",
    },
    unit: "INR crore",
  },
  {
    name: "percentage recovery of stolen property",
    periodColumns: {
      "2021": "recovery_2021",
      "2022": "recovery_2022",
      "2023": "recovery_2023",
    },
    unit: "%",
  },
];

function registeredColumns(): RegisteredTable["columns"] {
  const dimension = (key: string) => ({
    key,
    kind: "dimension" as const,
    dtype: "text" as const,
    unit: "text" as const,
    nullable: false,
    additivity: "non_additive" as const,
    allowedAggregations: ["count"] as const,
  });
  const money = (key: string) => ({
    key,
    kind: "measure" as const,
    dtype: "decimal" as const,
    unit: "INR crore" as const,
    nullable: false,
    additivity: "additive" as const,
    allowedAggregations: [
      "sum",
      "mean",
      "median",
      "minimum",
      "maximum",
      "weightedMean",
    ] as const,
  });
  const percentage = (key: string) => ({
    key,
    kind: "measure" as const,
    dtype: "decimal" as const,
    unit: "%" as const,
    nullable: false,
    additivity: "non_additive" as const,
    allowedAggregations: ["minimum", "maximum", "weightedMean"] as const,
  });
  return [
    dimension("state"),
    money("stolen_2021"),
    money("stolen_2022"),
    money("stolen_2023"),
    percentage("recovery_2021"),
    percentage("recovery_2022"),
    percentage("recovery_2023"),
  ];
}

function tableRows(snapshot: Snapshot): RegisteredRow[] {
  return snapshot.table.rows.map((row: NcrbRow) => {
    const cell = (column: string): GroundingReference[] => [
      groundingForCell(row.rowKey, column, snapshot),
    ];
    return {
      rowKey: row.rowKey,
      values: {
        state: row.state,
        stolen_2021: row.stolen2021,
        stolen_2022: row.raw.split(",")[5],
        stolen_2023: row.stolen2023,
        recovery_2021: row.recovery2021,
        recovery_2022: row.raw.split(",")[7],
        recovery_2023: row.recovery2023,
      },
      lineage: {
        state: cell("state"),
        stolen_2021: cell("stolen_2021"),
        stolen_2022: cell("stolen_2022"),
        stolen_2023: cell("stolen_2023"),
        recovery_2021: cell("recovery_2021"),
        recovery_2022: cell("recovery_2022"),
        recovery_2023: cell("recovery_2023"),
      },
    };
  });
}

export function ncrbRegisteredTable(source: Snapshot): RegisteredTable {
  return {
    id: "ncrb-property-table-20a",
    representationHash: source.representation.hash,
    columns: registeredColumns(),
    rows: tableRows(source),
    aggregateRowKeys: source.table.aggregateRowKeys,
    allowedOperations: [
      "excludeAggregates",
      "excludeNulls",
      "derive",
      "filter",
      "sort",
      "limit",
      "project",
    ],
    measures: NCRB_MEASURES,
  };
}

export function executeNcrbPlan(source: Snapshot = snapshot): CalcResult {
  return executePlan(NCRB_PLAN, ncrbRegisteredTable(source));
}

export function ncrbPlanHash(source: Snapshot): string {
  return hashPlan({
    plan: NCRB_PLAN,
    representationHash: source.representation.hash,
  });
}
