import { describe, expect, it } from "vitest";
import { decimal } from "./decimal";
import { executeNcrbPlan, NCRB_PLAN, ncrbRegisteredTable } from "./ncrb-plan";
import {
  executePlan,
  type CalcPlan,
  type RegisteredTable,
} from "./registered-table";
import { snapshot } from "../evidence/snapshot";

const emptyLineage = { category: [], value: [], weight: [] };
const table: RegisteredTable = {
  id: "fixture",
  representationHash: "fixture-representation-v1",
  columns: [
    {
      key: "category",
      kind: "dimension",
      dtype: "text",
      unit: "text",
      nullable: false,
      additivity: "non_additive",
      allowedAggregations: ["count"],
    },
    {
      key: "value",
      kind: "measure",
      dtype: "decimal",
      unit: "INR crore",
      nullable: false,
      additivity: "additive",
      allowedAggregations: [
        "sum",
        "mean",
        "median",
        "minimum",
        "maximum",
        "weightedMean",
      ],
    },
    {
      key: "weight",
      kind: "measure",
      dtype: "decimal",
      unit: "count",
      nullable: false,
      additivity: "additive",
      allowedAggregations: ["sum", "mean", "minimum", "maximum"],
    },
  ],
  rows: [
    {
      rowKey: "a-1",
      values: { category: "a", value: "1.005", weight: "1" },
      lineage: emptyLineage,
    },
    {
      rowKey: "a-2",
      values: { category: "a", value: "2.005", weight: "3" },
      lineage: emptyLineage,
    },
    {
      rowKey: "b-1",
      values: { category: "b", value: "4.000", weight: "2" },
      lineage: emptyLineage,
    },
    {
      rowKey: "c-1",
      values: { category: "c", value: "4.000", weight: "1" },
      lineage: emptyLineage,
    },
  ],
};

describe("registered-table calculation seam", () => {
  it("uses fixed-point half-up display rounding", () => {
    expect(decimal("1.005001").toString(3)).toBe("1.005");
    expect(decimal("1.005500").toString(3)).toBe("1.006");
    expect(decimal("0.1").add(decimal("0.2")).toString(1)).toBe("0.3");
    expect(decimal("1.000001").multiply(decimal("1.000001")).toString(6)).toBe(
      "1.000002",
    );
  });

  it("executes the NCRB plan with the approved 16-row golden result", () => {
    const result = executeNcrbPlan(snapshot);
    expect(result.rows.map((row) => row.values.state)).toEqual([
      "Andhra Pradesh",
      "Dadra and Nagar Haveli and Daman and Diu",
      "Goa",
      "Gujarat",
      "Haryana",
      "Jharkhand",
      "Karnataka",
      "Kerala",
      "Lakshadweep",
      "Maharashtra",
      "Manipur",
      "Meghalaya",
      "Rajasthan",
      "Sikkim",
      "Uttarakhand",
      "West Bengal",
    ]);
    expect(
      result.rows.every(
        (row) =>
          !["Total State (S)", "Total UT (S)", "Total All India"].includes(
            row.values.state!,
          ),
      ),
    ).toBe(true);
    const gujarat = result.rows.find((row) => row.values.state === "Gujarat")!;
    expect(gujarat.values).toMatchObject({
      stolen_2021: "175.1",
      stolen_2023: "423.5",
      stolen_delta: "248.4",
      recovery_2021: "38.4",
      recovery_2023: "23.2",
      recovery_delta: "-15.2",
    });
    expect(gujarat.lineage.stolen_delta).toHaveLength(2);
    expect(result.metadata).toMatchObject({
      representationHash: snapshot.representation.hash,
      engineVersion: "registered-table-decimal-v1",
      policyVersion: "decimal-policy-v1",
    });
  });

  it("supports grouping, weighted means, deterministic ranking, and limits", () => {
    const plan: CalcPlan = {
      version: "fixture-v1",
      tableId: "fixture",
      steps: [
        {
          kind: "group",
          by: ["category"],
          aggregations: [
            {
              as: "weighted",
              operation: "weightedMean",
              column: "value",
              weightColumn: "weight",
              displayScale: 3,
            },
            { as: "count", operation: "count" },
          ],
        },
        { kind: "sort", keys: [{ column: "weighted", direction: "desc" }] },
        { kind: "rank", column: "weighted", as: "rank", method: "competition" },
        { kind: "limit", count: 1 },
      ],
      output: ["category", "weighted", "count", "rank"],
    };
    const result = executePlan(plan, table);
    expect(result.rows[0].values).toMatchObject({
      category: "b",
      weighted: "4.000",
      count: "1",
      rank: "1",
    });
    const tied = executePlan(
      { ...plan, steps: plan.steps.filter((step) => step.kind !== "limit") },
      table,
    );
    expect(tied.rows.map((row) => row.values.rank)).toEqual(["1", "1", "3"]);
  });

  it("rejects invalid algebra before execution", () => {
    const invalid: CalcPlan = {
      version: "fixture-v1",
      tableId: "fixture",
      steps: [
        {
          kind: "group",
          by: ["category"],
          aggregations: [{ as: "bad", operation: "sum", column: "category" }],
        },
      ],
      output: ["category", "bad"],
    };
    expect(() => executePlan(invalid, table)).toThrow(
      "CALC_NUMERIC_COLUMN_REQUIRED",
    );
    const lateLimit: CalcPlan = {
      version: "fixture-v1",
      tableId: "fixture",
      steps: [
        { kind: "sort", keys: [{ column: "category", direction: "asc" }] },
        { kind: "limit", count: 1 },
        {
          kind: "filter",
          predicate: { kind: "in", column: "category", values: ["a"] },
        },
      ],
      output: ["category"],
    };
    expect(() => executePlan(lateLimit, table)).toThrow(
      "CALC_MUTATION_AFTER_LIMIT",
    );
    const divide: CalcPlan = {
      version: "fixture-v1",
      tableId: "fixture",
      steps: [
        {
          kind: "derive",
          column: "ratio",
          operation: "divide",
          left: { column: "value" },
          right: { column: "weight" },
        },
      ],
      output: ["ratio"],
    };
    expect(() => executePlan(divide, table)).not.toThrow();
  });

  it("keeps the registered table tied to the injected representation", () => {
    expect(ncrbRegisteredTable(snapshot).representationHash).toBe(
      snapshot.representation.hash,
    );
    expect(NCRB_PLAN.tableId).toBe("ncrb-property-table-20a");
  });
});
