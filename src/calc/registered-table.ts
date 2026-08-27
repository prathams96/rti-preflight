import { createHash } from "node:crypto";
import type { GroundingReference } from "../domain/types";
import { decimal, FixedDecimal } from "./decimal";

export type TableValue = string | null;
export type ColumnUnit = "text" | "count" | "INR crore" | "%" | "ratio";
export type ColumnKind = "dimension" | "measure";
export type AggregateFunction =
  "count" | "sum" | "mean" | "median" | "minimum" | "maximum" | "weightedMean";

export type RegisteredColumn = {
  key: string;
  kind: ColumnKind;
  dtype: "text" | "decimal";
  unit: ColumnUnit;
  nullable: boolean;
  additivity: "additive" | "non_additive";
  allowedAggregations: readonly AggregateFunction[];
  negativeBaselineMeaningful?: boolean;
};

export type RegisteredRow = {
  rowKey: string;
  values: Record<string, TableValue>;
  lineage: Record<string, GroundingReference[]>;
};

export type RegisteredTable = {
  id: string;
  representationHash: string;
  columns: readonly RegisteredColumn[];
  rows: readonly RegisteredRow[];
  aggregateRowKeys?: readonly string[];
  allowedOperations?: readonly string[];
};

export type ValueRef = { column: string };
export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
export type ArithmeticOperator =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "delta"
  | "percentChange"
  | "ratio"
  | "shareOfTotal"
  | "cagr";

export type Predicate =
  | { kind: "all"; predicates: readonly Predicate[] }
  | { kind: "any"; predicates: readonly Predicate[] }
  | {
      kind: "compare";
      column: string;
      operator: ComparisonOperator;
      value: string | { column: string };
    }
  | { kind: "in"; column: string; values: readonly string[] }
  | { kind: "notNull"; column: string };

export type CalcStep =
  | { kind: "excludeAggregates"; column: string; values: readonly string[] }
  | { kind: "excludeNulls"; columns: readonly string[] }
  | { kind: "filter"; predicate: Predicate }
  | {
      kind: "derive";
      column: string;
      operation: ArithmeticOperator;
      left: ValueRef;
      right?: ValueRef;
      displayScale?: number;
      periods?: number;
    }
  | { kind: "project"; columns: readonly string[] }
  | { kind: "distinct"; columns: readonly string[] }
  | {
      kind: "group";
      by: readonly string[];
      aggregations: readonly AggregationSpec[];
    }
  | { kind: "sort"; keys: readonly SortKey[] }
  | {
      kind: "rank";
      column: string;
      as: string;
      method: "ordinal" | "dense" | "competition";
      partitionBy?: readonly string[];
    }
  | { kind: "limit"; count: number };

export type AggregationSpec = {
  as: string;
  operation: AggregateFunction;
  column?: string;
  weightColumn?: string;
  displayScale?: number;
};

export type SortKey = { column: string; direction: "asc" | "desc" };

export type PlanSemantics = {
  measure?: string;
  period?: string;
  geography?: string;
  comparison?: string;
  outputShape?: string;
};

export type CalcPlan = {
  version: string;
  tableId: string;
  steps: readonly CalcStep[];
  output: readonly string[];
  semantics?: PlanSemantics;
  budget?: { maxRows?: number; maxSteps?: number };
};

export type CalcMetadata = {
  representationHash: string;
  planHash: string;
  engineVersion: string;
  engineHash: string;
  policyVersion: string;
  policyHash: string;
};

export type CalcRow = {
  rowKey: string;
  values: Record<string, TableValue>;
  lineage: Record<string, GroundingReference[]>;
};

export type CalcResult = {
  rows: CalcRow[];
  gaps: string[];
  metadata: CalcMetadata;
};

export const CALCULATION_ENGINE_VERSION = "registered-table-decimal-v1";
export const CALCULATION_POLICY = {
  version: "decimal-policy-v1",
  workingScale: 6,
  rounding: "half-up",
  filtersRoundBeforeCompare: false,
  nulls: "explicit-exclusion-required",
} as const;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export const CALCULATION_ENGINE_HASH = hash({
  version: CALCULATION_ENGINE_VERSION,
  decimal: "fixed-point-bigint",
});
export const CALCULATION_POLICY_HASH = hash(CALCULATION_POLICY);

