import { afterEach, describe, expect, it, vi } from "vitest";
import type { InformationNeed } from "../domain/types";
import {
  persist,
  readPersistedState,
  readSessionFilingState,
  restoreSavedPreflightForLanguage,
} from "./PreflightApp";
import {
  createFilingModule,
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
      measure: "Maintenance expenditure and contractor records",
      geography: "New Delhi Railway Station",
      period: "Financial year 2024-25",
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

  it("keeps the selected language while restoring a saved draft", () => {
    const saved = {
      id: "saved-1",
      label: "Saved draft",
      text: "Please provide records showing the confirmed need.",
      phase: "draft" as const,
      draftText: "Please provide records showing the confirmed need.",
      draftOriginalText: "Please provide records showing the confirmed need.",
      language: "en" as const,
    } as Parameters<typeof restoreSavedPreflightForLanguage>[0];

    const restored = restoreSavedPreflightForLanguage(saved, "hi");

    expect(restored.language).toBe("hi");
    expect(restored.draftText).toContain("कृपया");
    expect(restored.draftOriginalText).toContain("कृपया");
  });
});
