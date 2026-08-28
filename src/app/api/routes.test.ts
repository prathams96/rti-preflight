import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as interpret } from "./interpret/route";
import { POST as resolve } from "./resolve/route";
import { DemoAdapter } from "../../filing/adapter";
import type { CitizenConfirmed } from "../../filing/types";
import {
  SCENARIO_PROMPTS,
  interpretWithFixture,
} from "../../content/scenarios";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("release boundary routes", () => {
  it("rejects empty and oversized interpretation bodies before any provider call", async () => {
    const empty = await interpret(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        body: JSON.stringify({ text: " " }),
      }),
    );
    const oversized = await interpret(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        body: JSON.stringify({ text: "x".repeat(8_001) }),
      }),
    );
    expect(empty.status).toBe(400);
    expect(oversized.status).toBe(400);
  });

  it("requires a confirmed need at the resolution boundary", async () => {
    const response = await resolve(
      new Request("http://localhost/api/resolve", {
        method: "POST",
        body: JSON.stringify({ need: null }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_NEED" });
  });

  it("carries a valid opaque trace ID across the API boundary", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const traceId = "tr-0123456789abcdef";
    const response = await interpret(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        headers: { "x-rti-trace-id": traceId },
        body: JSON.stringify({
          text: "Which States reported property stolen up and recovery down?",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).traceId).toBe(traceId);
  });

  it("selects OpenAI for a seeded scenario when configured and propagates Hindi", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            needs: [
              {
                canonicalNeed:
                  "Identify individual States/UTs where reported property stolen increased and recovery percentage declined between 2021 and 2023.",
                measure: "Value of property stolen and percentage recovered",
                geography: "All States/UTs",
                period: "2021 versus 2023",
                breakdown: "State / UT",
                informationHolder: "National Crime Records Bureau",
                resolutionPreference: "published",
                unresolvedClarifications: [],
                display: {
                  canonicalNeed: "राज्यों की रिपोर्ट की गई प्रवृत्ति पहचानें",
                  measure: "चोरी और बरामदगी",
                  geography: "सभी राज्य/केंद्र शासित प्रदेश",
                  period: "2021 से 2023",
                  breakdown: "राज्य / केंद्र शासित प्रदेश",
                  informationHolder: "National Crime Records Bureau",
                  unresolvedClarifications: [],
                },
              },
            ],
          }),
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await interpret(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        body: JSON.stringify({
          text: SCENARIO_PROMPTS[0].prompt,
          language: "hi",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as { input: Array<{ content: string }> };
    expect(requestBody.input[0].content).toContain("natural Hindi");
    expect((await response.json()).needs[0].presentation.language).toBe("hi");
  });

  it("falls back deterministically when the configured interpretation provider fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    const fetchMock = vi.fn().mockRejectedValue(new Error("provider down"));
    vi.stubGlobal("fetch", fetchMock);
    const response = await interpret(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        body: JSON.stringify({
          text: SCENARIO_PROMPTS[0].prompt,
          language: "en",
        }),
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(payload.needs[0].scenario).toBe("ncrb-property");
    expect(payload.language).toBe("en");
  });

  it("uses deterministic interpretation without a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await interpret(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        body: JSON.stringify({
          text: SCENARIO_PROMPTS[0].prompt,
          language: "hi",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await response.json()).language).toBe("hi");
  });

  it("propagates Hindi to OpenAI narration for an evidence-empty result", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    const need = interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            headline: "जाँचे गए स्नैपशॉट में विश्वसनीय निष्कर्ष नहीं मिला।",
            headlineGroundingIds: ["result:headline"],
            meaning:
              "यह रिकॉर्ड के उपलब्ध या प्रकाशित होने पर निष्कर्ष नहीं देता; गुम रिकॉर्ड के लिए RTI ड्राफ्ट तैयार करें।",
            meaningGroundingIds: ["result:meaning"],
            sentences: [
              {
                text: "जाँचे गए दायरे की समीक्षा करें।",
                groundingIds: ["result:searchScope"],
              },
            ],
            evidenceStatus:
              "जाँचे गए स्नैपशॉट में कोई सहायक व्यय विवरण, लेजर, कार्यादेश या ठेकेदार रिकॉर्ड नहीं मिला।",
            evidenceStatusGroundingIds: ["result:evidenceStatus"],
            searchScope:
              "पंजीकृत फाइलिंग साक्ष्य स्नैपशॉट में Northern Railway रिकॉर्ड दायरा जाँचा गया।",
            searchScopeGroundingIds: ["result:searchScope"],
            recommendedAction: "रिकॉर्ड-केंद्रित RTI ड्राफ्ट की समीक्षा करें।",
            recommendedActionGroundingIds: ["result:recommendedAction"],
            gaps: [
              "स्नैपशॉट में इस रिकॉर्ड अनुरोध के लिए सहायक साक्ष्य की कमी है।",
            ],
            gapsGroundingIds: ["result:gap:0"],
          }),
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await resolve(
      new Request("http://localhost/api/resolve", {
        method: "POST",
        body: JSON.stringify({ need, language: "hi" }),
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as { input: Array<{ content: string }> };
    expect(requestBody.input[0].content).toContain("natural Hindi");
    expect(payload.narrationRejectionCode).toBeUndefined();
    expect(payload.narration).toBe("verified_model");
    expect(payload.headline).toContain("विश्वसनीय");
  });

  it("keeps Demo Adapter submission offline", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("network denied by release test");
    }) as typeof fetch;
    try {
      const input = {
        package: {
          valid: true,
          draft: {
            text: "records",
            needId: "need-1",
            holderId: "holder-1",
            routeId: "route-1",
          },
          confirmedNeed: { id: "need-1" },
          holder: { id: "holder-1", canonicalName: "Test authority" },
          route: {
            id: "route-1",
            authority: {
              id: "holder-1",
              canonicalName: "Test authority",
              portalNames: { "route-1": "Demo route" },
              jurisdiction: "central" as const,
              aliases: [],
              lastVerified: "2026-08-27",
              verifiedBy: "test",
            },
            profile: {
              id: "route-profile",
              version: "1",
              verifiedAt: "2026-08-27",
              text: { maxChars: 3000, overflowStrategy: "reject" as const },
              identity: { fieldsRequired: [], fieldsProhibited: [] },
              sourceUrl: "https://example.invalid/route",
              submission: "demo" as const,
            },
            officialUrl: "https://example.invalid/route",
            guidedCoverage: true,
          },
          validation: {
            valid: true,
            text: "records",
            characterCount: 7,
            errors: [],
          },
        },
        confirmation: {
          otp: "123456",
          profile: {
            fullName: "DEMO CITIZEN",
            email: "demo@example.invalid",
            address: "Fictional address",
            state: "Delhi",
            pinCode: "110000",
          },
          reviewed: true,
          payment: { method: "demo_upi" as const, amountInr: 10 },
        },
      } satisfies CitizenConfirmed;
      const acknowledgement = await new DemoAdapter().submit(input);
      expect(acknowledgement.disclosure).toContain("No request");
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
