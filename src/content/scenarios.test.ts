import { describe, expect, it } from "vitest";
import {
  CPCB_CONFLICT_DECISION,
  SCENARIO_PROMPTS,
  hasExplicitDraftingIntent,
  interpretWithFixture,
  scenarioForText,
  shouldPreferDraftingRoute,
} from "./scenarios";

describe("seeded scenario boundaries", () => {
  it("keeps own-record EPFO interpretation consistent across English and mixed Hindi-English", () => {
    expect(
      interpretWithFixture("What is the status of my EPF claim?")[0],
    ).toMatchObject({ scenario: "epfo-status", recordSubject: "own" });
    expect(
      interpretWithFixture("Mera EPF claim ka status kya hai?")[0],
    ).toMatchObject({ scenario: "epfo-status", recordSubject: "own" });
  });

  it("does not turn another person's EPF identifier into an own-record route", () => {
    expect(
      interpretWithFixture(
        "Check someone else's EPF claim UAN 123456789012",
      )[0],
    ).toMatchObject({ scenario: "epfo-status", recordSubject: "another" });
    expect(
      interpretWithFixture("Check my father's EPF claim")[0],
    ).toMatchObject({ scenario: "epfo-status", recordSubject: "another" });
    expect(
      interpretWithFixture("What is the status of an EPF claim?")[0],
    ).toMatchObject({ scenario: "epfo-status", recordSubject: "unspecified" });
  });

  it("records the CPCB gate as cut and removes the working seeded affordance", () => {
    expect(CPCB_CONFLICT_DECISION.status).toBe("cut");
    expect(
      SCENARIO_PROMPTS.some(({ id }) => String(id) === "cpcb-conflict"),
    ).toBe(false);
    expect(scenarioForText("Compare two CPCB air quality publications")).toBe(
      "unsupported",
    );
    expect(CPCB_CONFLICT_DECISION.reviewedSources).toHaveLength(3);
    for (const source of CPCB_CONFLICT_DECISION.reviewedSources) {
      expect(source.url).toMatch(/^https:\/\/cpcb\.nic\.in\//);
      expect(source.retrievedAt).toBe("2026-08-27");
      expect(source.authority).toBe("Central Pollution Control Board");
      expect(source.applicability).toMatch(/not comparable|no compatible/i);
    }
  });

  it("only applies the canonical hero sentence to the exact seeded prompt", () => {
    const exact = interpretWithFixture(SCENARIO_PROMPTS[0].prompt)[0];
    expect(exact.canonicalNeed).toBe(
      "Identify individual States/UTs where reported property stolen increased and recovery percentage declined between 2021 and 2023.",
    );

    const near = interpretWithFixture(
      "Identify States/UTs where property stolen declined and recovery percentage increased between 2021 and 2023.",
    )[0];
    expect(near.canonicalNeed).toContain("value of property stolen declined");
    expect(near.canonicalNeed).toContain(
      "percentage recovery of stolen property increased between 2021 and 2023",
    );
    expect(near.canonicalNeed).not.toContain(
      "property stolen increased and recovery percentage declined",
    );
  });

  it("detects explicit drafting intent in English, Hindi, and mixed script", () => {
    for (const text of [
      "Help me prepare an RTI",
      "Draft an RTI for municipal road records",
      "I want to file an RTI asking for the work orders",
      "RTI तैयार करने में मदद करें",
      "मैं RTI दाखिल करना चाहता हूँ",
      "Mujhe RTI draft karna hai",
    ]) {
      expect(hasExplicitDraftingIntent(text), text).toBe(true);
      expect(interpretWithFixture(text)[0].draftingIntent, text).toBe(true);
    }
  });

  it("does not route negated drafting requests directly to drafting", () => {
    for (const text of [
      "I don't want to file an RTI",
      "I do not want to draft an RTI",
      "I am not looking to file an RTI",
      "मैं RTI दाखिल नहीं करना चाहता हूँ",
      "Mujhe RTI draft nahi karni hai",
      "Mujhe RTI nahi file karni hai",
      "RTI तैयार नहीं करनी है",
    ]) {
      expect(hasExplicitDraftingIntent(text), text).toBe(false);
      expect(interpretWithFixture(text)[0].draftingIntent, text).toBe(false);
    }
  });

  it("keeps a positive drafting clause after a negated alternative", () => {
    const text =
      "I don't want to search for an old response, but I want to file an RTI";
    expect(hasExplicitDraftingIntent(text)).toBe(true);
    expect(interpretWithFixture(text)[0].draftingIntent).toBe(true);
  });

  it("gives explicit drafting intent precedence over the previous-response fixture", () => {
    expect(
      interpretWithFixture(
        "Help me prepare an RTI about an earlier RTI response",
      )[0],
    ).toMatchObject({ scenario: "unsupported", draftingIntent: true });
    expect(
      interpretWithFixture(
        "Find an earlier RTI response relevant to a selected Central information need.",
      )[0],
    ).toMatchObject({ scenario: "previous-rti", draftingIntent: false });
  });

  it("routes explicit fresh requests to drafting while preserving an evidence check for NCRB", () => {
    expect(
      shouldPreferDraftingRoute({
        scenario: "unsupported",
        draftingIntent: true,
      }),
    ).toBe(true);
    expect(
      shouldPreferDraftingRoute({
        scenario: "railway-filing",
        draftingIntent: true,
      }),
    ).toBe(true);
    expect(
      shouldPreferDraftingRoute({
        scenario: "ncrb-property",
        draftingIntent: true,
      }),
    ).toBe(false);
    expect(
      shouldPreferDraftingRoute({
        scenario: "unsupported",
        draftingIntent: false,
      }),
    ).toBe(false);
  });

  it.each([
    ["stolen increased AND recovery declined", "increase", "decrease", "and"],
    ["stolen declined AND recovery increased", "decrease", "increase", "and"],
    ["stolen declined OR recovery increased", "decrease", "increase", "or"],
  ])(
    "preserves semantic directions for %s",
    (phrase, stolen, recovery, logic) => {
      const need = interpretWithFixture(
        `Identify States/UTs where property stolen ${stolen === "increase" ? "increased" : "declined"} ${logic === "or" ? "or" : "and"} recovery percentage ${recovery === "increase" ? "increased" : "declined"} between 2021 and 2023.`,
      )[0];
      expect(need.analysisIntent).toMatchObject({ logic });
      expect(need.analysisIntent?.predicates).toEqual([
        expect.objectContaining({
          measure: "value of property stolen",
          comparison: stolen,
        }),
        expect.objectContaining({
          measure: "percentage recovery of stolen property",
          comparison: recovery,
        }),
      ]);
      expect(need.canonicalNeed).toContain(
        `value of property stolen ${stolen === "increase" ? "increased" : "declined"}`,
      );
      expect(need.canonicalNeed).toContain(
        `percentage recovery of stolen property ${recovery === "increase" ? "increased" : "declined"}`,
      );
    },
  );
});
