import type {
  InformationNeed,
  NeedInterpretation,
  ResolutionPreference,
} from "../domain/types";
import type { InterpretationAdapter } from "./adapter";
import { redactSensitiveIdentifiers } from "./redaction";
import { clarificationsForNeeds, scenarioForText } from "../content/scenarios";
import { resolveAuthorityName } from "./authority-registry";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

type ModelNeed = {
  canonicalNeed: string;
  measure: string;
  geography: string;
  period: string;
  breakdown: string;
  informationHolder: string;
  resolutionPreference: ResolutionPreference;
  unresolvedClarifications: string[];
};

export function modelNeedsToInterpretation(input: {
  originalText: string;
  redactedText: string;
  needs: ModelNeed[];
  traceId: string;
}): NeedInterpretation {
  if (input.needs.length === 0 || input.needs.length > 5)
    throw new Error("SCHEMA_MISMATCH");
  const needs: InformationNeed[] = input.needs.map((modelNeed, index) => {
    const holder = resolveAuthorityName(modelNeed.informationHolder);
    return {
      id: `model-need-${index + 1}`,
      originalText: input.originalText,
      canonicalNeed: modelNeed.canonicalNeed,
      measure: modelNeed.measure,
      geography: modelNeed.geography,
      period: modelNeed.period,
      breakdown: modelNeed.breakdown,
      informationHolder: holder?.name ?? modelNeed.informationHolder,
      informationHolderStatus: holder ? "verified" : "unverified",
      resolutionPreference: modelNeed.resolutionPreference,
      unresolvedClarifications: modelNeed.unresolvedClarifications.slice(0, 2),
      scenario: scenarioForText(
        `${modelNeed.canonicalNeed} ${modelNeed.measure}`,
      ),
    };
  });
  return {
    originalText: input.originalText,
    redactedText: input.redactedText,
    needs,
    clarifications: clarificationsForNeeds(needs).slice(0, 2),
    traceId: input.traceId,
  };
}

/** Server-only adapter. The deterministic adapter is the offline/default path for the prototype. */
export class OpenAIInterpretationAdapter implements InterpretationAdapter {
  async interpret(input: {
    text: string;
    traceId: string;
  }): Promise<NeedInterpretation> {
    const { redacted } = redactSensitiveIdentifiers(input.text);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("PROVIDER_NOT_CONFIGURED");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        store: false,
        input: [
          {
            role: "system",
            content:
              "Return only schema-constrained interpretation fields. Never provide facts, evidence, figures, or URLs.",
          },
          { role: "user", content: redacted },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "information_need_interpretation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                needs: {
                  type: "array",
                  maxItems: 5,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      canonicalNeed: { type: "string" },
                      measure: { type: "string" },
                      geography: { type: "string" },
                      period: { type: "string" },
                      breakdown: { type: "string" },
                      informationHolder: { type: "string" },
                      resolutionPreference: {
                        type: "string",
                        enum: ["published", "formal", "unsure"],
                      },
                      unresolvedClarifications: {
                        type: "array",
                        maxItems: 2,
                        items: { type: "string" },
                      },
                    },
                    required: [
                      "canonicalNeed",
                      "measure",
                      "geography",
                      "period",
                      "breakdown",
                      "informationHolder",
                      "resolutionPreference",
                      "unresolvedClarifications",
                    ],
                  },
                },
              },
              required: ["needs"],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("PROVIDER_REFUSED");
    const payload = (await response.json()) as OpenAIResponse;
    const raw =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .map((item) => item.text ?? "")
        .join("");
    if (!raw) throw new Error("SCHEMA_MISMATCH");
    try {
      const parsed = JSON.parse(raw) as { needs?: unknown };
      if (!Array.isArray(parsed.needs)) throw new Error("SCHEMA_MISMATCH");
      return modelNeedsToInterpretation({
        originalText: input.text,
        redactedText: redacted,
        needs: parsed.needs as ModelNeed[],
        traceId: input.traceId,
      });
    } catch {
      throw new Error("INVALID_JSON");
    }
  }
}
