import type { CalcPlan, CalcStep, Predicate } from "../calc/registered-table";
import type { PlanAdapter, PlanInput } from "./plan-adapter";
import {
  OPENAI_MODEL,
  OPENAI_REASONING,
  OPENAI_TIMEOUT_MS,
  isProviderTimeout,
  providerFailure,
  PROVIDER_TIMEOUT,
} from "./openai-config.server";

type ResponsePayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string; type?: string; refusal?: string }>;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isPredicate(value: unknown): value is Predicate {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "all" || value.kind === "any")
    return (
      hasOnlyKeys(value, ["kind", "predicates"]) &&
      Array.isArray(value.predicates) &&
      value.predicates.length > 0 &&
      value.predicates.every(isPredicate)
    );
  if (value.kind === "notNull")
    return (
      hasOnlyKeys(value, ["kind", "column"]) && typeof value.column === "string"
    );
  if (value.kind === "in")
    return (
      hasOnlyKeys(value, ["kind", "column", "values"]) &&
      typeof value.column === "string" &&
      isStringArray(value.values) &&
      value.values.length > 0
    );
  return (
    value.kind === "compare" &&
    hasOnlyKeys(value, ["kind", "column", "operator", "value"]) &&
    typeof value.column === "string" &&
    ["eq", "neq", "gt", "gte", "lt", "lte"].includes(String(value.operator)) &&
    (typeof value.value === "string" ||
      (isRecord(value.value) && typeof value.value.column === "string"))
  );
}

function isCalcStep(value: unknown): value is CalcStep {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "excludeAggregates":
      return (
        hasOnlyKeys(value, ["kind", "column", "values"]) &&
        typeof value.column === "string" &&
        isStringArray(value.values)
      );
    case "excludeNulls":
      return (
        hasOnlyKeys(value, ["kind", "columns"]) && isStringArray(value.columns)
      );
    case "filter":
      return (
        hasOnlyKeys(value, ["kind", "predicate"]) &&
        isPredicate(value.predicate)
      );
    case "derive":
      return (
        hasOnlyKeys(value, [
          "kind",
          "column",
          "operation",
          "left",
          "right",
          "displayScale",
          "periods",
        ]) &&
        typeof value.column === "string" &&
        [
          "add",
          "subtract",
          "multiply",
          "divide",
          "delta",
          "percentChange",
          "ratio",
          "shareOfTotal",
          "cagr",
        ].includes(String(value.operation)) &&
        isRecord(value.left) &&
        typeof value.left.column === "string" &&
        (value.right === undefined ||
          (isRecord(value.right) && typeof value.right.column === "string")) &&
        (value.displayScale === undefined ||
          typeof value.displayScale === "number") &&
        (value.periods === undefined || typeof value.periods === "number")
      );
    case "project":
    case "distinct":
      return (
        hasOnlyKeys(value, ["kind", "columns"]) && isStringArray(value.columns)
      );
    case "sort":
      return (
        hasOnlyKeys(value, ["kind", "keys"]) &&
        Array.isArray(value.keys) &&
        value.keys.length > 0 &&
        value.keys.every(
          (key) =>
            isRecord(key) &&
            typeof key.column === "string" &&
            (key.direction === "asc" || key.direction === "desc"),
        )
      );
    case "group":
      return (
        hasOnlyKeys(value, ["kind", "by", "aggregations"]) &&
        isStringArray(value.by) &&
        Array.isArray(value.aggregations) &&
        value.aggregations.every(isAggregation)
      );
    case "rank":
      return (
        hasOnlyKeys(value, ["kind", "column", "as", "method", "partitionBy"]) &&
        typeof value.column === "string" &&
        typeof value.as === "string" &&
        ["ordinal", "dense", "competition"].includes(String(value.method)) &&
        (value.partitionBy === undefined || isStringArray(value.partitionBy))
      );
    case "limit":
      return (
        hasOnlyKeys(value, ["kind", "count"]) &&
        Number.isInteger(value.count) &&
        Number(value.count) >= 0
      );
    default:
      return false;
  }
}

function isAggregation(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "as",
      "operation",
      "column",
      "weightColumn",
      "displayScale",
    ]) &&
    typeof value.as === "string" &&
    [
      "count",
      "sum",
      "mean",
      "median",
      "minimum",
      "maximum",
      "weightedMean",
    ].includes(String(value.operation)) &&
    (value.column === undefined || typeof value.column === "string") &&
    (value.weightColumn === undefined ||
      typeof value.weightColumn === "string") &&
    (value.displayScale === undefined || typeof value.displayScale === "number")
  );
}

export function parseCalcPlan(value: unknown): CalcPlan {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["version", "tableId", "steps", "output"]) ||
    typeof value.version !== "string" ||
    typeof value.tableId !== "string" ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    !value.steps.every(isCalcStep) ||
    !isStringArray(value.output) ||
    value.output.length === 0
  )
    throw new Error("PLAN_PARSE_FAILED");
  return {
    version: value.version,
    tableId: value.tableId,
    steps: value.steps,
    output: value.output,
  };
}

