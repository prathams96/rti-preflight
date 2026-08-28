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

  it("retains distinctive OpenAI presentation for seeded NCRB interpretation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            needs: [
              {
                canonicalNeed:
                  "Property theft and recovery across Indian states",
                measure: "Stolen and recovered property value",
                geography: "All States/UTs",
                period: "2021 and 2023",
                breakdown: "State / UT",
                informationHolder: "NCRB",
                resolutionPreference: "published",
                unresolvedClarifications: [],
                display: {
                  canonicalNeed:
                    "India, broken down by State and Union Territory, comparing 2021 with 2023",
                  measure:
                    "Value of property reported stolen and subsequently recovered",
                  geography: "India, broken down by State and Union Territory",
                  period: "Figures for 2021 and 2023",
                  breakdown: "By State and Union Territory",
                  informationHolder: "NCRB",
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
          language: "en",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(payload.needs[0]).toMatchObject({
      scenario: "ncrb-property",
      canonicalNeed:
        "Identify individual States/UTs where reported property stolen increased and recovery percentage declined between 2021 and 2023.",
      geography: "All States/UTs",
    });
    expect(payload.needs[0].presentation.canonicalNeed).toContain(
      "India, broken down by State and Union Territory",
    );
  });

  it("retains distinctive OpenAI presentation for seeded Railway interpretation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            needs: [
              {
                canonicalNeed: "Railway maintenance spending and contractors",
                measure: "Maintenance spending and contractor names",
                geography: "New Delhi Railway Station",
                period: "FY 2024-25",
                breakdown: "Contractor",
                informationHolder: "Northern Railway",
                resolutionPreference: "formal",
                unresolvedClarifications: [],
                display: {
                  canonicalNeed:
                    "A provider-written request about lift and escalator upkeep",
                  measure:
                    "Spending on maintenance and the contractors awarded the work",
                  geography: "New Delhi Railway Station",
                  period: "Expenditure during FY 2024-25",
                  breakdown: "Contractors who received the work",
                  informationHolder: "Northern Railway",
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
          text: SCENARIO_PROMPTS[2].prompt,
          language: "en",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(payload.needs[0].scenario).toBe("railway-filing");
    expect(payload.needs[0].presentation.measure).toContain(
      "contractors awarded the work",
    );
    expect(payload.needs[0].period).toBe("Financial year 2024–25");
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
                  canonicalNeed:
                    "भारत के राज्यों में 2021 से 2023 तक चोरी और बरामदगी के बदलाव का विश्लेषण",
                  measure: "चोरी की संपत्ति और बरामदगी का प्रतिशत",
                  geography: "भारत के सभी राज्य और केंद्र शासित प्रदेश",
                  period: "2021 बनाम 2023",
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
    const payload = await response.json();
    expect(payload.needs[0].presentation.language).toBe("hi");
    expect(payload.needs[0].presentation.canonicalNeed).toContain(
      "भारत के राज्यों में",
    );
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
            headline:
              "इस प्रोटोटाइप में जाँचे गए स्रोतों से विश्वसनीय सार्वजनिक उत्तर नहीं मिला।",
            headlineGroundingIds: ["result:headline"],
            meaning:
              "इस प्रोटोटाइप में जाँचे गए सरकारी स्रोत आपके सवाल का पूरा जवाब नहीं देते। जानकारी के लिए RTI ड्राफ्ट तैयार करें।",
            meaningGroundingIds: ["result:meaning"],
            sentences: [
              {
                text: "जाँचे गए स्रोतों की जानकारी देखें।",
                groundingIds: ["result:searchScope"],
              },
            ],
            evidenceStatus: "जाँचे गए स्रोतों से विश्वसनीय उत्तर नहीं मिला।",
            evidenceStatusGroundingIds: ["result:evidenceStatus"],
            searchScope:
              "यह प्रोटोटाइप सीमित संख्या में सहेजे गए सरकारी स्रोतों को जाँचता है। यह सरकारी सिस्टम को लाइव नहीं खोज रहा है।",
            searchScopeGroundingIds: ["result:searchScope"],
            recommendedAction:
              "अभी भी चाहिए जानकारी के लिए RTI ड्राफ्ट तैयार करें।",
            recommendedActionGroundingIds: ["result:recommendedAction"],
            gaps: ["जाँचे गए स्रोतों से इस सवाल का विश्वसनीय जवाब नहीं मिला।"],
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
