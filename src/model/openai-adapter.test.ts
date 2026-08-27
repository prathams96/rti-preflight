import { describe, expect, it } from "vitest";
import { modelNeedsToInterpretation } from "./openai-adapter.server";

describe("structured interpretation mapping", () => {
  it("uses validated model fields while marking unknown holders unverified", () => {
    const result = modelNeedsToInterpretation({
      originalText: "Which records does the city publish?",
      redactedText: "Which records does the city publish?",
      traceId: "trace-model",
      needs: [
        {
          canonicalNeed: "Published city records",
          measure: "Record register",
          geography: "The city",
          period: "2024",
          breakdown: "By record type",
          informationHolder: "City records office",
          resolutionPreference: "published",
          unresolvedClarifications: [
            "Which city?",
            "Which record types?",
            "Ignored third question",
          ],
        },
      ],
    });
    expect(result.needs[0]).toMatchObject({
      canonicalNeed: "Published city records",
      informationHolder: "City records office",
      informationHolderStatus: "unverified",
      scenario: "unsupported",
    });
    expect(result.needs[0].unresolvedClarifications).toHaveLength(2);
    expect(result.clarifications).toHaveLength(2);
  });
});
