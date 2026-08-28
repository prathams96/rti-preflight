import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshot } from "../evidence/snapshot";
import { interpretWithFixture } from "../content/scenarios";
import { matchRegisteredTable } from "../preflight/calc-planning";
import { planForAnalysis } from "./plan-adapter";
import {
  OpenAICalcPlanAdapter,
  parseCalcPlan,
} from "./openai-plan-adapter.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function candidate() {
  const need = interpretWithFixture(
    "Identify States/UTs where the value of property stolen increased between 2021 and 2023.",
  )[0];
  const result = matchRegisteredTable(need, snapshot);
  if (!result) throw new Error("test candidate missing");
  return result;
}

describe("OpenAI CalcPlan adapter", () => {
  it("requests and parses only a declarative structured plan", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const input = candidate();
    const plan = planForAnalysis(input.need, input.table);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output_text: JSON.stringify(plan) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAICalcPlanAdapter().plan(input);
    expect(result).toEqual(plan);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.store).toBe(false);
    expect(body.input[0].content).toContain("do not calculate the answer");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(request.headers).toMatchObject({ authorization: "Bearer test-key" });
  });

  it("rejects malformed structured output and provider failures", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const input = candidate();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ output_text: JSON.stringify({ nope: true }) }),
          {
            status: 200,
          },
        ),
      ),
    );
    await expect(new OpenAICalcPlanAdapter().plan(input)).rejects.toThrow(
      "PLAN_PARSE_FAILED",
    );
    expect(() =>
      parseCalcPlan({
        ...planForAnalysis(input.need, input.table),
        extra: true,
      }),
    ).toThrow("PLAN_PARSE_FAILED");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "AbortError")),
    );
    await expect(new OpenAICalcPlanAdapter().plan(input)).rejects.toThrow(
      "PROVIDER_TIMEOUT",
    );
  });
});
