import type { CalcPlan, CalcStep, Predicate } from "../calc/registered-table";
import {
  measureBinding,
  type PlanAdapter,
  type PlanInput,
} from "./plan-adapter";
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
          value.right === null ||
          (isRecord(value.right) && typeof value.right.column === "string")) &&
        (value.displayScale === undefined ||
          value.displayScale === null ||
          typeof value.displayScale === "number") &&
        (value.periods === undefined ||
          value.periods === null ||
          typeof value.periods === "number")
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
  const steps = (value.steps as unknown[]).map((step) => {
    if (!isRecord(step) || step.kind !== "derive") return step as CalcStep;
    return {
      ...step,
      right: step.right ?? undefined,
      displayScale: step.displayScale ?? undefined,
      periods: step.periods ?? undefined,
    } as CalcStep;
  });
  return {
    version: value.version,
    tableId: value.tableId,
    steps,
    output: value.output,
  };
}

const predicateSchema = {
  $defs: {
    predicate: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["all"] },
            predicates: {
              type: "array",
              minItems: 1,
              items: { $ref: "#/$defs/predicate" },
            },
          },
          required: ["kind", "predicates"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["any"] },
            predicates: {
              type: "array",
              minItems: 1,
              items: { $ref: "#/$defs/predicate" },
            },
          },
          required: ["kind", "predicates"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["compare"] },
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
          },
          required: ["kind", "column", "operator", "value"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["in"] },
            column: { type: "string" },
            values: { type: "array", items: { type: "string" } },
          },
          required: ["kind", "column", "values"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["notNull"] },
            column: { type: "string" },
          },
          required: ["kind", "column"],
        },
      ],
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
              kind: { type: "string", enum: ["excludeAggregates"] },
              column: { type: "string" },
              values: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "column", "values"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["excludeNulls"] },
              columns: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "columns"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["filter"] },
              predicate: { $ref: "#/$defs/predicate" },
            },
            required: ["kind", "predicate"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["derive"] },
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
                anyOf: [
                  {
                    type: "object",
                    additionalProperties: false,
                    properties: { column: { type: "string" } },
                    required: ["column"],
                  },
                  { type: "null" },
                ],
              },
              displayScale: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              periods: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
            },
            required: [
              "kind",
              "column",
              "operation",
              "left",
              "right",
              "displayScale",
              "periods",
            ],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["project"] },
              columns: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "columns"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["distinct"] },
              columns: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "columns"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["sort"] },
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
              kind: { type: "string", enum: ["limit"] },
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
  const intent = input.need.analysisIntent;
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
    requestedShape: intent
      ? {
          comparisons: intent.predicates.map((predicate) => {
            const measure = measureBinding(input.table, predicate.measure);
            return {
              measureKey: measure?.key ?? null,
              fromColumn: measure?.periodColumns[predicate.fromPeriod] ?? null,
              toColumn: measure?.periodColumns[predicate.toPeriod] ?? null,
              deltaColumn: measure ? `${measure.key}_delta` : null,
              operator: predicate.comparison === "increase" ? "gt" : "lt",
            };
          }),
          logic: intent.logic,
          ranking: intent.ranking ?? null,
        }
      : null,
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
                "You are planning a calculation over one registered deterministic table. You do not calculate the answer. You do not invent values, columns, sources, periods, measures, or operations. Use only the supplied table schema and allowed operations. Return only a declarative CalcPlan. Do not add predicates, measures, time periods, rankings, groupings, or filters that were not requested. Preserve AND versus OR semantics. For a supported two-period comparison, derive one delta column per requested measure using the registered measure key plus _delta with operation exactly delta, compare the requested to-period source column directly with the requested from-period source column (gt for increase, lt for decrease), and never filter on a derived delta or on a literal zero. Start by excluding the declared aggregate row keys. If ranking is requested, exclude nulls from the ranked delta before sorting, then sort by the requested measure delta, add the requested limit, and project the geography, each requested from-period column, to-period column, and delta in that order. Otherwise sort by the geography column ascending. The final project columns and output must match exactly. If the request cannot be expressed with the supplied schema and operations, return a plan that the application will reject; never approximate it. The application validates and executes your plan deterministically.",
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
