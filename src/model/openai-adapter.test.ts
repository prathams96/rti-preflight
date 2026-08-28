import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_PROMPTS } from "../content/scenarios";
import {
  modelNeedsToInterpretation,
  OpenAIInterpretationAdapter,
} from "./openai-adapter.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

  it("redacts identifiers before the server-side model request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            needs: [
              {
                canonicalNeed: "My claim status",
                measure: "Claim status",
                geography: "My EPFO account",
                period: "Current",
                breakdown: "Status",
                informationHolder: "EPFO",
                resolutionPreference: "published",
                unresolvedClarifications: [],
                display: {
                  canonicalNeed: "मेरे दावे की स्थिति",
                  measure: "दावे की स्थिति",
                  geography: "मेरा EPFO खाता",
                  period: "वर्तमान",
                  breakdown: "स्थिति",
                  informationHolder: "EPFO",
                  unresolvedClarifications: [],
                },
              },
            ],
          }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAIInterpretationAdapter().interpret({
      text: "Check my claim UAN 123456789012 and email me@example.com",
      traceId: "tr-0123456789abcdef",
      language: "hi",
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as {
      model: string;
      store: boolean;
      input: Array<{ content: string }>;
    };
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(body.store).toBe(false);
    expect(body.input[1].content).not.toContain("123456789012");
    expect(body.input[1].content).not.toContain("me@example.com");
    expect(body.input[0].content).toContain("natural Hindi");
    expect(request.headers).toMatchObject({ authorization: "Bearer test-key" });
    expect(result.needs[0]).toMatchObject({
      canonicalNeed: "My claim status",
      presentation: {
        language: "hi",
        canonicalNeed: "मेरे दावे की स्थिति",
      },
    });
  });

  it("does not bypass the configured provider for a registered scenario", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            needs: [
              {
                canonicalNeed:
                  "Identify individual States/UTs where reported property stolen increased and recovery percentage declined between 2021 and 2023.",
                measure: "Provider paraphrase of the requested measures",
                geography: "All States/UTs",
                period: "2021 versus 2023",
                breakdown: "State / UT",
                informationHolder: "National Crime Records Bureau",
                resolutionPreference: "published",
                unresolvedClarifications: [],
                display: {
                  canonicalNeed:
                    "Mocked provider interpretation of the property stolen and recovery trend from 2021 to 2023",
                  measure:
                    "Mocked provider measure of property stolen and recovered",
                  geography: "All States and Union Territories",
                  period: "2021 versus 2023",
                  breakdown: "State or Union Territory",
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

    const result = await new OpenAIInterpretationAdapter().interpret({
      text: SCENARIO_PROMPTS[0].prompt,
      traceId: "trace-seeded",
    });

    expect(result.needs[0]).toMatchObject({
      scenario: "ncrb-property",
      informationHolder: "National Crime Records Bureau",
      geography: "All States/UTs",
      measure: "Value of property stolen and percentage recovered",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.needs[0].presentation?.canonicalNeed).toContain(
      "Mocked provider interpretation",
    );
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as { input: Array<{ content: string }> };
    expect(requestBody.input[0].content).toContain("natural English");
  });

  it("preserves explicit drafting intent over a model's seeded fixture interpretation", () => {
    const result = modelNeedsToInterpretation({
      originalText: "Please help me prepare an RTI",
      redactedText: "Please help me prepare an RTI",
      traceId: "trace-drafting",
      needs: [
        {
          canonicalNeed: "A previously issued RTI response",
          measure: "Relevant earlier RTI response",
          geography: "A selected Central public authority",
          period: "Not specified",
          breakdown: "Public authority",
          informationHolder: "Central public authority",
          resolutionPreference: "formal",
          unresolvedClarifications: [],
        },
      ],
    });
    expect(result.needs[0]).toMatchObject({
      scenario: "unsupported",
      draftingIntent: true,
      originalText: "Please help me prepare an RTI",
    });
  });

  it("preserves distinct semantic rejection codes instead of collapsing them to INVALID_JSON", () => {
    expect(() =>
      modelNeedsToInterpretation({
        originalText: "Which records does the city publish?",
        redactedText: "Which records does the city publish?",
        traceId: "trace-language",
        language: "hi",
        needs: [
          {
            canonicalNeed: "Published city records",
            measure: "Record register",
            geography: "The city",
            period: "2024",
            breakdown: "By record type",
            informationHolder: "City records office",
            resolutionPreference: "published",
            unresolvedClarifications: [],
            display: {
              canonicalNeed: "Published city records",
              measure: "Record register",
              geography: "The city",
              period: "2024",
              breakdown: "By record type",
              informationHolder: "City records office",
              unresolvedClarifications: [],
            },
          },
        ],
      }),
    ).toThrow("LANGUAGE_MISMATCH");
    expect(() =>
      modelNeedsToInterpretation({
        originalText: "Which records does the city publish?",
        redactedText: "Which records does the city publish?",
        traceId: "trace-presentation",
        language: "hi",
        needs: [
          {
            canonicalNeed: "Identify property stolen between 2021 and 2023",
            measure: "Value of property stolen",
            geography: "All States/UTs",
            period: "2021 versus 2023",
            breakdown: "State / UT",
            informationHolder: "National Crime Records Bureau",
            resolutionPreference: "published",
            unresolvedClarifications: [],
            display: {
              canonicalNeed: "यह पूरी तरह असंबंधित वाक्य है",
              measure: "चोरी की संपत्ति",
              geography: "सभी राज्य",
              period: "2021 बनाम 2023",
              breakdown: "राज्य",
              informationHolder: "National Crime Records Bureau",
              unresolvedClarifications: [],
            },
          },
        ],
      }),
    ).toThrow("PRESENTATION_MISMATCH");
  });

  it("reports INVALID_JSON only for an actual parse failure", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ output_text: "not-json-at-all" }), {
          status: 200,
        }),
      ),
    );
    await expect(
      new OpenAIInterpretationAdapter().interpret({
        text: "Which records does the city publish?",
        traceId: "trace-json",
      }),
    ).rejects.toThrow("INVALID_JSON");
  });

  it("reports SCHEMA_MISMATCH when the parsed shape is not a valid need array", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ output_text: JSON.stringify({ needs: "nope" }) }),
            { status: 200 },
          ),
        ),
    );
    await expect(
      new OpenAIInterpretationAdapter().interpret({
        text: "Which records does the city publish?",
        traceId: "trace-schema",
      }),
    ).rejects.toThrow("SCHEMA_MISMATCH");
  });

  it("classifies multiple model needs independently from their own content", () => {
    const result = modelNeedsToInterpretation({
      originalText: "NCRB property data and EPFO claim status",
      redactedText: "NCRB property data and EPFO claim status",
      traceId: "trace-multi",
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
        },
        {
          canonicalNeed: "The status of the citizen's own EPF claim.",
          measure: "Status of my EPF claim",
          geography: "My EPFO account",
          period: "Current claim",
          breakdown: "Claim",
          informationHolder: "EPFO",
          resolutionPreference: "published",
          unresolvedClarifications: [],
        },
      ],
    });
    expect(result.needs[0].scenario).toBe("ncrb-property");
    expect(result.needs[0].informationHolder).toBe(
      "National Crime Records Bureau",
    );
    expect(result.needs[1].scenario).toBe("epfo-status");
    expect(result.needs[1].informationHolder).toBe(
      "Employees' Provident Fund Organisation",
    );
    expect(result.needs[1].canonicalNeed).toBe(
      "The status of the citizen's own EPF claim.",
    );
  });

  it("does not inherit a seeded fixture scenario for a second unsupported need", () => {
    const result = modelNeedsToInterpretation({
      originalText: SCENARIO_PROMPTS[0].prompt,
      redactedText: SCENARIO_PROMPTS[0].prompt,
      traceId: "trace-multi-seeded",
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
        },
        {
          canonicalNeed: "Road repair expenditure in my municipality",
          measure: "Road repair expenditure",
          geography: "My municipality",
          period: "Financial year 2024-25",
          breakdown: "Month",
          informationHolder: "Municipal corporation",
          resolutionPreference: "published",
          unresolvedClarifications: [
            "Which municipal corporation or city, and which financial year should be checked?",
          ],
        },
      ],
    });
    expect(result.needs[0].scenario).toBe("ncrb-property");
    expect(result.needs[1].scenario).toBe("unsupported");
    expect(result.needs[1].canonicalNeed).toBe(
      "Road repair expenditure in my municipality",
    );
  });
});