type ColumnState = RegisteredColumn & { generated?: boolean };

function columnMap(table: RegisteredTable): Map<string, ColumnState> {
  return new Map(table.columns.map((column) => [column.key, { ...column }]));
}

function getColumn(
  columns: Map<string, ColumnState>,
  key: string,
): ColumnState {
  const column = columns.get(key);
  if (!column) throw new Error(`CALC_UNKNOWN_COLUMN:${key}`);
  return column;
}

function requireDistinct(names: readonly string[]): void {
  if (new Set(names).size !== names.length)
    throw new Error("CALC_DUPLICATE_OUTPUT");
}

function requirePredicate(
  predicate: Predicate,
  columns: Map<string, ColumnState>,
): void {
  if (
    (predicate.kind === "all" || predicate.kind === "any") &&
    predicate.predicates.length === 0
  )
    throw new Error("CALC_EMPTY_PREDICATE_GROUP");
  if (predicate.kind === "all" || predicate.kind === "any") {
    predicate.predicates.forEach((child) => requirePredicate(child, columns));
    return;
  }
  getColumn(columns, predicate.column);
  if (predicate.kind === "in" && predicate.values.length === 0)
    throw new Error("CALC_EMPTY_MEMBERSHIP");
  if (predicate.kind === "compare" && typeof predicate.value === "object")
    getColumn(columns, predicate.value.column);
}

function predicateColumns(predicate: Predicate): string[] {
  if (predicate.kind === "all" || predicate.kind === "any")
    return predicate.predicates.flatMap(predicateColumns);
  return [
    predicate.column,
    ...(predicate.kind === "compare" && typeof predicate.value === "object"
      ? [predicate.value.column]
      : []),
  ];
}

function predicateNotNullColumns(predicate: Predicate): string[] {
  if (predicate.kind === "notNull") return [predicate.column];
  if (predicate.kind === "all" || predicate.kind === "any")
    return predicate.predicates.flatMap(predicateNotNullColumns);
  return [];
}

function numericColumn(
  columns: Map<string, ColumnState>,
  ref: ValueRef,
): ColumnState {
  const column = getColumn(columns, ref.column);
  if (column.dtype !== "decimal")
    throw new Error("CALC_NUMERIC_COLUMN_REQUIRED");
  return column;
}

function derivedColumn(
  operation: ArithmeticOperator,
  left: ColumnState,
  right?: ColumnState,
): ColumnState {
  const arithmetic = ["add", "subtract", "delta"] as ArithmeticOperator[];
  if (arithmetic.includes(operation) && (!right || left.unit !== right.unit))
    throw new Error("CALC_INCOMPATIBLE_UNITS");
  if (
    operation === "multiply" &&
    (!right || left.unit === "%" || right.unit === "%")
  )
    throw new Error("CALC_UNIT_ALGEBRA_INVALID");
  if (["divide", "ratio"].includes(operation) && !right)
    throw new Error("CALC_RIGHT_OPERAND_REQUIRED");
  if (operation === "shareOfTotal" && left.additivity !== "additive")
    throw new Error("CALC_NON_ADDITIVE_SHARE");
  if (operation === "percentChange" && (!right || right.unit !== left.unit))
    throw new Error("CALC_PERCENT_CHANGE_UNITS");
  if (operation === "cagr" && left.unit !== (right?.unit ?? left.unit))
    throw new Error("CALC_CAGR_UNITS");
  return {
    key: "generated",
    kind: "measure",
    dtype: "decimal",
    unit: ["percentChange", "shareOfTotal", "cagr"].includes(operation)
      ? "%"
      : operation === "divide" || operation === "ratio"
        ? "ratio"
        : left.unit,
    nullable: true,
    additivity: "non_additive",
    allowedAggregations: [],
    generated: true,
  };
}

