/**
 * Server-only runtime configuration and diagnostics for the OpenAI Responses
 * API. GPT-5.6 Luna is the intended production model for interpretation,
 * narration, and draft generation. This file must never be imported from a
 * client bundle and must never expose credentials.
 */

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

/**
 * These transformations are tightly constrained around deterministic state and
 * do not need deep deliberation. `reasoning.effort: "low"` keeps the
 * AI-native response fast while the deterministic fallback remains the
 * availability guarantee.
 */
export const OPENAI_REASONING = { effort: "low" as const };

/**
 * The deterministic fallback already guarantees availability, so the provider
 * is given a full minute to complete a live GPT-5.6 Luna response rather than
 * degrading to hardcoded prose after a few seconds.
 */
export const OPENAI_TIMEOUT_MS = 60_000;

export type ProviderEndpointCategory =
  "interpretation" | "narration" | "draft" | "plan";

export type ProviderDiagnostic = {
  endpoint: ProviderEndpointCategory;
  httpStatus: number;
  errorType?: string;
  errorCode?: string;
  errorParam?: string;
  requestId?: string;
};

type OpenAIErrorPayload = {
  error?: {
    type?: string;
    code?: string;
    param?: string | null;
    message?: string;
  };
};

export const PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT";
export const PROVIDER_REFUSED = "PROVIDER_REFUSED";
export const PROVIDER_RATE_LIMIT = "PROVIDER_RATE_LIMIT";
export const PROVIDER_INVALID_SCHEMA = "PROVIDER_INVALID_SCHEMA";

/** Distinguishes a provider timeout from a network rejection without overmatching. */
export function isProviderTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * Reads a non-2xx OpenAI response safely, maps it to a concise degradation
 * code, and logs server-side diagnostics only. Never logs the API key, the
 * authorization header, citizen text, or the raw request/response body.
 */
export async function providerFailure(
  endpoint: ProviderEndpointCategory,
  response: Response,
): Promise<{ code: string; diagnostic: ProviderDiagnostic }> {
  const diagnostic: ProviderDiagnostic = {
    endpoint,
    httpStatus: response.status,
  };
  const requestId = response.headers.get("x-request-id") ?? undefined;
  if (requestId) diagnostic.requestId = requestId;

  let code = PROVIDER_REFUSED;
  try {
    const payload = (await response.json()) as OpenAIErrorPayload;
    const error = payload.error;
    if (error && typeof error === "object") {
      if (typeof error.type === "string") diagnostic.errorType = error.type;
      if (typeof error.code === "string") diagnostic.errorCode = error.code;
      if (typeof error.param === "string") diagnostic.errorParam = error.param;
    }
  } catch {
    /* Non-JSON error body; keep the generic refusal code. */
  }

  const type = diagnostic.errorType?.toLocaleLowerCase() ?? "";
  const errorCode = diagnostic.errorCode?.toLocaleLowerCase() ?? "";
  if (
    type.includes("invalid_json_schema") ||
    errorCode.includes("invalid_json_schema")
  ) {
    code = PROVIDER_INVALID_SCHEMA;
  } else if (
    response.status === 429 ||
    type.includes("rate_limit") ||
    errorCode.includes("rate_limit")
  ) {
    code = PROVIDER_RATE_LIMIT;
  }

  console.error(
    `openai.provider_error endpoint=${endpoint} status=${response.status}` +
      `${diagnostic.errorType ? ` type=${diagnostic.errorType}` : ""}` +
      `${diagnostic.errorCode ? ` code=${diagnostic.errorCode}` : ""}` +
      `${diagnostic.errorParam ? ` param=${diagnostic.errorParam}` : ""}` +
      `${diagnostic.requestId ? ` request_id=${diagnostic.requestId}` : ""}`,
  );
  return { code, diagnostic };
}
