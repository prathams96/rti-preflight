import { describe, expect, it } from "vitest";
import { SCENARIO_PROMPTS, interpretWithFixture } from "../content/scenarios";
import { snapshot } from "../evidence/snapshot";
import { createFilingModule } from "../filing";
import { NORTHERN_RAILWAY_HOLDER, NORTHERN_RAILWAY_ROUTE } from "../filing";
import { createOfflinePreflightModule } from "../preflight/module";
import { COPY } from "./PreflightApp";
import {
  clarificationQuestion,
  canonicalizeNeedValue,
  localizeFilingDraft,
  localizeClarification,
  localizeDisclosureEntry,
  localizeMessage,
  localizeNeed,
  localizeResolution,
  localizeText,
  isUnknownClarification,
} from "./localization";
import { DISCLOSURE_LEDGER } from "../disclosure/ledger";

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

  it("canonicalizes known Hindi need values without changing custom citizen text", () => {
    const need = interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0];
    const localized = localizeNeed(need, "hi");

    expect(localized.measure).toBe(
      "रखरखाव खर्च, कार्यादेश, अनुबंध और ठेकेदारों के नाम",
    );
    expect(canonicalizeNeedValue(localized.measure, "hi")).toBe(need.measure);
    expect(canonicalizeNeedValue(localized.geography, "hi")).toBe(
      need.geography,
    );
    expect(canonicalizeNeedValue(localized.period, "hi")).toBe(need.period);
    expect(canonicalizeNeedValue(localized.breakdown, "hi")).toBe(
      need.breakdown,
    );
    expect(canonicalizeNeedValue(localized.informationHolder, "hi")).toBe(
      need.informationHolder,
    );
    expect(canonicalizeNeedValue("मेरी अपनी नगरपालिका", "hi")).toBe(
      "मेरी अपनी नगरपालिका",
    );
    expect(canonicalizeNeedValue(need.measure, "en")).toBe(need.measure);
  });

  it("keeps canonical NCRB semantics stable while switching display language", async () => {
    const need = interpretWithFixture(SCENARIO_PROMPTS[0].prompt)[0];
    const before = structuredClone(need);
    const hindiDisplay = localizeNeed(need, "hi");

    expect(hindiDisplay.canonicalNeed).not.toBe(need.canonicalNeed);
    expect(need).toEqual(before);
    const result = await createOfflinePreflightModule().resolve({
      need,
      snapshot,
      traceId: "canonical-language-test",
    });
    expect(result.outcome).toBe("DERIVED_FINDING");
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

  it("localizes details, route metadata, and ledger copy while preserving names and acronyms", async () => {
    const localizedLedger = DISCLOSURE_LEDGER.map((entry) =>
      localizeDisclosureEntry(entry, "hi"),
    );

    expect(localizedLedger[0]).toMatchObject({
      label: "NCRB स्रोत और आँकड़े",
      disclosure: expect.stringContaining("वास्तविक आधिकारिक सार्वजनिक डेटा"),
    });
    expect(
      localizedLedger.every((entry) => entry.label !== "Evidence Snapshot"),
    ).toBe(true);
    expect(
      localizedLedger.every(
        (entry) =>
          entry.disclosure !==
          "Working deterministic adapter; OpenAI is server-only when configured.",
      ),
    ).toBe(true);
    expect(
      localizeText("3,000-character text limit and overflow guidance", "hi"),
    ).toBe("3,000 अक्षरों की पाठ सीमा और अधिकता संबंधी निर्देश");
    expect(localizeText("Check the status of an EPF claim", "hi")).toBe(
      "EPF दावे की स्थिति जाँचें",
    );
    expect(
      localizeText("Northern Railway-Delhi Division authority listing", "hi"),
    ).toContain("Northern Railway-Delhi Division");

    const need = interpretWithFixture("What is the status of my EPF claim?")[0];
    const result = await createOfflinePreflightModule().resolve({
      need,
      snapshot,
      traceId: "localization-route-test",
    });
    const hindiResult = localizeResolution(result, "hi");

    expect(hindiResult.serviceRoute?.purpose).toBe("EPF दावे की स्थिति जाँचें");
    expect(hindiResult.evidence[0].sourceTitle).toBe("EPFO सदस्य पासबुक");
    expect(hindiResult.evidence[0].publisher).toBe(
      "कर्मचारी भविष्य निधि संगठन",
    );
  });

  it("keeps an accepted unknown clarification visible and localized", () => {
    const unknown =
      "Unknown: Which municipal corporation or city, and which financial year should be checked?";

    expect(isUnknownClarification(unknown)).toBe(true);
    expect(clarificationQuestion(unknown)).toContain(
      "Which municipal corporation",
    );
    expect(localizeClarification(unknown, "hi")).toMatch(
      /^अज्ञात: .*नगरपालिका.*वित्तीय वर्ष/u,
    );
    expect(localizeClarification(unknown, "hi")).not.toContain("Unknown:");
  });
});
