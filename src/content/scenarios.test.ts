import { describe, expect, it } from "vitest";
import {
  CPCB_CONFLICT_DECISION,
  SCENARIO_PROMPTS,
  interpretWithFixture,
  scenarioForText,
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
});
