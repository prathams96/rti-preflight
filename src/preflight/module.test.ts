import { describe, expect, it } from "vitest";
import { createOfflinePreflightModule, RTIPreflightModule } from "./module";
import { snapshot } from "../evidence/snapshot";

describe("PreflightModule public seam", () => {
  it("interprets multiple needs without losing the citizen wording", async () => {
    const interpretation = await createOfflinePreflightModule().interpret({
      text: "Find property stolen data and also check my EPF claim",
      traceId: "trace-1",
    });
    expect(interpretation.originalText).toBe(
      "Find property stolen data and also check my EPF claim",
    );
    expect(interpretation.needs).toHaveLength(2);
    expect(interpretation.needs.map((need) => need.scenario)).toEqual([
      "ncrb-property",
      "epfo-status",
    ]);
    expect(interpretation.needs[0].informationHolderStatus).toBe("verified");
    expect(interpretation.clarifications).toEqual([]);
  });

  it("returns the approved 16-row derived NCRB result with Gujarat lineage", async () => {
    const preflight = new RTIPreflightModule();
    const interpretation = await preflight.interpret({
      text: "Between 2021 and 2023 which States reported property stolen up and recovery down?",
      traceId: "trace-2",
    });
    const result = await preflight.resolve({
      need: interpretation.needs[0],
      snapshot,
    });
    expect(result.outcome).toBe("DERIVED_FINDING");
    expect(result.rows).toHaveLength(16);
    const gujarat = result.rows.find((row) => row.geography === "Gujarat");
    expect(gujarat).toMatchObject({
      stolen2021: "175.1",
      stolen2023: "423.5",
      stolenDelta: "+248.4",
      recovery2021: "38.4",
      recovery2023: "23.2",
      recoveryDelta: "−15.2 pp",
    });
    expect(gujarat?.lineage).toHaveLength(5);
    expect(result.evidenceStatus).toContain("not directly stated");
  });

  it("keeps in-snapshot no-finding distinct from outside coverage", async () => {
    const preflight = new RTIPreflightModule();
    const railway = (
      await preflight.interpret({
        text: "How much was spent on lifts at New Delhi Railway Station?",
        traceId: "trace-3",
      })
    ).needs[0];
    const unsupported = (
      await preflight.interpret({
        text: "What is the budget for a local park?",
        traceId: "trace-4",
      })
    ).needs[0];
    const noFinding = await preflight.resolve({ need: railway, snapshot });
    const outside = await preflight.resolve({ need: unsupported, snapshot });
    expect(noFinding.outcome).toBe("NO_RELIABLE_FINDING");
    expect(noFinding.executionReceipt?.checkedResourceIds).toEqual([
      "northern-railway-filing-fixture",
    ]);
    expect(outside.outcome).toBe("OUTSIDE_SNAPSHOT_COVERAGE");
    expect(outside.executionReceipt).toBeUndefined();
  });
});
