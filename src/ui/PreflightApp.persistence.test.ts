import { afterEach, describe, expect, it, vi } from "vitest";
import {
  persist,
  readPersistedState,
  readSessionFilingState,
} from "./PreflightApp";

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

  it("keeps a valid filing session when the research record is invalid", () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    vi.stubGlobal("window", { localStorage, sessionStorage });

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
        draftText: "Filing draft",
        package: {},
        step: "otp",
        otp: "",
        profile: {},
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
  });
});
