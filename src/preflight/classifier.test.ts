import { describe, expect, it } from "vitest";
import { classifyOutcome } from "./classifier";

const need = { resolutionPreference: "unsure" as const };

describe("deterministic outcome classifier", () => {
  it("keeps every coverage and evidence state distinct", () => {
    expect(
      classifyOutcome({ need, execution: "CONFORMING", directFinding: true }),
    ).toBe("SOURCE_RESOLVED");
    expect(
      classifyOutcome({ need, execution: "CONFORMING", derivedFinding: true }),
    ).toBe("DERIVED_FINDING");
    expect(classifyOutcome({ need, execution: "PARTIAL" })).toBe(
      "PARTIALLY_RESOLVED",
    );
    expect(
      classifyOutcome({
        need,
        execution: "CONFORMING",
        evidenceConflict: true,
      }),
    ).toBe("EVIDENCE_CONFLICT");
    expect(
      classifyOutcome({
        need: { resolutionPreference: "formal" },
        execution: "CONFORMING",
        directFinding: true,
      }),
    ).toBe("FORMAL_RESPONSE_REQUIRED");
    expect(classifyOutcome({ need, execution: "IN_SCOPE_EMPTY" })).toBe(
      "NO_RELIABLE_FINDING",
    );
    expect(classifyOutcome({ need, execution: "OUT_OF_SNAPSHOT" })).toBe(
      "OUTSIDE_SNAPSHOT_COVERAGE",
    );
    expect(
      classifyOutcome({
        need,
        execution: "CONFORMING",
        officialServiceRoute: true,
      }),
    ).toBe("OFFICIAL_SERVICE_ROUTE");
  });
});