function validateAggregation(
  spec: AggregationSpec,
  columns: Map<string, ColumnState>,
): ColumnState {
  if (!spec.as || spec.as.includes(" "))
    throw new Error("CALC_GENERATED_NAME_INVALID");
  if (spec.operation !== "count") {
    if (!spec.column) throw new Error("CALC_AGGREGATE_COLUMN_REQUIRED");
    const input = numericColumn(columns, { column: spec.column });
    if (!input.allowedAggregations.includes(spec.operation))
      throw new Error("CALC_AGGREGATION_NOT_PERMITTED");
    if (spec.operation === "weightedMean") {
      if (!spec.weightColumn) throw new Error("CALC_WEIGHT_REQUIRED");
      const weight = numericColumn(columns, { column: spec.weightColumn });
      if (weight.unit !== "count" && weight.unit !== "INR crore")
        throw new Error("CALC_WEIGHT_UNIT_INVALID");
    }
    return {
      key: spec.as,
      kind: "measure",
      dtype: "decimal",
      unit: input.unit,
      nullable: false,
      additivity: "non_additive",
      allowedAggregations: [],
      generated: true,
    };
  }
  return {
    key: spec.as,
    kind: "measure",
    dtype: "decimal",
    unit: "count",
    nullable: false,
    additivity: "additive",
    allowedAggregations: ["sum", "count"],
    generated: true,
  };
}

