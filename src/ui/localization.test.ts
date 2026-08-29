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
  clarificationDisplay,
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

    expect(hindiResult.headline).toBe(
      "हमें आधिकारिक सरकारी डेटा से एक उत्तर मिला",
    );
    expect(hindiResult.meaning).toContain("NCRB");
    expect(hindiResult.evidence[0].extract).toContain("आधिकारिक तालिका");
    expect(hindiResult.calculation?.filters[0]).toContain("चोरी की संपत्ति");
    expect(
      hindiResult.rows[0].columns.map((column) => column.value).join(" "),
    ).toContain("करोड़");
    expect(hindiResult.rows[0].geography).toBe(result.rows[0].geography);
    expect(
      hindiResult.resultTable?.columns.map((column) => column.label),
    ).toEqual([
      "राज्य/केंद्र शासित प्रदेश",
      "चोरी 2021 → 2023",
      "बदलाव",
      "बरामदगी 2021 → 2023",
      "बदलाव",
    ]);

    const challengedResult = localizeResolution(
      {
        ...result,
        evidenceStatus: `${result.evidenceStatus} This result is shown as partial until the source is checked again after a source problem report.`,
      },
      "hi",
    );
    expect(challengedResult.evidenceStatus).toContain("स्रोत की समस्या");
    expect(challengedResult.evidenceStatus).not.toContain(
      "This result is shown as partial",
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

    const marker = "CITIZEN-EDIT-MARKER";
    expect(localizeFilingDraft(`${prepared.draft.text} ${marker}`, "hi")).toBe(
      `${prepared.draft.text} ${marker}`,
    );
    expect(localizeFilingDraft(`${hindiDraft} ${marker}`, "en")).toBe(
      `${hindiDraft} ${marker}`,
    );
  });

  it("does not dictionary-translate model-authored Hindi result prose", async () => {
    const need = interpretWithFixture(SCENARIO_PROMPTS[0].prompt)[0];
    const result = await createOfflinePreflightModule().resolve({
      need,
      snapshot,
      traceId: "model-hindi-presentation",
    });
    const modelResult = {
      ...result,
      narration: "verified_model" as const,
      headline: "मॉडल द्वारा लिखा गया स्वाभाविक शीर्षक",
      meaning: "मॉडल द्वारा लिखा गया स्वाभाविक अर्थ",
      evidenceStatus: "मॉडल द्वारा लिखी गई साक्ष्य स्थिति",
      searchScope: "मॉडल द्वारा लिखा गया खोज दायरा",
      recommendedAction: "मॉडल द्वारा सुझाई गई अगली कार्रवाई",
      gaps: ["मॉडल द्वारा बताई गई कमी"],
    };

    expect(localizeResolution(modelResult, "hi")).toMatchObject({
      headline: modelResult.headline,
      meaning: modelResult.meaning,
      evidenceStatus: modelResult.evidenceStatus,
      searchScope: modelResult.searchScope,
      recommendedAction: modelResult.recommendedAction,
      gaps: modelResult.gaps,
    });
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

  it("localizes verified no-answer and NCRB operation strings", () => {
    expect(
      localizeText(
        "The sources checked by this prototype did not provide a reliable answer for this question.",
        "hi",
      ),
    ).toBe(
      "इस प्रोटोटाइप द्वारा जाँचे गए स्रोतों से इस सवाल का विश्वसनीय उत्तर नहीं मिला।",
    );
    expect(
      localizeText(
        "Compare value of property stolen AND percentage recovery of stolen property for each individual State/UT.",
        "hi",
      ),
    ).toContain("हर राज्य/केंद्र शासित प्रदेश");
  });

  it("localizes generic NCRB currency units without changing names or numbers", async () => {
    const need = interpretWithFixture(SCENARIO_PROMPTS[0].prompt)[0];
    const result = await createOfflinePreflightModule().resolve({
      need,
      snapshot,
      traceId: "localization-units-test",
    });
    const hindiResult = localizeResolution(result, "hi");
    const values = hindiResult.resultTable?.rows.flatMap((row) =>
      Object.values(row.values),
    );
    expect(values?.some((value) => String(value).includes("करोड़"))).toBe(true);
    expect(values?.some((value) => String(value).includes("crore"))).toBe(
      false,
    );
    expect(values?.some((value) => String(value).includes("Gujarat"))).toBe(
      true,
    );
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

  it("prefers a model-authored selected-language presentation for multi-need display", () => {
    const need = {
      ...interpretWithFixture(SCENARIO_PROMPTS[0].prompt)[0],
      presentation: {
        language: "hi" as const,
        canonicalNeed: "राज्यों में चोरी की संपत्ति का रुझान पहचानें",
        measure: "चोरी की संपत्ति और बरामदगी",
        geography: "सभी राज्य",
        period: "2021 और 2023",
        breakdown: "राज्य",
        informationHolder: "National Crime Records Bureau",
        unresolvedClarifications: [],
      },
    };

    const display = localizeNeed(need, "hi");
    expect(display.canonicalNeed).toBe(need.presentation.canonicalNeed);
    expect(display.canonicalNeed).not.toBe(need.canonicalNeed);
    // The canonical need itself remains English and stable.
    expect(need.canonicalNeed).toContain("property stolen");
  });

  it("displays the model clarification wording when it matches the selected language", () => {
    const canonical =
      "Which municipal corporation or city, and which financial year should be checked?";
    const need = {
      ...interpretWithFixture("How much did my municipality spend?")[0],
      unresolvedClarifications: [canonical],
      presentation: {
        language: "hi" as const,
        canonicalNeed: "नगरपालिका व्यय रिकॉर्ड",
        measure: "व्यय",
        geography: "नगरपालिका",
        period: "वित्तीय वर्ष",
        breakdown: "मद",
        informationHolder: "नगर निगम",
        unresolvedClarifications: [
          "किस नगरपालिका या शहर और किस वित्तीय वर्ष की जाँच की जानी चाहिए?",
        ],
      },
    };

    expect(clarificationDisplay(need, canonical, "hi")).toBe(
      "किस नगरपालिका या शहर और किस वित्तीय वर्ष की जाँच की जानी चाहिए?",
    );
    // When the presentation language differs, fall back to the stock translation.
    expect(clarificationDisplay(need, canonical, "en")).toBe(canonical);

    const unknown = `Unknown: ${canonical}`;
    expect(clarificationDisplay(need, unknown, "hi")).toMatch(
      /^अज्ञात: किस नगरपालिका/u,
    );
  });
});
