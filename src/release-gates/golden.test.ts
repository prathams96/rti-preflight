import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NCRB_ROW_KEYS_HASH,
  NCRB_SOURCE_BLOB_HASH,
  groundingForFixtureValue,
  snapshot,
} from "../evidence/snapshot";
import {
  createOfflinePreflightModule,
  RTIPreflightModule,
} from "../preflight/module";
import { groundingCatalog, verifyNarration } from "../narration/verifier";
import {
  DISCLOSURE_LEDGER,
  EXPECTED_DISCLOSURE_COMPONENTS,
  validateDisclosureLedger,
} from "../disclosure/ledger";
import {
  DEMO_OTP,
  NORTHERN_RAILWAY_HOLDER,
  NORTHERN_RAILWAY_ROUTE,
  createFilingModule,
} from "../filing";

afterEach(() => vi.unstubAllEnvs());

async function interpreted(text: string, traceId: string) {
  return (await createOfflinePreflightModule().interpret({ text, traceId }))
    .needs[0];
}

describe("release gates", () => {
  it("keeps the derived NCRB resolution byte-stable and fully lineaged", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const preflight = new RTIPreflightModule();
    const need = await interpreted(
      "Between 2021 and 2023 which States reported property stolen up and recovery down?",
      "golden-ncrb",
    );
    const first = await preflight.resolve({
      need,
      snapshot,
      traceId: "tr-0123456789abcdef",
    });
    const second = await preflight.resolve({
      need,
      snapshot,
      traceId: "tr-0123456789abcdef",
    });

    expect(first).toEqual(second);
    expect(first.outcome).toBe("DERIVED_FINDING");
    expect(first.rows).toHaveLength(16);
    expect(first.executionReceipt).toMatchObject({
      snapshotHash:
        "0298344d08b76fa1edfafcb796fe940f31bfa0f0520ddb215f88ae9523f10b37",
      capabilityManifestHash:
        "9e1969dcae001d1529a756d694bf2cd6f8cb29da26b1d2d2559783b9528490b7",
      checkedResourceIds: ["ncrb-property-table-20a"],
    });
    expect(snapshot.source.sourceBlobHash).toBe(NCRB_SOURCE_BLOB_HASH);
    expect(NCRB_SOURCE_BLOB_HASH).toBe(
      "abbf5e6b3a4a499c7e69bbe163fb514ab7c9e266ef7592bef0cabb515dbc3adc",
    );
    expect(snapshot.representation.hash).toBe(
      "0298344d08b76fa1edfafcb796fe940f31bfa0f0520ddb215f88ae9523f10b37",
    );
    expect(NCRB_ROW_KEYS_HASH).toBe(
      "e24214885e5ff5d6139fed79fdc6529f86e075b05e6a32c60ff77dca4f4599ef",
    );
    expect(
      first.rows.every((row) => {
        const lineage = row.lineage.map((reference) => reference.locator);
        return (
          lineage.length === 5 &&
          lineage.every(
            (locator) =>
              locator.kind === "cell" && locator.rowKey === row.geography,
          )
        );
      }),
    ).toBe(true);
    expect(
      first.rows
        .flatMap((row) => row.lineage)
        .every((reference) => {
          return (
            reference.locator.kind === "cell" &&
            reference.locatedContentHash.length === 64 &&
            reference.sourceBlobHash === snapshot.source.sourceBlobHash
          );
        }),
    ).toBe(true);
    expect(first.rows.find((row) => row.geography === "Gujarat")).toMatchObject(
      {
        stolen2021: "175.1",
        stolen2023: "423.5",
        stolenDelta: "+248.4",
        recovery2021: "38.4",
        recovery2023: "23.2",
        recoveryDelta: "−15.2 pp",
      },
    );
  });

  it("distinguishes an in-scope empty check from outside snapshot coverage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const preflight = new RTIPreflightModule();
    const noFinding = await preflight.resolve({
      need: await interpreted(
        "How much was spent on lifts at New Delhi Railway Station?",
        "golden-empty",
      ),
      snapshot,
    });
    const outside = await preflight.resolve({
      need: await interpreted(
        "What is the budget for a local park?",
        "golden-outside",
      ),
      snapshot,
    });

    expect(noFinding.outcome).toBe("NO_RELIABLE_FINDING");
    expect(noFinding.executionReceipt?.checkedResourceIds).toEqual([
      "northern-railway-filing-fixture",
    ]);
    expect(outside.outcome).toBe("OUTSIDE_SNAPSHOT_COVERAGE");
    expect(outside.executionReceipt).toBeUndefined();
    expect(outside.coverageManifest?.capabilityManifestHash).toBe(
      snapshot.capabilityManifest.hash,
    );
  });

  it("discloses the synthetic fixture and preserves JSON-pointer provenance", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const preflight = new RTIPreflightModule();
    const result = await preflight.resolve({
      need: await interpreted(
        "Find an earlier RTI response relevant to a selected Central information need.",
        "golden-fixture",
      ),
      snapshot,
    });
    const fixture = snapshot.syntheticFixtures.find(
      (item) => item.id === "previous-rti-response-fixture",
    )!;

    expect(result.evidence[0]).toMatchObject({
      sourceType: "rti_response_fixture",
      syntheticDisclosure: expect.stringContaining("not a real RTI response"),
    });
    expect(result.evidence[0].grounding.map((item) => item.locator)).toEqual(
      fixture.values.map((value) => ({
        kind: "jsonPointer",
        pointer: value.pointer,
      })),
    );
    expect(result.evidence[0].grounding).toEqual(
      fixture.values.map((value) =>
        groundingForFixtureValue(fixture.id, value.pointer),
      ),
    );
  });

  it("accepts grounded narration and rejects unsupported injected claims", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const preflight = new RTIPreflightModule();
    const need = await interpreted(
      "Between 2021 and 2023 which States reported property stolen up and recovery down?",
      "golden-narration",
    );
    const result = await preflight.resolve({ need, snapshot });
    const id = groundingCatalog(result)[0].id;
    const base = {
      headlineGroundingIds: ["result:headline"],
      meaningGroundingIds: ["result:meaning"],
      sentences: [{ text: "The result is grounded.", groundingIds: [id] }],
      evidenceStatus: result.evidenceStatus,
      evidenceStatusGroundingIds: ["result:evidenceStatus"],
      searchScope: result.searchScope,
      searchScopeGroundingIds: ["result:searchScope"],
      recommendedAction: result.recommendedAction,
      recommendedActionGroundingIds: ["result:recommendedAction"],
      gaps: result.gaps,
      gapsGroundingIds: result.gaps.map((_, index) => `result:gap:${index}`),
    };

    expect(
      verifyNarration(
        {
          ...base,
          headline: result.headline,
          meaning: result.meaning,
        },
        need,
        result,
      ).accepted,
    ).toBe(true);
    expect(
      verifyNarration(
        {
          ...base,
          headline: "999 States matched.",
          meaning: "Review the figures.",
        },
        need,
        result,
      ).rejectionCode,
    ).toBe("NARRATION_NUMBER_UNGROUNDED");
  });

  it("rejects an invalid demo filing and preserves route/profile constraints", async () => {
    const filing = createFilingModule();
    const prepared = await filing.prepare({
      need: {
        id: "need-railway",
        canonicalNeed:
          "maintenance expenditure for lifts at New Delhi Railway Station",
      },
      holder: NORTHERN_RAILWAY_HOLDER,
      route: NORTHERN_RAILWAY_ROUTE,
    });

    expect(NORTHERN_RAILWAY_ROUTE.guidedCoverage).toBe(true);
    expect(NORTHERN_RAILWAY_ROUTE.authority.jurisdiction).toBe("central");
    expect(NORTHERN_RAILWAY_ROUTE.profile.submission).toBe("demo");
    expect(NORTHERN_RAILWAY_ROUTE.profile.text).toMatchObject({
      maxChars: 3000,
      overflowStrategy: "reject",
      newlinesPermitted: false,
    });
    expect(
      filing.validateDraft("x".repeat(3001), NORTHERN_RAILWAY_ROUTE.profile)
        .valid,
    ).toBe(false);
    await expect(
      filing.demoSubmit({
        package: prepared,
        confirmation: {
          otp: "000000",
          profile: filing.demoProfile,
          reviewed: true,
          payment: { method: "demo_upi", amountInr: 10 },
        },
      }),
    ).rejects.toThrow("FILING_PACKAGE_NOT_CONFIRMED");
    expect(DEMO_OTP).toBe("123456");
  });

  it("keeps the disclosure ledger complete and valid", () => {
    expect(DISCLOSURE_LEDGER.map((entry) => entry.id)).toEqual([
      ...EXPECTED_DISCLOSURE_COMPONENTS,
    ]);
    expect(() => validateDisclosureLedger()).not.toThrow();
  });
});