const predicateSchema = {
  $defs: {
    predicate: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: ["all", "any", "compare", "in", "notNull"],
        },
        predicates: { type: "array", items: { $ref: "#/$defs/predicate" } },
        column: { type: "string" },
        operator: {
          type: "string",
          enum: ["eq", "neq", "gt", "gte", "lt", "lte"],
        },
        value: {
          anyOf: [
            { type: "string" },
            {
              type: "object",
              additionalProperties: false,
              properties: { column: { type: "string" } },
              required: ["column"],
            },
          ],
        },
        values: { type: "array", items: { type: "string" } },
      },
      required: ["kind"],
    },
  },
};

export const CALC_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "string" },
    tableId: { type: "string" },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { const: "excludeAggregates" },
              column: { type: "string" },
              values: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "column", "values"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { const: "excludeNulls" },
              columns: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "columns"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { const: "filter" },
              predicate: { $ref: "#/$defs/predicate" },
            },
            required: ["kind", "predicate"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { const: "derive" },
              column: { type: "string" },
              operation: {
                type: "string",
                enum: [
                  "add",
                  "subtract",
                  "multiply",
                  "divide",
                  "delta",
                  "percentChange",
                  "ratio",
                  "shareOfTotal",
                  "cagr",
                ],
              },
              left: {
                type: "object",
                additionalProperties: false,
                properties: { column: { type: "string" } },
                required: ["column"],
              },
              right: {
                type: "object",
                additionalProperties: false,
                properties: { column: { type: "string" } },
                required: ["column"],
              },
              displayScale: { type: "number" },
              periods: { type: "number" },
            },
            required: ["kind", "column", "operation", "left"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { const: "project" },
              columns: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "columns"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { const: "distinct" },
              columns: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "columns"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { const: "sort" },
              keys: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    column: { type: "string" },
                    direction: { type: "string", enum: ["asc", "desc"] },
                  },
                  required: ["column", "direction"],
                },
              },
            },
            required: ["kind", "keys"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { const: "limit" },
              count: { type: "integer", minimum: 0 },
            },
            required: ["kind", "count"],
          },
        ],
      },
    },
    output: { type: "array", minItems: 1, items: { type: "string" } },
  },
  required: ["version", "tableId", "steps", "output"],
  ...predicateSchema,
};

function outputText(payload: ResponsePayload): string {
  return (
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type !== "refusal")
      .map((item) => item.text ?? "")
      .join("") ??
    ""
  );
}

function planningContext(input: PlanInput): string {
  return JSON.stringify({
    informationNeed: input.need,
    table: {
      id: input.table.id,
      columns: input.table.columns,
      measures: input.table.measures,
      aggregateRowKeys: input.table.aggregateRowKeys,
      allowedOperations: input.table.allowedOperations,
    },
    approvedCapability: input.approvedCapability,
  });
}

export class OpenAICalcPlanAdapter implements PlanAdapter {
  async plan(input: PlanInput): Promise<CalcPlan> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("PLAN_PROVIDER_FAILED");
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          store: false,
          reasoning: OPENAI_REASONING,
          input: [
            {
              role: "system",
              content:
                "You are planning a calculation over one registered deterministic table. You do not calculate the answer. You do not invent values, columns, sources, periods, measures, or operations. Use only the supplied table schema and allowed operations. Return only a declarative CalcPlan. Do not add predicates, measures, time periods, rankings, groupings, or filters that were not requested. Preserve AND versus OR semantics. If the request cannot be expressed with the supplied schema and operations, return a plan that the application will reject; never approximate it. The application validates and executes your plan deterministically.",
            },
            { role: "user", content: planningContext(input) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "registered_table_calc_plan",
              strict: true,
              schema: CALC_PLAN_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });
    } catch (error) {
      if (isProviderTimeout(error)) throw new Error(PROVIDER_TIMEOUT);
      throw new Error("PLAN_PROVIDER_FAILED");
    }
    if (!response.ok) {
      const { code } = await providerFailure("plan", response);
      throw new Error(`PLAN_PROVIDER_FAILED:${code}`);
    }
    let payload: ResponsePayload;
    try {
      payload = (await response.json()) as ResponsePayload;
    } catch {
      throw new Error("PLAN_PARSE_FAILED");
    }
    const raw = outputText(payload);
    if (!raw) throw new Error("PLAN_PROVIDER_REFUSED");
    try {
      return parseCalcPlan(JSON.parse(raw));
    } catch (error) {
      if (error instanceof Error && error.message === "PLAN_PARSE_FAILED")
        throw error;
      throw new Error("PLAN_PARSE_FAILED");
    }
  }
}
