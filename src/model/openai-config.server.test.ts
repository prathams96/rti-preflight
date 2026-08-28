import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPENAI_MODEL,
  OPENAI_REASONING,
  OPENAI_TIMEOUT_MS,
  isProviderTimeout,
  providerFailure,
  PROVIDER_INVALID_SCHEMA,
  PROVIDER_RATE_LIMIT,
  PROVIDER_REFUSED,
} from "./openai-config.server";

describe("shared OpenAI runtime configuration", () => {
  it("defaults to GPT-5.6 Luna with low reasoning effort and a non-brittle timeout", () => {
    expect(OPENAI_MODEL).toBe("gpt-5.6-luna");
    expect(OPENAI_REASONING).toEqual({ effort: "low" });
    expect(OPENAI_TIMEOUT_MS).toBe(60_000);
  });
});

describe("provider failure diagnostics", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("maps invalid_json_schema to a safe schema code", async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          type: "invalid_request_error",
          code: "invalid_json_schema",
          param: "text.format.schema",
        },
      }),
      { status: 400, headers: { "x-request-id": "req-123" } },
    );
    const { code, diagnostic } = await providerFailure(
      "interpretation",
      response,
    );
    expect(code).toBe(PROVIDER_INVALID_SCHEMA);
    expect(diagnostic).toMatchObject({
      endpoint: "interpretation",
      httpStatus: 400,
      errorType: "invalid_request_error",
      errorCode: "invalid_json_schema",
      errorParam: "text.format.schema",
      requestId: "req-123",
    });
  });

  it("maps rate-limit responses to a rate-limit code", async () => {
    const response = new Response(
      JSON.stringify({ error: { type: "rate_limit_error" } }),
      { status: 429 },
    );
    const { code } = await providerFailure("narration", response);
    expect(code).toBe(PROVIDER_RATE_LIMIT);
  });

  it("maps other non-2xx responses to a generic refusal code", async () => {
    const response = new Response("service unavailable", { status: 503 });
    const { code } = await providerFailure("draft", response);
    expect(code).toBe(PROVIDER_REFUSED);
  });

  it("never logs the API key or authorization header", async () => {
    const response = new Response(
      JSON.stringify({
        error: { type: "invalid_request_error", code: "invalid_json_schema" },
      }),
      { status: 400 },
    );
    await providerFailure("interpretation", response);
    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => call.join(" "))
      .join("\n");
    expect(logged).not.toContain("sk-");
    expect(logged).not.toContain("Bearer");
    expect(logged).not.toContain("authorization");
  });
});

describe("timeout detection", () => {
  it("recognizes a provider timeout without overmatching other errors", () => {
    const timeout = Object.assign(new Error("The operation timed out."), {
      name: "TimeoutError",
    });
    expect(isProviderTimeout(timeout)).toBe(true);
    expect(isProviderTimeout(new Error("network down"))).toBe(false);
  });
});