export function validatePlan(
  plan: CalcPlan,
  table: RegisteredTable,
  expectedSemantics?: PlanSemantics,
): void {
  if (plan.tableId !== table.id) throw new Error("CALC_TABLE_MISMATCH");
  if (!plan.version) throw new Error("CALC_PLAN_VERSION_REQUIRED");
  if (
    plan.steps.length === 0 ||
    (plan.budget?.maxSteps !== undefined &&
      plan.steps.length > plan.budget.maxSteps)
  )
    throw new Error("CALC_PLAN_BUDGET_EXCEEDED");
  if (table.allowedOperations) {
    const unsupported = plan.steps.find(
      (step) => !table.allowedOperations!.includes(step.kind),
    );
    if (unsupported)
      throw new Error(`CALC_OPERATION_NOT_REGISTERED:${unsupported.kind}`);
  }
  if (expectedSemantics) {
    for (const key of [
      "measure",
      "period",
      "geography",
      "comparison",
      "outputShape",
    ] as const) {
      if (
        expectedSemantics[key] !== undefined &&
        plan.semantics?.[key] !== expectedSemantics[key]
      )
        throw new Error(`CALC_SEMANTIC_MISMATCH:${key}`);
    }
  }
  const columns = columnMap(table);
  const aggregateKeys = table.aggregateRowKeys ?? [];
  let aggregateExcluded = aggregateKeys.length === 0;
  let grouped = false;
  let limited = false;
  let ordered = false;
  const nonNull = new Set(
    [...columns.values()]
      .filter((column) => !column.nullable)
      .map((column) => column.key),
  );

  plan.steps.forEach((step, index) => {
    if (limited && step.kind !== "project")
      throw new Error("CALC_MUTATION_AFTER_LIMIT");
    if (limited && step.kind === "project") return;
    if (index > 0 && step.kind === "excludeAggregates")
      throw new Error("CALC_LATE_AGGREGATE_EXCLUSION");
    if (!aggregateExcluded && step.kind !== "excludeAggregates")
      throw new Error("CALC_AGGREGATE_EXCLUSION_REQUIRED");
    if (step.kind === "excludeAggregates") {
      getColumn(columns, step.column);
      if (
        step.values.length === 0 ||
        aggregateKeys.some((key) => !step.values.includes(key))
      )
        throw new Error("CALC_AGGREGATE_EXCLUSION_INCOMPLETE");
      aggregateExcluded = true;
    } else if (step.kind === "excludeNulls") {
      requireDistinct(step.columns);
      step.columns.forEach((column) => {
        getColumn(columns, column);
        nonNull.add(column);
      });
    } else if (step.kind === "filter") {
      requirePredicate(step.predicate, columns);
      const guaranteed = new Set(predicateNotNullColumns(step.predicate));
      guaranteed.forEach((column) => nonNull.add(column));
      const nullablePredicateColumn = predicateColumns(step.predicate).find(
        (column) =>
          getColumn(columns, column).nullable &&
          !nonNull.has(column) &&
          !guaranteed.has(column),
      );
      if (nullablePredicateColumn)
        throw new Error("CALC_NULL_OPERAND_UNHANDLED");
    } else if (step.kind === "derive") {
      if (columns.has(step.column)) throw new Error("CALC_DUPLICATE_OUTPUT");
      if (step.column.includes(" "))
        throw new Error("CALC_GENERATED_NAME_INVALID");
      if (grouped && !columns.has(step.left.column))
        throw new Error("CALC_PRE_GROUP_COLUMN");
      const left = numericColumn(columns, step.left);
      const right = step.right ? numericColumn(columns, step.right) : undefined;
      if (left.nullable && !nonNull.has(left.key))
        throw new Error("CALC_NULL_OPERAND_UNHANDLED");
      if (right && right.nullable && !nonNull.has(right.key))
        throw new Error("CALC_NULL_OPERAND_UNHANDLED");
      if (step.operation === "cagr" && (!step.periods || step.periods <= 0))
        throw new Error("CALC_CAGR_PERIOD_INVALID");
      columns.set(step.column, {
        ...derivedColumn(step.operation, left, right),
        key: step.column,
      });
    } else if (step.kind === "project") {
      requireDistinct(step.columns);
      step.columns.forEach((column) => getColumn(columns, column));
      const projected = new Map(
        step.columns.map((column) => [column, columns.get(column)!]),
      );
      columns.clear();
      projected.forEach((column, key) => columns.set(key, column));
      for (const key of [...nonNull])
        if (!columns.has(key)) nonNull.delete(key);
    } else if (step.kind === "distinct") {
      requireDistinct(step.columns);
      step.columns.forEach((column) => getColumn(columns, column));
    } else if (step.kind === "group") {
      if (grouped) throw new Error("CALC_MULTIPLE_GROUPS");
      requireDistinct(step.by);
      step.by.forEach((column) => {
        const item = getColumn(columns, column);
        if (item.kind !== "dimension")
          throw new Error("CALC_GROUP_KEY_INVALID");
      });
      requireDistinct(step.aggregations.map((aggregation) => aggregation.as));
      step.aggregations.forEach((aggregation) => {
        if (aggregation.column) {
          const input = getColumn(columns, aggregation.column);
          if (input.nullable && !nonNull.has(input.key))
            throw new Error("CALC_NULL_OPERAND_UNHANDLED");
        }
        if (aggregation.weightColumn) {
          const weight = getColumn(columns, aggregation.weightColumn);
          if (weight.nullable && !nonNull.has(weight.key))
            throw new Error("CALC_NULL_OPERAND_UNHANDLED");
        }
      });
      const generated = step.aggregations.map((aggregation) =>
        validateAggregation(aggregation, columns),
      );
      const allowed = new Map(step.by.map((key) => [key, columns.get(key)!]));
      columns.clear();
      allowed.forEach((column, key) => columns.set(key, column));
      generated.forEach((column) => columns.set(column.key, column));
      grouped = true;
    } else if (step.kind === "sort") {
      if (step.keys.length === 0) throw new Error("CALC_ORDER_REQUIRED");
      requireDistinct(step.keys.map((key) => key.column));
      step.keys.forEach((key) => {
        const column = getColumn(columns, key.column);
        if (column.nullable && !nonNull.has(key.column))
          throw new Error("CALC_NULL_OPERAND_UNHANDLED");
      });
      ordered = true;
    } else if (step.kind === "rank") {
      if (!ordered) throw new Error("CALC_RANK_REQUIRES_ORDER");
      const rankColumn = getColumn(columns, step.column);
      if (rankColumn.nullable && !nonNull.has(step.column))
        throw new Error("CALC_NULL_OPERAND_UNHANDLED");
      step.partitionBy?.forEach((column) => getColumn(columns, column));
      if (columns.has(step.as)) throw new Error("CALC_DUPLICATE_OUTPUT");
      columns.set(step.as, {
        key: step.as,
        kind: "measure",
        dtype: "decimal",
        unit: "count",
        nullable: false,
        additivity: "non_additive",
        allowedAggregations: [],
        generated: true,
      });
    } else if (step.kind === "limit") {
      if (!ordered || !Number.isInteger(step.count) || step.count < 0)
        throw new Error("CALC_LIMIT_REQUIRES_DETERMINISTIC_ORDER");
      limited = true;
    }
  });
  requireDistinct(plan.output);
  plan.output.forEach((column) => getColumn(columns, column));
  if (
    plan.budget?.maxRows !== undefined &&
    table.rows.length > plan.budget.maxRows
  )
    throw new Error("CALC_PLAN_BUDGET_EXCEEDED");
}

