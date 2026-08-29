import { afterEach, describe, expect, it, vi } from "vitest";
import type { InformationNeed } from "../domain/types";
import {
  persist,
  filingNeedSignature,
  loadSessionFilingState,
  readPersistedState,
  readSessionFilingState,
  restoreSavedPreflightForLanguage,
  shouldDiscardDraftResponse,
  isStaleRequest,
  shouldSupersedeInterpretation,
  languageSwitchDecision,
} from "./PreflightApp";
import {
  createFilingModule,
  createGenericRtiDemoRoute,
  NORTHERN_RAILWAY_HOLDER,
  NORTHERN_RAILWAY_ROUTE,
} from "../filing";

type StorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createStorage(): StorageMock {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("Preflight persistence boundaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not persist filing phases in the research store", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage, sessionStorage: createStorage() });

    persist({
      phase: "draft",
      text: "Prepare this RTI draft",
      language: "en",
    } as Parameters<typeof persist>[0]);

    expect(localStorage.getItem("rti-preflight-state-v2")).toBeNull();
  });

  it("changes the filing reuse signature when a semantic need field changes", () => {
    const baseline = {
      id: "need-1",
      canonicalNeed: "maintenance records",
      measure: "maintenance expenditure",
      geography: "New Delhi Railway Station",
      period: "Financial year 2024-25",
      breakdown: "Contractor",
      informationHolder: "Northern Railway",
      informationHolderStatus: "verified" as const,
      resolutionPreference: "formal" as const,
      unresolvedClarifications: [],
    };

    expect(
      filingNeedSignature({ ...baseline, measure: "different records" }),
    ).not.toBe(filingNeedSignature(baseline));
    expect(
      filingNeedSignature({ ...baseline, geography: "another station" }),
    ).not.toBe(filingNeedSignature(baseline));
  });

  it("keeps a valid filing session when the research record is invalid", async () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    vi.stubGlobal("window", { localStorage, sessionStorage });

    const filing = createFilingModule();
    const confirmedNeed = {
      id: "need-railway",
      originalText: "Please provide the confirmed railway records.",
      canonicalNeed:
        "maintenance expenditure for lifts and escalators and contractors at New Delhi Railway Station during FY 2024-25",
      measure:
        "Maintenance expenditure, work orders, contracts, and contractor names",
      geography: "New Delhi Railway Station",
      period: "Financial year 2024–25",
      breakdown: "Contractor",
      informationHolder: "Northern Railway",
      informationHolderStatus: "verified",
      resolutionPreference: "formal",
      unresolvedClarifications: [],
      scenario: "railway-filing",
      draftingIntent: true,
    } satisfies InformationNeed;
    const filingPackage = await filing.prepare({
      need: confirmedNeed,
      holder: NORTHERN_RAILWAY_HOLDER,
      route: NORTHERN_RAILWAY_ROUTE,
    });

    localStorage.setItem(
      "rti-preflight-state-v2",
      JSON.stringify({
        version: 2,
        state: { phase: "draft", text: "Filing draft", language: "en" },
      }),
    );
    const filingEnvelope = {
      version: 2,
      state: {
        phase: "file",
        need: confirmedNeed,
        draftText: filingPackage.draft.text,
        package: filingPackage,
        step: "otp",
        otp: "",
        profile: filing.demoProfile,
        reviewed: false,
        paymentConfirmed: false,
        language: "en",
      },
    };
    sessionStorage.setItem(
      "rti-preflight-filing-v2",
      JSON.stringify(filingEnvelope),
    );

    expect(readPersistedState()).toBeUndefined();
    expect(readSessionFilingState()).toEqual(filingEnvelope.state);
    expect(readSessionFilingState()?.need).toEqual(confirmedNeed);

    sessionStorage.setItem(
      "rti-preflight-filing-v2",
      JSON.stringify({
        ...filingEnvelope,
        state: {
          ...filingEnvelope.state,
          phase: "draft",
          package: undefined,
          step: "otp",
        },
      }),
    );
    expect(readSessionFilingState()).toMatchObject({
      phase: "draft",
      need: confirmedNeed,
    });

    sessionStorage.setItem(
      "rti-preflight-filing-v2",
      JSON.stringify({
        ...filingEnvelope,
        state: {
          ...filingEnvelope.state,
          phase: "acknowledgement",
          step: "confirmation",
          acknowledgement: {
            registrationNumber: "RTI-DEMO-123456",
            disclosure: "Simulated acknowledgement",
            holder: NORTHERN_RAILWAY_HOLDER.canonicalName,
            route: NORTHERN_RAILWAY_ROUTE.authority.canonicalName,
            submittedDraft: filingPackage.draft.text,
            fee: { amountInr: 10, method: "demo_upi" },
            submittedAt: "2026-08-28T00:00:00.000Z",
          },
        },
      }),
    );
    expect(readSessionFilingState()).toMatchObject({
      phase: "acknowledgement",
      need: confirmedNeed,
    });
  });

  it("rejects filing sessions that cannot restore the active Information Need", () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    vi.stubGlobal("window", { localStorage, sessionStorage });

    sessionStorage.setItem(
      "rti-preflight-filing-v2",
      JSON.stringify({
        version: 2,
        state: {
          phase: "draft",
          draftText: "Draft",
          step: "otp",
          otp: "",
          profile: {
            fullName: "Fictional Applicant",
            email: "citizen@example.com",
            address: "1 Demo Lane",
            state: "Delhi",
            pinCode: "110001",
          },
          reviewed: false,
          paymentConfirmed: false,
          language: "en",
        },
      }),
    );

    expect(readSessionFilingState()).toBeUndefined();
    expect(sessionStorage.getItem("rti-preflight-filing-v2")).toBeNull();
  });

  it("reports recovery when an existing filing session is malformed", () => {
    const sessionStorage = createStorage();
    vi.stubGlobal("window", { localStorage: createStorage(), sessionStorage });
    sessionStorage.setItem("rti-preflight-filing-v2", "not-json");

    expect(loadSessionFilingState()).toEqual({
      state: undefined,
      recoveryNeeded: true,
    });
    expect(sessionStorage.getItem("rti-preflight-filing-v2")).toBeNull();
  });

  it("does not report recovery when no filing session was stored", () => {
    vi.stubGlobal("window", {
      localStorage: createStorage(),
      sessionStorage: createStorage(),
    });

    expect(loadSessionFilingState()).toEqual({
      state: undefined,
      recoveryNeeded: false,
    });
  });

  it("restores a valid filing session without reporting recovery", async () => {
    const sessionStorage = createStorage();
    vi.stubGlobal("window", { localStorage: createStorage(), sessionStorage });
    const filing = createFilingModule();
    const confirmedNeed = {
      id: "need-railway",
      originalText: "Please provide the confirmed railway records.",
      canonicalNeed:
        "maintenance expenditure for lifts and escalators and contractors at New Delhi Railway Station during FY 2024-25",
      measure:
        "Maintenance expenditure, work orders, contracts, and contractor names",
      geography: "New Delhi Railway Station",
      period: "Financial year 2024–25",
      breakdown: "Contractor",
      informationHolder: "Northern Railway",
      informationHolderStatus: "verified",
      resolutionPreference: "formal",
      unresolvedClarifications: [],
      scenario: "railway-filing",
      draftingIntent: true,
    } satisfies InformationNeed;
    const filingPackage = await filing.prepare({
      need: confirmedNeed,
      holder: NORTHERN_RAILWAY_HOLDER,
      route: NORTHERN_RAILWAY_ROUTE,
    });
    const state = {
      phase: "draft" as const,
      need: confirmedNeed,
      draftText: filingPackage.draft.text,
      package: filingPackage,
      step: "otp" as const,
      otp: "",
      profile: filing.demoProfile,
      reviewed: false,
      paymentConfirmed: false,
      language: "en" as const,
    };
    sessionStorage.setItem(
      "rti-preflight-filing-v2",
      JSON.stringify({ version: 2, state }),
    );

    expect(loadSessionFilingState()).toEqual({
      state,
      recoveryNeeded: false,
    });
  });

  it("restores structurally valid generic packages regardless of coverage metadata", async () => {
    const sessionStorage = createStorage();
    vi.stubGlobal("window", { localStorage: createStorage(), sessionStorage });
    const filing = createFilingModule();
    const need = {
      id: "need-generic",
      canonicalNeed: "municipal park maintenance budget records",
      originalText: "Show me the municipal park maintenance budget.",
      measure: "Maintenance budget",
      geography: "Municipal parks",
      period: "Financial year 2025-26",
      breakdown: "Year",
      informationHolder: "City Municipal Corporation",
      informationHolderStatus: "unverified" as const,
      resolutionPreference: "formal" as const,
      unresolvedClarifications: [],
      scenario: "unsupported" as const,
    };
    const { holder, route } = createGenericRtiDemoRoute(need);
    const filingPackage = await filing.prepare({
      need,
      holder,
      route: { ...route, guidedCoverage: true },
    });
    sessionStorage.setItem(
      "rti-preflight-filing-v2",
      JSON.stringify({
        version: 2,
        state: {
          phase: "file",
          draftText: filingPackage.draft.text,
          package: filingPackage,
          need,
          step: "otp",
          otp: "",
          profile: filing.demoProfile,
          reviewed: false,
          paymentConfirmed: false,
          language: "en",
        },
      }),
    );

    expect(readSessionFilingState()).toMatchObject({
      phase: "file",
      package: { route: { id: "generic-rti-demo" } },
    });
    expect(sessionStorage.getItem("rti-preflight-filing-v2")).not.toBeNull();
  });

  it("discards malformed nested research and filing state", () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    vi.stubGlobal("window", { localStorage, sessionStorage });

    localStorage.setItem(
      "rti-preflight-state-v2",
      JSON.stringify({
        version: 2,
        state: {
          phase: "result",
          text: "A saved request",
          language: "en",
          need: {
            id: "need-1",
            originalText: "A saved request",
            canonicalNeed: "A saved request",
            measure: "records",
            geography: "Delhi",
            period: "2025",
            breakdown: "none",
            informationHolder: "A department",
            informationHolderStatus: "verified",
            resolutionPreference: "published",
            unresolvedClarifications: [],
            scenario: "unsupported",
          },
          result: {},
        },
      }),
    );
    sessionStorage.setItem(
      "rti-preflight-filing-v2",
      JSON.stringify({
        version: 2,
        state: {
          phase: "file",
          draftText: "Draft",
          package: {},
          step: "otp",
          otp: "",
          profile: {},
          reviewed: false,
          paymentConfirmed: false,
          language: "en",
        },
      }),
    );

    expect(readPersistedState()).toBeUndefined();
    expect(readSessionFilingState()).toBeUndefined();
    expect(localStorage.getItem("rti-preflight-state-v2")).toBeNull();
    expect(sessionStorage.getItem("rti-preflight-filing-v2")).toBeNull();
  });

  it("keeps the selected language without rewriting an authoritative citizen draft", () => {
    const marker = "CITIZEN-EDIT-MARKER";
    const authoritativeDraft = `Please provide records showing the confirmed need. ${marker}`;
    const saved = {
      id: "saved-1",
      label: "Saved draft",
      text: "Please provide records showing the confirmed need.",
      phase: "draft" as const,
      draftText: authoritativeDraft,
      draftOriginalText: "Please provide records showing the confirmed need.",
      language: "en" as const,
    } as Parameters<typeof restoreSavedPreflightForLanguage>[0];

    const restored = restoreSavedPreflightForLanguage(saved, "hi");

    expect(restored.language).toBe("hi");
    expect(restored.draftText).toBe(authoritativeDraft);
    expect(restored.draftText).toContain(marker);
    expect(restored.draftOriginalText).toBe(
      "Please provide records showing the confirmed need.",
    );
  });

  it("discards a late draft response after a language/need change, navigation, or citizen edit", () => {
    const signature = "need-signature-a";
    const changedSignature = "need-signature-b";

    // A matching request may be applied.
    expect(
      shouldDiscardDraftResponse({
        capturedGeneration: 3,
        currentGeneration: 3,
        capturedSignature: signature,
        currentSignature: signature,
        draftEdited: false,
      }),
    ).toBe(false);

    // Language switch or navigation advances the generation.
    expect(
      shouldDiscardDraftResponse({
        capturedGeneration: 3,
        currentGeneration: 4,
        capturedSignature: signature,
        currentSignature: signature,
        draftEdited: false,
      }),
    ).toBe(true);

    // A need edit changes the signature.
    expect(
      shouldDiscardDraftResponse({
        capturedGeneration: 3,
        currentGeneration: 3,
        capturedSignature: signature,
        currentSignature: changedSignature,
        draftEdited: false,
      }),
    ).toBe(true);

    // A citizen edit makes the stored draft authoritative.
    expect(
      shouldDiscardDraftResponse({
        capturedGeneration: 3,
        currentGeneration: 3,
        capturedSignature: signature,
        currentSignature: signature,
        draftEdited: true,
      }),
    ).toBe(true);
  });

  it("discards a late draft response after a citizen edit bumped the generation even when the stale closure saw an untouched draft", () => {
    // handleDraftChange increments draftRequestGeneration on the first edit, so
    // a request callback that still closes over draftText === draftOriginalText
    // (draftEdited: false) is nonetheless discarded by the generation change.
    expect(
      shouldDiscardDraftResponse({
        capturedGeneration: 3,
        currentGeneration: 4,
        capturedSignature: "need-signature-a",
        currentSignature: "need-signature-a",
        draftEdited: false,
      }),
    ).toBe(true);
  });
});

