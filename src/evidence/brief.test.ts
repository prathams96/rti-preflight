import { describe, expect, it } from "vitest";
import { snapshot } from "./snapshot";
import {
  buildEvidenceBrief,
  serializeEvidenceBrief,
  validateEvidenceBrief,
} from "./brief";
import { RTIPreflightModule } from "../preflight/module";

const SEARCH_DATE = "2026-08-27";

async function resolve(text: string) {
  const preflight = new RTIPreflightModule();
  const need = (await preflight.interpret({ text, traceId: "trace-brief" }))
    .needs[0];
  return { need, result: await preflight.resolve({ need, snapshot }) };
}

describe("Evidence Brief artifact", () => {
  it("preserves derived operands, operations, provenance, and disclosure", async () => {
    const { need, result } = await resolve(
      "Between 2021 and 2023 which States reported property stolen up and recovery down?",
    );
    const brief = buildEvidenceBrief({
      need,
      result,
      searchDate: SEARCH_DATE,
    });

    expect(brief).toMatchObject({
      artifactVersion: "1",
      kind: "evidence-brief",
      productName: "RTI Tathya",
      disclosure:
        "Independent research assistant—not an official RTI response.",
      searchDate: SEARCH_DATE,
      confirmedInformationNeed: {
        canonicalNeed: expect.stringContaining("individual States/UTs"),
      },
      result: {
        outcome: "DERIVED_FINDING",
        evidenceStatus: "Calculated from official data",
        calculation: {
          filters: expect.arrayContaining([
            "2023 stolen value > 2021 stolen value",
          ]),
        },
      },
    });
    expect(brief.result.rows).toHaveLength(16);
    expect(
      brief.result.rows.find((row) => row.geography === "Gujarat"),
    ).toMatchObject({
      stolen2021: "175.1",
      stolen2023: "423.5",
      stolenDelta: "+248.4",
      recoveryDelta: "−15.2 pp",
      unit: "INR crore",
    });
    expect(brief.result.rows[0].lineage[0].locator.kind).toBe("cell");
    expect(brief.result.executionReceipt?.snapshotHash).toBe(
      snapshot.representation.hash,
    );
    expect(JSON.stringify(brief)).not.toContain("trace-brief");
  });

  it("keeps synthetic evidence labelled and excludes internal fields", async () => {
    const { need, result } = await resolve(
      "Find an earlier RTI response relevant to a selected Central information need.",
    );
    const brief = buildEvidenceBrief({ need, result, searchDate: SEARCH_DATE });
    const evidence = brief.result.evidence[0];

    expect(evidence.sourceType).toBe("rti_response_fixture");
    expect(evidence.syntheticDisclosure).toMatch(
      /fictional|not an official|not a real RTI response/i,
    );
    expect(evidence.url).toBeUndefined();
    expect(
      evidence.grounding.every(
        (reference) => reference.locator.kind === "jsonPointer",
      ),
    ).toBe(true);
    expect(JSON.stringify(brief)).not.toMatch(
      /traceId|rawModel|filingProfile|secret|originalText/i,
    );
    const redactedBrief = buildEvidenceBrief({
      need: {
        ...need,
        canonicalNeed: "Check claim UAN 123456789012 and email me@example.com",
      },
      result,
      searchDate: SEARCH_DATE,
    });
    expect(JSON.stringify(redactedBrief)).not.toMatch(
      /123456789012|me@example.com/,
    );
  });

  it("exports partial, no-finding, and outside-coverage states without inventing evidence", async () => {
    const noFinding = await resolve(
      "How much was spent on lifts at New Delhi Railway Station?",
    );
    const outside = await resolve("What is the budget for a local park?");
    const partial = structuredClone(noFinding.result);
    partial.outcome = "PARTIALLY_RESOLVED";
    partial.headline = "Some requested records remain unresolved.";
    partial.evidence = [];
    partial.gaps = ["The requested period is not represented."];

    const noFindingBrief = buildEvidenceBrief({
      need: noFinding.need,
      result: noFinding.result,
      searchDate: SEARCH_DATE,
    });
    const outsideBrief = buildEvidenceBrief({
      need: outside.need,
      result: outside.result,
      searchDate: SEARCH_DATE,
    });
    const partialBrief = buildEvidenceBrief({
      need: noFinding.need,
      result: partial,
      searchDate: SEARCH_DATE,
    });

    expect(noFindingBrief.result.executionReceipt?.checkedResourceIds).toEqual([
      "northern-railway-filing-fixture",
    ]);
    expect(noFindingBrief.result.evidence).toEqual([]);
    expect(outsideBrief.result.coverageManifest?.checkedAuthority).toBe(
      outside.need.informationHolder,
    );
    expect(outsideBrief.result.evidence).toEqual([]);
    expect(partialBrief.result.outcome).toBe("PARTIALLY_RESOLVED");
    expect(partialBrief.result.gaps).toEqual([
      "The requested period is not represented.",
    ]);
  });

  it("serializes deterministically and rejects incomplete public provenance", async () => {
    const { need, result } = await resolve(
      "Between 2021 and 2023 which States reported property stolen up and recovery down?",
    );
    const input = { need, result, searchDate: SEARCH_DATE };
    expect(serializeEvidenceBrief(input)).toBe(serializeEvidenceBrief(input));
    expect(Object.isFrozen(buildEvidenceBrief(input))).toBe(true);

    const missingLineage = structuredClone(result);
    missingLineage.rows[0].lineage = [];
    expect(() =>
      buildEvidenceBrief({
        need,
        result: missingLineage,
        searchDate: SEARCH_DATE,
      }),
    ).toThrow("EVIDENCE_BRIEF_LINEAGE_MISSING");

    const missingMetadata = structuredClone(result);
    missingMetadata.calculation = undefined;
    expect(() =>
      buildEvidenceBrief({
        need,
        result: missingMetadata,
        searchDate: SEARCH_DATE,
      }),
    ).toThrow("EVIDENCE_BRIEF_CALCULATION_METADATA_MISSING");
  });

  it("rejects synthetic evidence without a clear disclosure", async () => {
    const { need, result } = await resolve(
      "Find an earlier RTI response relevant to a selected Central information need.",
    );
    const invalid = structuredClone(result);
    invalid.evidence[0].syntheticDisclosure = undefined;
    expect(() =>
      buildEvidenceBrief({ need, result: invalid, searchDate: SEARCH_DATE }),
    ).toThrow("EVIDENCE_BRIEF_SYNTHETIC_DISCLOSURE_MISSING");
  });

  it("rejects official evidence without a direct source link", async () => {
    const { need, result } = await resolve(
      "Between 2021 and 2023 which States reported property stolen up and recovery down?",
    );
    const invalid = structuredClone(result);
    invalid.evidence[0].url = undefined;
    invalid.evidence[0].alternateUrl = undefined;
    expect(() =>
      buildEvidenceBrief({ need, result: invalid, searchDate: SEARCH_DATE }),
    ).toThrow("EVIDENCE_BRIEF_SOURCE_LINK_MISSING");
  });

  it("allows callers to validate a detached brief explicitly", async () => {
    const { need, result } = await resolve(
      "What is the budget for a local park?",
    );
    const brief = buildEvidenceBrief({ need, result, searchDate: SEARCH_DATE });
    expect(() => validateEvidenceBrief(brief)).not.toThrow();
  });
});
