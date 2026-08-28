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
    expect(outside.coverageManifest?.capabilityManifestHash).toBe(
      snapshot.capabilityManifest.hash,
    );
    expect(outside.headline).toBe(
      "We couldn’t verify this from the sources available in this prototype.",
    );
    expect(outside.evidenceStatus).toBe("Not verified from available sources");
    expect(outside.meaning).toContain("cannot claim");
  });

  it("preserves a supported research finding when formal response is selected", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "Between 2021 and 2023 which States reported property stolen up and recovery down?",
        traceId: "trace-formal",
      })
    ).needs[0];
    const result = await preflight.resolve({
      need: { ...need, resolutionPreference: "formal" },
      snapshot,
    });
    expect(result.outcome).toBe("FORMAL_RESPONSE_REQUIRED");
    expect(result.researchFinding?.outcome).toBe("DERIVED_FINDING");
    expect(result.researchFinding?.rows).toHaveLength(16);
    expect(result.formalResponseReason).toContain("written response");
  });

  it("emits complete audit metadata for the deterministic calculation", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "Between 2021 and 2023 which States reported property stolen up and recovery down?",
        traceId: "trace-audit",
      })
    ).needs[0];
    const result = await preflight.resolve({ need, snapshot });
    expect(result.executionReceipt).toMatchObject({
      snapshotHash: snapshot.representation.hash,
      capabilityManifestHash: snapshot.capabilityManifest.hash,
      engineVersion: "registered-table-decimal-v1",
      policyVersion: "decimal-policy-v1",
    });
    expect(result.calculationMetadata?.planHash).toBe(
      result.calculation?.planHash,
    );
  });

  it("keeps arbitrary unsupported needs on a scoped filing path", async () => {
    const preflight = new RTIPreflightModule();
    const prompts = [
      "What is the budget for a local park?",
      "Why was my neighbourhood road delayed?",
      "Please send me the records about a district library",
    ];

    for (const [index, text] of prompts.entries()) {
      const need = (
        await preflight.interpret({
          text,
          traceId: `trace-unsupported-${index}`,
        })
      ).needs[0];
      const result = await preflight.resolve({ need, snapshot });
      expect(result.outcome).toBe("OUTSIDE_SNAPSHOT_COVERAGE");
      expect(result.searchScope).toContain("Capability Manifest");
      expect(result.recommendedAction).toContain("Filing Draft");
      expect(result.meaning).toContain("cannot claim");
    }
  });

  it("turns grievance wording into a records-focused path without answering why", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "Why did the municipal road work fail?",
        traceId: "trace-grievance",
      })
    ).needs[0];
    const result = await preflight.resolve({ need, snapshot });
    expect(result.outcome).toBe("OUTSIDE_SNAPSHOT_COVERAGE");
    expect(result.recommendedAction).toContain("records-focused");
    expect(result.meaning).not.toMatch(/the reason|why it failed/i);
  });

  it("preserves the related finding when formal response is requested for a no-finding need", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "How much was spent on lifts at New Delhi Railway Station?",
        traceId: "trace-formal-railway",
      })
    ).needs[0];
    const result = await preflight.resolve({
      need: { ...need, resolutionPreference: "formal" },
      snapshot,
    });
    expect(result.outcome).toBe("FORMAL_RESPONSE_REQUIRED");
    expect(result.researchFinding?.outcome).toBe("NO_RELIABLE_FINDING");
    expect(result.researchFinding?.evidence).toEqual([]);
    expect(result.formalResponseReason).toContain("written response");
  });

  it("routes an own EPF claim to the versioned official service route", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "What is the status of my EPF claim?",
        traceId: "trace-epfo-own",
      })
    ).needs[0];
    const result = await preflight.resolve({ need, snapshot });
    expect(need.recordSubject).toBe("own");
    expect(result.outcome).toBe("OFFICIAL_SERVICE_ROUTE");
    expect(result.serviceRoute).toMatchObject({
      id: "epfo-claim-status",
      officialUrl: "https://passbook.epfindia.gov.in/MemClaimStatusUAN/",
      verifiedAt: "2026-08-27",
    });
    expect(result.meaning).toMatch(/does not .*promise/i);
  });

  it("does not route another person's EPF identifier to an own-record service", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "Check someone else's EPF claim UAN 123456789012.",
        traceId: "trace-epfo-other",
      })
    ).needs[0];
    const result = await preflight.resolve({ need, snapshot });
    expect(need.recordSubject).toBe("another");
    expect(result.outcome).toBe("FORMAL_RESPONSE_REQUIRED");
    expect(result.evidence).toEqual([]);
    expect(result.meaning).toContain("not permission");
    expect(result.meaning).not.toContain("123456789012");
  });

  it("grounds every value of the fictional previous-response fixture", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "Find an earlier RTI response relevant to a selected Central information need.",
        traceId: "trace-fixture",
      })
    ).needs[0];
    const result = await preflight.resolve({ need, snapshot });
    expect(result.outcome).toBe("SOURCE_RESOLVED");
    expect(result.evidence[0]).toMatchObject({
      sourceType: "rti_response_fixture",
      syntheticDisclosure: expect.stringContaining("not an official response"),
    });
    expect(result.evidence[0].url).toBeUndefined();
    expect(result.evidence[0].grounding.length).toBeGreaterThanOrEqual(3);
    for (const grounding of result.evidence[0].grounding) {
      expect(grounding.locator.kind).toBe("jsonPointer");
      expect(grounding.locatedContentHash).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(result.evidenceStatus).toContain("Fictional");
  });

  it("keeps the CPCB conflict cut outside the snapshot and never emits a conflict", async () => {
    const preflight = new RTIPreflightModule();
    const interpretation = await preflight.interpret({
      text: "Compare the air-quality metric represented differently in two CPCB publications.",
      traceId: "trace-cpcb-cut",
    });
    expect(interpretation.needs[0].scenario).toBe("unsupported");
    const result = await preflight.resolve({
      need: interpretation.needs[0],
      snapshot,
    });
    expect(result.outcome).toBe("OUTSIDE_SNAPSHOT_COVERAGE");
    expect(result.outcome).not.toBe("EVIDENCE_CONFLICT");
    expect(result.meaning).toContain("cannot claim");
  });
});
