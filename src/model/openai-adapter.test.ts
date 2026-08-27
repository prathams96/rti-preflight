import { afterEach, describe, expect, it, vi } from "vitest";
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
              },
            ],
          }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAIInterpretationAdapter().interpret({
      text: "Check my EPF claim UAN 123456789012 and email me@example.com",
      traceId: "tr-0123456789abcdef",
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
    expect(request.headers).toMatchObject({ authorization: "Bearer test-key" });
  });
});
