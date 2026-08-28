import { describe, expect, it } from "vitest";
import { SCENARIO_PROMPTS, interpretWithFixture } from "../content/scenarios";
import { snapshot } from "../evidence/snapshot";
import { createFilingModule } from "../filing";
import { NORTHERN_RAILWAY_HOLDER, NORTHERN_RAILWAY_ROUTE } from "../filing";
import { createOfflinePreflightModule } from "../preflight/module";
import { COPY } from "./PreflightApp";
import {
  localizeFilingDraft,
  localizeMessage,
  localizeNeed,
  localizeResolution,
} from "./localization";

describe("Hindi journey localization", () => {
  it("keeps the Hindi UI dictionary free of accidental English workflow labels", () => {
    const untranslated = Object.values(COPY.hi)
      .filter((value) => typeof value === "string")
      .map(String)
      .filter((value) =>
        /\b(?:payment|filing|draft|route|working|simulated|acknowledgement|preflight|evidence|snapshot|information need|citation|downgrade|operands)\b/i.test(
          value,
        ),
      );

    expect(untranslated).toEqual([]);
  });

  it("supports Hindi example prompts and keeps their canonical fields localized", () => {
    const prompt = SCENARIO_PROMPTS[0].hiPrompt;
    const need = interpretWithFixture(prompt)[0];

    expect(need.scenario).toBe("ncrb-property");
    expect(localizeNeed(need, "hi")).toMatchObject({
      canonicalNeed: expect.stringContaining("राज्यों/केंद्र शासित प्रदेशों"),
      measure: "चोरी की संपत्ति का मूल्य और बरामदगी प्रतिशत",
      geography: "सभी राज्य/केंद्र शासित प्रदेश",
    });
  });

  it("localizes a representative evidence result and filing document", async () => {
    const need = interpretWithFixture(SCENARIO_PROMPTS[0].prompt)[0];
    const result = await createOfflinePreflightModule().resolve({
      need,
      snapshot,
      traceId: "localization-test",
    });
    const hindiResult = localizeResolution(result, "hi");

    expect(hindiResult.headline).toContain("राज्य/केंद्र शासित प्रदेश");
    expect(hindiResult.meaning).toContain("बरामदगी");
    expect(hindiResult.evidence[0].extract).toContain("आधिकारिक तालिका");
    expect(hindiResult.calculation?.filters[0]).toContain("चोरी की संपत्ति");

    const challengedResult = localizeResolution(
      {
        ...result,
        evidenceStatus: `${result.evidenceStatus} This result was downgraded to partially resolved pending source revalidation after a citation problem report.`,
      },
      "hi",
    );
    expect(challengedResult.evidenceStatus).toContain("उद्धरण की समस्या");
    expect(challengedResult.evidenceStatus).not.toContain(
      "This result was downgraded",
    );

    const prepared = await createFilingModule().prepare({
      need: interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0],
      holder: NORTHERN_RAILWAY_HOLDER,
      route: NORTHERN_RAILWAY_ROUTE,
    });
    const hindiDraft = localizeFilingDraft(prepared.draft.text, "hi");

    expect(hindiDraft).toContain("कृपया");
    expect(hindiDraft).toContain("ठेकेदारों के नाम");
    expect(hindiDraft).not.toContain("Please provide");
    expect(localizeFilingDraft(hindiDraft, "en")).toBe(prepared.draft.text);
  });

  it("translates filing and network errors instead of leaking English into Hindi", () => {
    expect(localizeMessage("Use demo OTP 123456. No SMS was sent.", "hi")).toBe(
      "डेमो OTP 123456 डालें। कोई SMS नहीं भेजा गया।",
    );
    expect(
      localizeMessage(
        "This route accepts 3000 characters. Remove 2 characters to continue.",
        "hi",
      ),
    ).toBe(
      "यह मार्ग 3000 अक्षर स्वीकार करता है। जारी रखने के लिए 2 अक्षर हटाएँ।",
    );
    expect(
      localizeMessage(
        "We couldn’t check the prototype snapshot just now.",
        "hi",
      ),
    ).toContain("प्रोटोटाइप स्नैपशॉट");
  });
});
