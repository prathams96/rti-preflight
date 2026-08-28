import { describe, expect, it } from "vitest";
import { snapshot } from "../evidence/snapshot";
import { createOfflinePreflightModule, RTIPreflightModule } from "./module";
import { planForAnalysis, type PlanAdapter } from "../model/plan-adapter";
import { NCRB_MEASURES, ncrbRegisteredTable } from "../calc/ncrb-plan";

async function needFor(text: string) {
  return (
    await createOfflinePreflightModule().interpret({
      text,
      traceId: "planning-test",
    })
  ).needs[0];
}

describe("registered-table calculation planning", () => {
  it("plans and executes stolen-only semantics without a recovery predicate", async () => {
    const need = await needFor(
      "Identify States/UTs where the value of property stolen increased between 2021 and 2023.",
    );
    const result = await createOfflinePreflightModule().resolve({
      need,
      snapshot,
    });

    expect(need.analysisIntent).toEqual({
      predicates: [
        {
          measure: "value of property stolen",
          comparison: "increase",
          fromPeriod: "2021",
          toPeriod: "2023",
        },
      ],
      logic: "and",
    });
    expect(result.outcome).toBe("DERIVED_FINDING");
    expect(result.rows).toHaveLength(29);
    expect(result.rows.map((row) => row.geography)).toContain("Gujarat");
    expect(result.rows[0].columns.map((column) => column.key)).toEqual([
      "stolen_2021",
      "stolen_2023",
      "stolen_delta",
    ]);
    expect(result.rows[0].recovery2021).toBeUndefined();
    expect(
      result.rows.find((row) => row.geography === "Gujarat"),
    ).toMatchObject({
      stolen2021: "175.1",
      stolen2023: "423.5",
      stolenDelta: "+248.4",
    });
    expect(result.calculation?.filters).toEqual([
      "2023 stolen value > 2021 stolen value",
      "exclude declared aggregate rows before comparison",
    ]);
  });

  it("keeps recovery-only, OR, ranking, and alternate-period semantics in the plan", async () => {
    const recovery = await needFor(
      "Which States/UTs had a lower property recovery percentage in 2023 than in 2021?",
    );
    expect(recovery.analysisIntent?.predicates[0].comparison).toBe("decrease");
    const recoveryPlan = planForAnalysis(
      recovery,
      ncrbRegisteredTable(snapshot),
    );
    expect(
      recoveryPlan.steps.find((step) => step.kind === "filter"),
    ).toMatchObject({
      predicate: {
        column: "recovery_2023",
        operator: "lt",
        value: { column: "recovery_2021" },
      },
    });
    const recoveryResult = await createOfflinePreflightModule().resolve({
      need: recovery,
      snapshot,
    });
    expect(recoveryResult.rows.map((row) => row.geography)).toEqual([
      "Andhra Pradesh",
      "Dadra and Nagar Haveli and Daman and Diu",
      "Goa",
      "Gujarat",
      "Haryana",
      "Jharkhand",
      "Karnataka",
      "Kerala",
      "Lakshadweep",
      "Madhya Pradesh",
      "Maharashtra",
      "Manipur",
      "Meghalaya",
      "Nagaland",
      "Puducherry",
      "Rajasthan",
      "Sikkim",
      "Uttarakhand",
      "West Bengal",
    ]);
    expect(recoveryResult.rows.map((row) => row.geography)).toContain(
      "Madhya Pradesh",
    );
    expect(recoveryResult.rows[0].columns.map((column) => column.key)).toEqual([
      "recovery_2021",
      "recovery_2023",
      "recovery_delta",
    ]);
    expect(recoveryResult.rows[0].stolen2021).toBeUndefined();

    const orNeed = await needFor(
      "Which States/UTs saw stolen property increase or recovery percentage decline between 2021 and 2023?",
    );
    const orResult = await createOfflinePreflightModule().resolve({
      need: orNeed,
      snapshot,
    });
    expect(orNeed.analysisIntent?.logic).toBe("or");
    expect(orResult.rows).toHaveLength(32);

    const ranked = await needFor(
      "Which 5 States/UTs had the largest increase in value of property stolen between 2021 and 2023?",
    );
    const rankedResult = await createOfflinePreflightModule().resolve({
      need: ranked,
      snapshot,
    });
    expect(rankedResult).toMatchObject({ outcome: "DERIVED_FINDING" });
    expect(ranked.analysisIntent?.ranking).toEqual({
      measure: "value of property stolen",
      direction: "desc",
      limit: 5,
    });
    expect(rankedResult.rows.map((row) => row.geography)).toEqual([
      "Manipur",
      "Haryana",
      "Maharashtra",
      "Gujarat",
      "Karnataka",
    ]);

    const alternate = await needFor(
      "Which States/UTs saw stolen property increase between 2022 and 2023?",
    );
    const alternateResult = await createOfflinePreflightModule().resolve({
      need: alternate,
      snapshot,
    });
    expect(alternateResult.outcome).toBe("DERIVED_FINDING");
    expect(alternateResult.rows[0].columns.map((column) => column.key)).toEqual(
      ["stolen_2022", "stolen_2023", "stolen_delta"],
    );
  });

  it("rejects a semantically wrong model plan without executing it", async () => {
    const need = await needFor(
      "Identify States/UTs where the value of property stolen increased between 2021 and 2023.",
    );
    const wrongPlanAdapter: PlanAdapter = {
      plan: async (input) =>
        planForAnalysis(
          {
            ...input.need,
            analysisIntent: {
              predicates: [
                ...input.need.analysisIntent!.predicates,
                {
                  measure: "percentage recovery of stolen property",
                  comparison: "decrease",
                  fromPeriod: "2021",
                  toPeriod: "2023",
                },
              ],
              logic: "and",
            },
          },
          input.table,
        ),
    };
    const result = await new RTIPreflightModule(
      undefined,
      wrongPlanAdapter,
    ).resolve({
      need,
      snapshot,
    });

    expect(result.outcome).toBe("NO_RELIABLE_FINDING");
    expect(result.planningFailure).toEqual({
      stage: "validation",
      code: "PLAN_SEMANTIC_FILTER_MISMATCH",
    });
    expect(result.rows).toEqual([]);
    expect(result.outcome).not.toBe("OUTSIDE_SNAPSHOT_COVERAGE");
  });

  it("distinguishes source coverage from provider planning failure", async () => {
    const providerFailure: PlanAdapter = {
      plan: async () => {
        throw new Error("PLAN_PROVIDER_FAILED");
      },
    };
    const need = await needFor(
      "Identify States/UTs where the value of property stolen increased between 2021 and 2023.",
    );
    const preflight = new RTIPreflightModule(undefined, providerFailure);
    const failed = await preflight.resolve({ need, snapshot });
    expect(failed.planningFailure?.stage).toBe("provider");
    expect(failed.evidenceStatus).toContain("not a source coverage failure");

    const unsupportedYear = await needFor(
      "Which States/UTs saw stolen property increase between 2019 and 2023?",
    );
    const out = await preflight.resolve({ need: unsupportedYear, snapshot });
    expect(out.outcome).toBe("OUTSIDE_SNAPSHOT_COVERAGE");
    expect(out.planningFailure).toBeUndefined();

    const table = ncrbRegisteredTable(snapshot);
    expect(table.columns.map((column) => column.key)).toContain("stolen_2022");
  });

  it("uses registered measure keys for a synthetic third measure", async () => {
    const table = ncrbRegisteredTable(snapshot);
    const withCases = {
      ...table,
      measures: [
        ...NCRB_MEASURES,
        {
          key: "cases",
          name: "number of cases",
          periodColumns: { "2021": "stolen_2021", "2023": "stolen_2023" },
          unit: "count" as const,
        },
      ],
    };
    const plan = planForAnalysis(
      {
        ...(await needFor(
          "Identify States/UTs where the number of cases increased between 2021 and 2023.",
        )),
        analysisIntent: {
          predicates: [
            {
              measure: "number of cases",
              comparison: "increase",
              fromPeriod: "2021",
              toPeriod: "2023",
            },
          ],
          logic: "and",
        },
      },
      withCases,
    );
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ kind: "derive", column: "cases_delta" }),
    );
    expect(plan.steps).not.toContainEqual(
      expect.objectContaining({ kind: "derive", column: "recovery_delta" }),
    );
  });

  it("fails safely when a model need has no analytical intent", async () => {
    const parsedNeed = await needFor(
      "Identify States/UTs where property stolen declined and recovery percentage increased between 2021 and 2023.",
    );
    const need = { ...parsedNeed, analysisIntent: undefined };
    const result = await createOfflinePreflightModule().resolve({
      need,
      snapshot,
    });
    expect(result.outcome).toBe("NO_RELIABLE_FINDING");
    expect(result.planningFailure).toMatchObject({
      code: "PLAN_INPUT_MISSING_ANALYSIS_INTENT",
    });
    expect(result.rows).toEqual([]);
    expect(result.outcome).not.toBe("OUTSIDE_SNAPSHOT_COVERAGE");
  });
});