function parse(value: TableValue): FixedDecimal {
  if (value === null) throw new Error("CALC_NULL_VALUE");
  return decimal(value);
}

function valuesEqual(left: TableValue, right: TableValue): boolean {
  if (left === null || right === null) return left === right;
  if (left === right) return true;
  try {
    return parse(left).compare(parse(right)) === 0;
  } catch {
    return false;
  }
}

function compare(left: TableValue, right: TableValue): -1 | 0 | 1 {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  try {
    return parse(left).compare(parse(right));
  } catch {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}

function matches(row: CalcRow, predicate: Predicate): boolean {
  if (predicate.kind === "all")
    return predicate.predicates.every((child) => matches(row, child));
  if (predicate.kind === "any")
    return predicate.predicates.some((child) => matches(row, child));
  const current = row.values[predicate.column];
  if (predicate.kind === "notNull") return current !== null;
  if (current === null) return false;
  if (predicate.kind === "in")
    return predicate.values.some((value) => valuesEqual(current, value));
  const target =
    typeof predicate.value === "object"
      ? row.values[predicate.value.column]
      : predicate.value;
  if (target === null) return false;
  const result = compare(current, target);
  return predicate.operator === "eq"
    ? result === 0
    : predicate.operator === "neq"
      ? result !== 0
      : predicate.operator === "gt"
        ? result > 0
        : predicate.operator === "gte"
          ? result >= 0
          : predicate.operator === "lt"
            ? result < 0
            : result <= 0;
}

function unionLineage(
  rows: readonly CalcRow[],
  columns: readonly string[],
): GroundingReference[] {
  const seen = new Set<string>();
  return rows
    .flatMap((row) => columns.flatMap((column) => row.lineage[column] ?? []))
    .filter((item) => {
      const key = JSON.stringify(item.locator);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function applyArithmetic(
  operation: ArithmeticOperator,
  left: FixedDecimal,
  right: FixedDecimal | undefined,
  all: FixedDecimal[],
  periods?: number,
): FixedDecimal {
  if (operation === "add") return left.add(right!);
  if (operation === "subtract" || operation === "delta")
    return left.subtract(right!);
  if (operation === "multiply") return left.multiply(right!);
  if (operation === "divide" || operation === "ratio")
    return left.divide(right!);
  if (operation === "percentChange")
    return left.subtract(right!).divide(right!).multiply(decimal("100"));
  if (operation === "shareOfTotal")
    return left
      .divide(all.reduce((total, value) => total.add(value), decimal("0")))
      .multiply(decimal("100"));
  if (!periods || !right || periods <= 0)
    throw new Error("CALC_CAGR_PERIOD_INVALID");
  if (left.compare(decimal("0")) <= 0 || right.compare(decimal("0")) <= 0)
    throw new Error("CALC_CAGR_ENDPOINT_INVALID");
  const ratio = left.divide(right);
  let low = BigInt(0);
  let high =
    ratio.units > BigInt(1_000_000)
      ? ratio.units + BigInt(1)
      : BigInt(1_000_001);
  const power = (candidate: bigint): bigint => {
    let value = BigInt(1_000_000);
    for (let index = 0; index < periods!; index += 1)
      value = (value * candidate) / BigInt(1_000_000);
    return value;
  };
  while (low + BigInt(1) < high) {
    const middle = (low + high) / BigInt(2);
    if (power(middle) <= ratio.units) low = middle;
    else high = middle;
  }
  return FixedDecimal.fromUnits((low - BigInt(1_000_000)) * BigInt(100));
}

export function executePlan(
  plan: CalcPlan,
  table: RegisteredTable,
): CalcResult {
  validatePlan(plan, table);
  const planHash = hash({ plan, representationHash: table.representationHash });
  const rows: CalcRow[] = table.rows.map((row) => ({
    rowKey: row.rowKey,
    values: { ...row.values },
    lineage: Object.fromEntries(
      Object.entries(row.lineage).map(([key, value]) => [key, [...value]]),
    ),
  }));
  let current = rows;
  const gaps: string[] = [];
  for (const step of plan.steps) {
    if (step.kind === "excludeAggregates") {
      const excluded = new Set(step.values);
      current = current.filter(
        (row) => !excluded.has(row.values[step.column] ?? ""),
      );
    } else if (step.kind === "excludeNulls") {
      current = current.filter((row) =>
        step.columns.every((column) => row.values[column] !== null),
      );
    } else if (step.kind === "filter") {
      current = current.filter((row) => matches(row, step.predicate));
    } else if (step.kind === "derive") {
      const all = current.map((row) => parse(row.values[step.left.column]));
      current = current.map((row) => {
        const left = parse(row.values[step.left.column]);
        const right = step.right
          ? parse(row.values[step.right.column])
          : undefined;
        const output = applyArithmetic(
          step.operation,
          left,
          right,
          all,
          step.periods,
        ).toString(step.displayScale ?? 6);
        return {
          ...row,
          values: { ...row.values, [step.column]: output },
          lineage: {
            ...row.lineage,
            [step.column]: unionLineage(
              [row],
              [step.left.column, ...(step.right ? [step.right.column] : [])],
            ),
          },
        };
      });
    } else if (step.kind === "project") {
      current = current.map((row) => ({
        ...row,
        values: Object.fromEntries(
          step.columns.map((column) => [column, row.values[column] ?? null]),
        ),
        lineage: Object.fromEntries(
          step.columns.map((column) => [column, row.lineage[column] ?? []]),
        ),
      }));
    } else if (step.kind === "distinct") {
      const byKey = new Map<string, CalcRow>();
      current.forEach((row) => {
        const key = JSON.stringify(
          step.columns.map((column) => row.values[column]),
        );
        const previous = byKey.get(key);
        if (!previous) byKey.set(key, row);
        else
          byKey.set(key, {
            ...previous,
            lineage: Object.fromEntries(
              step.columns.map((column) => [
                column,
                unionLineage([previous, row], [column]),
              ]),
            ),
          });
      });
      current = [...byKey.values()];
    } else if (step.kind === "group") {
      const groups = new Map<string, CalcRow[]>();
      current.forEach((row) => {
        const key = JSON.stringify(step.by.map((column) => row.values[column]));
        groups.set(key, [...(groups.get(key) ?? []), row]);
      });
      current = [...groups.entries()].map(([key, group]) => {
        const values: Record<string, TableValue> = {};
        const lineage: Record<string, GroundingReference[]> = {};
        step.by.forEach((column, index) => {
          values[column] = JSON.parse(key)[index];
          lineage[column] = unionLineage(group, [column]);
        });
        step.aggregations.forEach((aggregation) => {
          const input = aggregation.column
            ? group
                .map((row) => row.values[aggregation.column!])
                .filter((value): value is string => value !== null)
                .map(parse)
            : [];
          if (aggregation.operation === "count")
            values[aggregation.as] = String(group.length);
          else if (input.length === 0) {
            values[aggregation.as] = null;
            gaps.push(`empty-group:${key}:${aggregation.as}`);
          } else {
            let output: FixedDecimal;
            if (aggregation.operation === "sum")
              output = input.reduce(
                (total, value) => total.add(value),
                decimal("0"),
              );
            else if (aggregation.operation === "mean")
              output = input
                .reduce((total, value) => total.add(value), decimal("0"))
                .divide(decimal(input.length));
            else if (aggregation.operation === "minimum")
              output = input.reduce((a, b) => (a.compare(b) <= 0 ? a : b));
            else if (aggregation.operation === "maximum")
              output = input.reduce((a, b) => (a.compare(b) >= 0 ? a : b));
            else if (aggregation.operation === "median") {
              const sorted = [...input].sort((a, b) => a.compare(b));
              const middle = Math.floor(sorted.length / 2);
              output =
                sorted.length % 2
                  ? sorted[middle]
                  : sorted[middle - 1].add(sorted[middle]).divide(decimal("2"));
            } else {
              const pairs = group
                .map(
                  (row) =>
                    [
                      row.values[aggregation.column!],
                      row.values[aggregation.weightColumn!],
                    ] as const,
                )
                .filter(
                  (pair): pair is [string, string] =>
                    pair[0] !== null && pair[1] !== null,
                );
              const denominator = pairs.reduce(
                (total, pair) => total.add(parse(pair[1])),
                decimal("0"),
              );
              if (
                pairs.some(
                  (pair) => parse(pair[1]).compare(decimal("0")) <= 0,
                ) ||
                denominator.compare(decimal("0")) <= 0
              )
                throw new Error("CALC_WEIGHT_TOTAL_INVALID");
              output = pairs
                .reduce(
                  (total, pair) =>
                    total.add(parse(pair[0]).multiply(parse(pair[1]))),
                  decimal("0"),
                )
                .divide(denominator);
            }
            values[aggregation.as] = output.toString(
              aggregation.displayScale ?? 6,
            );
          }
          lineage[aggregation.as] = unionLineage(
            group,
            [
              aggregation.column,
              ...(aggregation.weightColumn ? [aggregation.weightColumn] : []),
            ].filter((value): value is string => Boolean(value)),
          );
        });
        return { rowKey: `group:${key}`, values, lineage };
      });
    } else if (step.kind === "sort") {
      current = [...current].sort((left, right) => {
        for (const key of step.keys) {
          const result = compare(
            left.values[key.column],
            right.values[key.column],
          );
          if (result !== 0) return key.direction === "asc" ? result : -result;
        }
        return left.rowKey < right.rowKey
          ? -1
          : left.rowKey > right.rowKey
            ? 1
            : 0;
      });
    } else if (step.kind === "rank") {
      const partitions = new Map<string, CalcRow[]>();
      current.forEach((row) => {
        const key = JSON.stringify(
          step.partitionBy?.map((column) => row.values[column]) ?? ["__all__"],
        );
        partitions.set(key, [...(partitions.get(key) ?? []), row]);
      });
      current = current.map((row) => {
        const key = JSON.stringify(
          step.partitionBy?.map((column) => row.values[column]) ?? ["__all__"],
        );
        const partition = partitions.get(key)!;
        const index = partition.findIndex((item) => item.rowKey === row.rowKey);
        const distinctBefore = new Set(
          partition.slice(0, index).map((item) => item.values[step.column]),
        ).size;
        const rank =
          step.method === "ordinal"
            ? index + 1
            : step.method === "dense"
              ? new Set(
                  partition
                    .slice(0, index)
                    .map((item) => item.values[step.column]),
                ).size + 1
              : partition.findIndex(
                  (item) =>
                    compare(
                      item.values[step.column],
                      row.values[step.column],
                    ) === 0,
                ) + 1;
        return {
          ...row,
          values: {
            ...row.values,
            [step.as]: String(
              step.method === "dense" ? distinctBefore + 1 : rank,
            ),
          },
          lineage: {
            ...row.lineage,
            [step.as]: unionLineage([row], [step.column]),
          },
        };
      });
    } else if (step.kind === "limit") {
      current = current.slice(0, step.count);
    }
  }
  const outputRows = current.map((row) => ({
    ...row,
    values: Object.fromEntries(
      plan.output.map((column) => [column, row.values[column] ?? null]),
    ),
    lineage: Object.fromEntries(
      plan.output.map((column) => [column, row.lineage[column] ?? []]),
    ),
  }));
  return {
    rows: outputRows,
    gaps,
    metadata: {
      representationHash: table.representationHash,
      planHash,
      engineVersion: CALCULATION_ENGINE_VERSION,
      engineHash: CALCULATION_ENGINE_HASH,
      policyVersion: CALCULATION_POLICY.version,
      policyHash: CALCULATION_POLICY_HASH,
    },
  };
}