describe("request generation guard", () => {
  it("discards a response whose request generation is no longer current", () => {
    expect(isStaleRequest(3, 3)).toBe(false);
    expect(isStaleRequest(3, 4)).toBe(true);
  });

  it("supersedes an in-flight interpretation when the Ask text changes", () => {
    expect(
      shouldSupersedeInterpretation({
        value: "Question B",
        currentText: "Question A",
        isInterpreting: true,
      }),
    ).toBe(true);
    expect(
      shouldSupersedeInterpretation({
        value: "Question A",
        currentText: "Question A",
        isInterpreting: true,
      }),
    ).toBe(false);
    expect(
      shouldSupersedeInterpretation({
        value: "Question B",
        currentText: "Question A",
        isInterpreting: false,
      }),
    ).toBe(false);
  });
});

describe("language switch decision", () => {
  it("re-runs resolution when a verified-model narration is in another language", () => {
    expect(
      languageSwitchDecision({
        phase: "result",
        narration: "verified_model",
        narrationLanguage: "en",
        nextLanguage: "hi",
        hasNeed: true,
        draftUntouched: false,
      }),
    ).toBe("resolve");
  });

  it("re-runs resolution even when the temporary phase is search", () => {
    expect(
      languageSwitchDecision({
        phase: "search",
        narration: "verified_model",
        narrationLanguage: "hi",
        nextLanguage: "en",
        hasNeed: true,
        draftUntouched: false,
      }),
    ).toBe("resolve");
  });

  it("restores the retained result when switching back to its language mid-search", () => {
    expect(
      languageSwitchDecision({
        phase: "search",
        narration: "verified_model",
        narrationLanguage: "en",
        nextLanguage: "en",
        hasNeed: true,
        draftUntouched: false,
      }),
    ).toBe("restore-result");
  });

  it("re-drafts an untouched draft instead of re-resolving", () => {
    expect(
      languageSwitchDecision({
        phase: "draft",
        narration: "verified_model",
        narrationLanguage: "en",
        nextLanguage: "hi",
        hasNeed: true,
        draftUntouched: true,
      }),
    ).toBe("request-draft");
  });

  it("does nothing for an edited draft even with a mismatched verified narration", () => {
    expect(
      languageSwitchDecision({
        phase: "draft",
        narration: "verified_model",
        narrationLanguage: "en",
        nextLanguage: "hi",
        hasNeed: true,
        draftUntouched: false,
      }),
    ).toBe("none");
  });

  it("does nothing when switching language from the File phase", () => {
    expect(
      languageSwitchDecision({
        phase: "file",
        narration: "verified_model",
        narrationLanguage: "en",
        nextLanguage: "hi",
        hasNeed: true,
        draftUntouched: false,
      }),
    ).toBe("none");
  });

  it("does nothing when switching language from the Acknowledgement phase", () => {
    expect(
      languageSwitchDecision({
        phase: "acknowledgement",
        narration: "verified_model",
        narrationLanguage: "en",
        nextLanguage: "hi",
        hasNeed: true,
        draftUntouched: false,
      }),
    ).toBe("none");
  });

  it("does nothing for deterministic narration or non-research phases", () => {
    expect(
      languageSwitchDecision({
        phase: "result",
        narration: "deterministic",
        narrationLanguage: "en",
        nextLanguage: "hi",
        hasNeed: true,
        draftUntouched: false,
      }),
    ).toBe("none");
    expect(
      languageSwitchDecision({
        phase: "start",
        narration: undefined,
        narrationLanguage: undefined,
        nextLanguage: "hi",
        hasNeed: false,
        draftUntouched: false,
      }),
    ).toBe("none");
  });
});
