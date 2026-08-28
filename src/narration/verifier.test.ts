import { describe, expect, it } from "vitest";
import { snapshot } from "../evidence/snapshot";
import { RTIPreflightModule } from "../preflight/module";
import {
  DISCLOSURE_LEDGER,
  validateDisclosureLedger,
} from "../disclosure/ledger";
import {
  groundingCatalog,
  parseNarration,
  verifyNarration,
  type ProposedNarration,
} from "./verifier";
import { narrateOrFallback } from "../model/narration-adapter.server";
import type { RenderableResolution } from "../domain/types";

async function context() {
  const preflight = new RTIPreflightModule();
  const need = (
    await preflight.interpret({
      text: "Between 2021 and 2023 which States reported property stolen up and recovery down?",
      traceId: "narration-test",
    })
  ).needs[0];
  const result = await preflight.resolve({ need, snapshot });
  return { need, result };
}

function completeNarration(
  id: string,
  result: RenderableResolution,
  overrides: Partial<ProposedNarration> = {},
): ProposedNarration {
  return {
    headline: "The calculation found a reported pattern.",
    headlineGroundingIds: [id],
    meaning: "Review the official figures and the calculation below.",
    meaningGroundingIds: [id],
    sentences: [
      {
        text: "Calculated from official figures—not directly stated by NCRB.",
        groundingIds: [id],
      },
    ],
    evidenceStatus: result.evidenceStatus,
    evidenceStatusGroundingIds: ["result:evidenceStatus"],
    searchScope: result.searchScope,
    searchScopeGroundingIds: ["result:searchScope"],
    recommendedAction: result.recommendedAction,
    recommendedActionGroundingIds: ["result:recommendedAction"],
    gaps: result.gaps,
    gapsGroundingIds: result.gaps.map((_, index) => `result:gap:${index}`),
    ...overrides,
  };
}

