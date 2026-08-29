import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SCENARIO_PROMPTS,
  interpretWithFixture,
} from "../../../content/scenarios";
import {
  GENERIC_RTI_DEMO_ROUTE_ID,
  NORTHERN_RAILWAY_ROUTE,
} from "../../../filing";
import { POST as interpretPOST } from "../interpret/route";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function request(
  need: ReturnType<typeof interpretWithFixture>[number],
  language = "en",
) {
  return new Request("http://localhost/api/draft", {
    method: "POST",
    body: JSON.stringify({
      need,
      language,
      route: { id: NORTHERN_RAILWAY_ROUTE.id },
      maxChars: NORTHERN_RAILWAY_ROUTE.profile.text.maxChars,
    }),
  });
}

describe("filing draft generation route", () => {
  it("carries an arbitrary AI-interpreted need into a valid generic filing package", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            needs: [
              {
                canonicalNeed:
                  "Number of MSMEs that shut or closed in 2025 and 2026",
                measure: "Number of MSMEs that shut/closed",
                geography: "Not specified",
                period: "2025 versus 2026",
                breakdown: "Year",
                informationHolder:
                  "Ministry of Micro, Small and Medium Enterprises",
                resolutionPreference: "formal",
                unresolvedClarifications: [
                  "Which geography should be covered?",
                ],
                display: {
                  canonicalNeed:
                    "Number of MSMEs that shut or closed in 2025 and 2026",
                  measure: "Number of MSMEs that shut/closed",
                  geography: "Not specified",
                  period: "2025 versus 2026",
                  breakdown: "Year",
                  informationHolder:
                    "Ministry of Micro, Small and Medium Enterprises",
                  unresolvedClarifications: [
                    "Which geography should be covered?",
                  ],
                },
              },
            ],
          }),
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const interpretation = await interpretPOST(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        headers: { "x-rti-trace-id": "trace-msme-integration" },
        body: JSON.stringify({
          text: "What are the number of MSMEs shut in 2026 from 2025",
          language: "en",
        }),
      }),
    );
    const interpreted = await interpretation.json();
    expect(interpretation.status).toBe(200);
    const need = interpreted.needs[0];
    expect(need).toMatchObject({
      geography: "Not specified",
      period: "2025 versus 2026",
      breakdown: "Year",
      informationHolder: "Ministry of Micro, Small and Medium Enterprises",
      informationHolderStatus: "unverified",
    });

    vi.stubEnv("OPENAI_API_KEY", "");
    const draftResponse = await POST(request(need));
    const payload = await draftResponse.json();
    expect(draftResponse.status).toBe(200);
    expect(payload.filingPackage).toMatchObject({
      valid: true,
      route: { id: GENERIC_RTI_DEMO_ROUTE_ID, guidedCoverage: false },
    });
    expect(payload.draft.text).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the deterministic draft when no provider is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      request(interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0], "hi"),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(payload.generation).toBe("deterministic");
    expect(payload.degradationCode).toBe("PROVIDER_NOT_CONFIGURED");
    expect(payload.guidedCoverage).toBe(true);
    expect(payload.filingPackage.route.id).toBe(NORTHERN_RAILWAY_ROUTE.id);
  });

  it("uses a validated OpenAI draft for deterministic guided coverage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    const generated =
      "Please provide records concerning maintenance expenditure, work orders, contracts, and contractor names for lifts and escalators at New Delhi Railway Station during financial year 2024–25 in electronic form.";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ output_text: JSON.stringify({ text: generated }) }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      request({
        ...interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0],
        originalText: "Send the records to citizen@example.com",
        canonicalNeed:
          "Records of lift and escalator maintenance expenditure and contractors at New Delhi Railway Station, reference UAN 123456789012.",
      }),
    );
    const payload = await response.json();
    expect(payload.generation).toBe("openai");
    expect(payload.degraded).toBe(false);
    expect(payload.draft.text).toBe(generated);
    expect(payload.filingPackage.draft.text).toBe(generated);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as { input: Array<{ content: string }> };
    expect(body.input[0].content).toContain(
      "Draft an RTI request, not an answer",
    );
    expect(body.input[1].content).not.toContain("citizen@example.com");
    expect(body.input[1].content).not.toContain("123456789012");
  });

  it("rejects an invalid provider draft and returns the deterministic fallback without truncation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    const invalid = "x".repeat(3_001);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ output_text: JSON.stringify({ text: invalid }) }),
            { status: 200 },
          ),
        ),
    );
    const response = await POST(
      request(interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0]),
    );
    const payload = await response.json();
    expect(payload.generation).toBe("deterministic");
    expect(payload.degradationCode).toBe("DRAFT_VALIDATION_FAILED");
    expect(payload.draft.text).not.toBe(invalid.slice(0, 3_000));
    expect(payload.validation.valid).toBe(true);
  });

  it("rejects an unrelated Hindi draft that lacks guided-route scope anchors", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              text: "कृपया नगर निगम से सड़क मरम्मत और पानी की आपूर्ति के रिकॉर्ड उपलब्ध कराएँ।",
            }),
          }),
          { status: 200 },
        ),
      ),
    );
    const response = await POST(
      request(interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0], "hi"),
    );
    const payload = await response.json();
    expect(payload.generation).toBe("deterministic");
    expect(payload.degradationCode).toBe("DRAFT_VALIDATION_FAILED");
    expect(payload.filingPackage.draft.text).not.toContain("नगर निगम");
  });

  it("falls back when the provider ignores the selected Hindi language", async () => {
    vi.stubEnv("OPENAI_API_KEY", "configured-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              text: "Please provide maintenance expenditure, ledger, work orders, contracts, and contractor records for lifts and escalators at New Delhi Railway Station during 2024–25.",
            }),
          }),
          { status: 200 },
        ),
      ),
    );
    const response = await POST(
      request(interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0], "hi"),
    );
    const payload = await response.json();
    expect(payload.generation).toBe("deterministic");
    expect(payload.degradationCode).toBe("LANGUAGE_MISMATCH");
    expect(payload.draft.text).toContain("कृपया");
  });

  it("ignores a caller-supplied maxChars and keeps the registry constraint", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const need = interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0];
    const response = await POST(
      new Request("http://localhost/api/draft", {
        method: "POST",
        body: JSON.stringify({
          need,
          language: "en",
          route: { id: NORTHERN_RAILWAY_ROUTE.id },
          maxChars: 5,
        }),
      }),
    );
    const payload = await response.json();
    expect(payload.guidedCoverage).toBe(true);
    expect(payload.validation.valid).toBe(true);
    expect(payload.filingPackage.route.profile.text.maxChars).toBe(
      NORTHERN_RAILWAY_ROUTE.profile.text.maxChars,
    );
    expect(payload.validation.characterCount).toBeGreaterThan(5);
    expect(payload.draft.text.length).toBeGreaterThan(5);
  });

  it("cannot expand the verified portal constraint with an oversized caller maxChars", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const need = interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0];
    const response = await POST(
      new Request("http://localhost/api/draft", {
        method: "POST",
        body: JSON.stringify({
          need,
          language: "en",
          route: { id: NORTHERN_RAILWAY_ROUTE.id },
          maxChars: 99_999,
        }),
      }),
    );
    const payload = await response.json();
    expect(payload.filingPackage.route.profile.text.maxChars).toBe(
      NORTHERN_RAILWAY_ROUTE.profile.text.maxChars,
    );
  });

  it.each([
    ["measure", "Parking expenditure"],
    ["geography", "Mumbai Central Railway Station"],
    ["period", "Financial year 2023–24"],
    ["breakdown", "Month"],
    ["informationHolder", "Western Railway"],
  ] as const)(
    "keeps a demo filing package available after a material %s edit",
    async (field, value) => {
      vi.stubEnv("OPENAI_API_KEY", "");
      const edited = {
        ...interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0],
        [field]: value,
      };
      const response = await POST(request(edited));
      const payload = await response.json();
      expect(payload.guidedCoverage).toBe(false);
      expect(payload.filingPackage.route.id).toBe(GENERIC_RTI_DEMO_ROUTE_ID);
      expect(payload.filingPackage.route.officialUrl).toBeUndefined();
      expect(payload.filingPackage.route.guidedCoverage).toBe(false);
      expect(payload.draft.text).toContain("confirmed Information Need");
    },
  );
});