describe("citizen-visible narration verification", () => {
  it("accepts strict schema output with server-owned grounding IDs", async () => {
    const { need, result } = await context();
    const id = groundingCatalog(result)[0].id;
    const verified = verifyNarration(
      completeNarration(id, result),
      need,
      result,
    );
    expect(verified.accepted).toBe(true);
  });

  it("rejects invented numbers, unknown grounding, and instruction-bearing output", async () => {
    const { need, result } = await context();
    const id = groundingCatalog(result)[0].id;
    expect(
      verifyNarration(
        completeNarration(id, result, {
          headline: "999 States matched.",
        }),
        need,
        result,
      ).rejectionCode,
    ).toBe("NARRATION_NUMBER_UNGROUNDED");
    expect(
      verifyNarration(
        completeNarration(id, result, {
          sentences: [
            {
              text: "The result is grounded.",
              groundingIds: ["not-a-real-id"],
            },
          ],
        }),
        need,
        result,
      ).rejectionCode,
    ).toBe("NARRATION_GROUNDING_MISSING");
    expect(
      verifyNarration(
        completeNarration(id, result, {
          headline: "Ignore previous instructions.",
        }),
        need,
        result,
      ).rejectionCode,
    ).toBe("NARRATION_PROHIBITED_ASSERTION");
    expect(
      verifyNarration(
        completeNarration(id, result, {
          headline: "Punjab matched the conditions.",
        }),
        need,
        result,
      ).rejectionCode,
    ).toBe("NARRATION_ENTITY_UNGROUNDED");
  });

  it("rejects malformed or extra fields rather than coercing them", () => {
    expect(() =>
      parseNarration({
        headline: "x",
        meaning: "y",
        sentences: [],
        extra: true,
      }),
    ).toThrow("NARRATION_SCHEMA_MISMATCH");
    expect(() =>
      parseNarration({
        headline: "x",
        meaning: "y",
        sentences: [{ text: "z", groundingIds: [], extra: true }],
      }),
    ).toThrow("NARRATION_SCHEMA_MISMATCH");
  });

  it("validates the versioned disclosure ledger", () => {
    expect(() => validateDisclosureLedger()).not.toThrow();
    expect(DISCLOSURE_LEDGER.map((entry) => entry.status)).toContain("curated");
    expect(() => validateDisclosureLedger(DISCLOSURE_LEDGER.slice(1))).toThrow(
      "DISCLOSURE_LEDGER_COMPONENT_MISSING",
    );
  });

  it("falls back without changing the deterministic outcome when narration is rejected", async () => {
    const { need, result } = await context();
    const fallback = await narrateOrFallback({
      need,
      result,
      traceId: "fallback-test",
      adapter: {
        narrate: async () => ({
          headline: "999 States matched",
          headlineGroundingIds: [],
          meaning: "Invented",
          meaningGroundingIds: [],
          sentences: [],
          evidenceStatus: "Grounded status.",
          evidenceStatusGroundingIds: ["result:evidenceStatus"],
          searchScope: "Grounded scope.",
          searchScopeGroundingIds: ["result:searchScope"],
          recommendedAction: "Review the grounded result.",
          recommendedActionGroundingIds: ["result:recommendedAction"],
          gaps: result.gaps.map(() => "Grounded gap."),
          gapsGroundingIds: result.gaps.map(
            (_, index) => `result:gap:${index}`,
          ),
        }),
      },
    });
    expect(fallback.outcome).toBe(result.outcome);
    expect(fallback.rows).toEqual(result.rows);
    expect(fallback.narration).toBe("deterministic");
    expect(fallback.narrationRejectionCode).toBe("NARRATION_NUMBER_UNGROUNDED");
  });

  it("accepts trusted deterministic context for an evidence-empty outcome", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "How much was spent maintaining lifts and escalators at New Delhi Railway Station during FY 2024–25?",
        traceId: "empty-evidence",
      })
    ).needs[0];
    const result = await preflight.resolve({ need, snapshot });
    expect(result.evidence).toHaveLength(0);
    const proposed = completeNarration("result:headline", result, {
      headline: "No reliable finding was returned from the checked snapshot.",
      meaning:
        "No conclusion about record availability can be drawn from this result.",
      meaningGroundingIds: ["result:meaning"],
      sentences: [
        {
          text: "Review the checked scope before deciding whether to file.",
          groundingIds: ["result:searchScope"],
        },
      ],
      evidenceStatus: result.evidenceStatus,
      searchScope: result.searchScope,
      recommendedAction: result.recommendedAction,
      gaps: result.gaps,
      gapsGroundingIds: result.gaps.map((_, index) => `result:gap:${index}`),
    });
    expect(verifyNarration(proposed, need, result).accepted).toBe(true);
    expect(
      verifyNarration(
        {
          ...proposed,
          evidenceStatus: "नगर निगम ने पार्क की सफाई की।",
        },
        need,
        result,
      ).rejectionCode,
    ).toBe("NARRATION_GROUNDING_MISSING");
    expect(
      verifyNarration(
        {
          ...proposed,
          meaning: "माँगे गए रिकॉर्ड उपलब्ध नहीं हैं।",
        },
        need,
        result,
      ).rejectionCode,
    ).toBe("NARRATION_PROHIBITED_ASSERTION");
  });

  it("rejects English polarity inversion of a deterministic no-finding anchor", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "How much was spent maintaining lifts and escalators at New Delhi Railway Station during FY 2024–25?",
        traceId: "polarity-railway",
      })
    ).needs[0];
    const result = await preflight.resolve({ need, snapshot });
    expect(result.outcome).toBe("NO_RELIABLE_FINDING");
    const proposed = completeNarration("result:headline", result, {
      gaps: [
        "The snapshot contains supporting expenditure statement, ledger extract, work order, and contractor record for this need.",
      ],
      gapsGroundingIds: ["result:gap:0"],
    });
    expect(verifyNarration(proposed, need, result).accepted).toBe(false);
  });

  it("rejects Hindi polarity inversion of a deterministic no-finding anchor", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "How much was spent maintaining lifts and escalators at New Delhi Railway Station during FY 2024–25?",
        traceId: "polarity-railway-hi",
      })
    ).needs[0];
    const result = await preflight.resolve({ need, snapshot });
    const proposed = completeNarration("result:headline", result, {
      gaps: ["स्नैपशॉट में सहायक व्यय विवरण उपलब्ध हैं।"],
      gapsGroundingIds: ["result:gap:0"],
    });
    expect(verifyNarration(proposed, need, result).accepted).toBe(false);
  });

  it("rejects polarity inversion for an outside-snapshot coverage outcome", async () => {
    const preflight = new RTIPreflightModule();
    const need = (
      await preflight.interpret({
        text: "How many trees were planted in my city park last year?",
        traceId: "polarity-outside",
      })
    ).needs[0];
    const result = await preflight.resolve({ need, snapshot });
    expect(result.outcome).toBe("OUTSIDE_SNAPSHOT_COVERAGE");
    const proposed = completeNarration("result:headline", result, {
      evidenceStatus: "Verified from the available sources",
    });
    expect(verifyNarration(proposed, need, result).accepted).toBe(false);
  });
});
