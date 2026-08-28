import type {
  InformationNeed,
  NeedInterpretation,
  Language,
  ResolutionPreference,
} from "../domain/types";
import type { InterpretationAdapter } from "./adapter";
import { redactSensitiveIdentifiers } from "./redaction";
import {
  clarificationsForNeeds,
  hasExplicitDraftingIntent,
  interpretWithFixture,
  SCENARIO_PROMPTS,
  scenarioForModelNeed,
} from "../content/scenarios";
import { resolveAuthorityName } from "./authority-registry";
import {
  matchesLanguageForFields,
  preservesPresentationField,
  type PresentationField,
} from "./language";
import {
  OPENAI_MODEL,
  OPENAI_REASONING,
  OPENAI_TIMEOUT_MS,
  isProviderTimeout,
  providerFailure,
  PROVIDER_TIMEOUT,
} from "./openai-config.server";

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
  display?: {
    canonicalNeed: string;
    measure: string;
    geography: string;
    period: string;
    breakdown: string;
    informationHolder: string;
    unresolvedClarifications: string[];
  };
};

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isModelNeed(value: unknown): value is ModelNeed {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const need = value as Record<string, unknown>;
  const display = need.display;
  return (
    typeof need.canonicalNeed === "string" &&
    typeof need.measure === "string" &&
    typeof need.geography === "string" &&
    typeof need.period === "string" &&
    typeof need.breakdown === "string" &&
    typeof need.informationHolder === "string" &&
    ["published", "formal", "unsure"].includes(
      String(need.resolutionPreference),
    ) &&
    isStringArray(need.unresolvedClarifications) &&
    Boolean(display) &&
    typeof display === "object" &&
    !Array.isArray(display) &&
    [
      "canonicalNeed",
      "measure",
      "geography",
      "period",
      "breakdown",
      "informationHolder",
    ].every(
      (field) =>
        typeof (display as Record<string, unknown>)[field] === "string",
    ) &&
    isStringArray((display as Record<string, unknown>).unresolvedClarifications)
  );
}

export function modelNeedsToInterpretation(input: {
  originalText: string;
  redactedText: string;
  needs: ModelNeed[];
  traceId: string;
  language?: Language;
}): NeedInterpretation {
  if (input.needs.length === 0 || input.needs.length > 5)
    throw new Error("SCHEMA_MISMATCH");
  const language = input.language ?? "en";
  if (
    input.needs.some(
      (need) =>
        need.display !== undefined &&
        !matchesLanguageForFields(
          [
            need.display.canonicalNeed,
            need.display.measure,
            need.display.geography,
            need.display.period,
            need.display.breakdown,
            need.display.informationHolder,
            ...need.display.unresolvedClarifications,
          ],
          language,
        ),
    )
  )
    throw new Error("LANGUAGE_MISMATCH");
  const normalizedOriginal = input.originalText.trim().toLocaleLowerCase();
  const seededFixture = SCENARIO_PROMPTS.some(
    (scenario) =>
      scenario.prompt.trim().toLocaleLowerCase() === normalizedOriginal ||
      scenario.hiPrompt.trim().toLocaleLowerCase() === normalizedOriginal,
  )
    ? interpretWithFixture(input.originalText)[0]
    : undefined;
  const explicitDrafting = hasExplicitDraftingIntent(input.originalText);
  const needs: InformationNeed[] = input.needs.map((modelNeed, index) => {
    const normalizedNeed =
      index === 0 && seededFixture ? seededFixture : modelNeed;
    const holder = resolveAuthorityName(normalizedNeed.informationHolder);
    if (
      modelNeed.display &&
      !(
        [
          ["canonicalNeed", normalizedNeed.canonicalNeed],
          ["measure", normalizedNeed.measure],
          ["geography", normalizedNeed.geography],
          ["period", normalizedNeed.period],
          ["breakdown", normalizedNeed.breakdown],
          [
            "informationHolder",
            holder?.name ?? normalizedNeed.informationHolder,
          ],
        ] as Array<[PresentationField, string]>
      ).every(([field, canonical]) =>
        preservesPresentationField({
          field,
          canonical,
          presentation: modelNeed.display![field],
          language,
        }),
      )
    )
      throw new Error("PRESENTATION_MISMATCH");
    return {
      id: `model-need-${index + 1}`,
      originalText: input.originalText,
      canonicalNeed: normalizedNeed.canonicalNeed,
      measure: normalizedNeed.measure,
      geography: normalizedNeed.geography,
      period: normalizedNeed.period,
      breakdown: normalizedNeed.breakdown,
      informationHolder: holder?.name ?? normalizedNeed.informationHolder,
      informationHolderStatus: holder ? "verified" : "unverified",
      resolutionPreference: modelNeed.resolutionPreference,
      unresolvedClarifications: modelNeed.unresolvedClarifications.slice(0, 2),
      scenario:
        index === 0 && seededFixture
          ? seededFixture.scenario
          : scenarioForModelNeed(
              `${modelNeed.canonicalNeed} ${modelNeed.measure}`,
              explicitDrafting,
            ),
      draftingIntent: explicitDrafting,
      ...(modelNeed.display
        ? {
            presentation: {
              language: input.language ?? "en",
              ...modelNeed.display,
            },
          }
        : {}),
    };
  });
  return {
    originalText: input.originalText,
    redactedText: input.redactedText,
    needs,
    clarifications: clarificationsForNeeds(needs).slice(0, 2),
    traceId: input.traceId,
    language: input.language ?? "en",
  };
}

/** Server-only adapter. The deterministic adapter is the offline/default path for the prototype. */
export class OpenAIInterpretationAdapter implements InterpretationAdapter {
  async interpret(input: {
    text: string;
    traceId: string;
    language?: Language;
  }): Promise<NeedInterpretation> {
    const { redacted } = redactSensitiveIdentifiers(input.text);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("PROVIDER_NOT_CONFIGURED");

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          store: false,
          reasoning: OPENAI_REASONING,
          input: [
            {
              role: "system",
              content: `Interpret the citizen's request using only schema-constrained fields. Canonical fields must be stable English/canonical values for deterministic application logic. ${input.language === "hi" ? "All display fields and clarification wording must be natural Hindi." : "All display fields and clarification wording must be natural English."} Do not infer the selected language from the citizen's text. Never provide facts, evidence, figures, or URLs.`,
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
                        display: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            canonicalNeed: { type: "string" },
                            measure: { type: "string" },
                            geography: { type: "string" },
                            period: { type: "string" },
                            breakdown: { type: "string" },
                            informationHolder: { type: "string" },
                            unresolvedClarifications: {
                              type: "array",
                              items: { type: "string" },
                              maxItems: 2,
                            },
                          },
                          required: [
                            "canonicalNeed",
                            "measure",
                            "geography",
                            "period",
                            "breakdown",
                            "informationHolder",
                            "unresolvedClarifications",
                          ],
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
                        "display",
                      ],
                    },
                  },
                },
                required: ["needs"],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });
    } catch (error) {
      if (isProviderTimeout(error)) throw new Error(PROVIDER_TIMEOUT);
      throw error;
    }
    if (!response.ok) {
      const { code } = await providerFailure("interpretation", response);
      throw new Error(code);
    }
    const payload = (await response.json()) as OpenAIResponse;
    const raw =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .map((item) => item.text ?? "")
        .join("");
    if (!raw) throw new Error("SCHEMA_MISMATCH");
    let parsed: { needs?: unknown };
    try {
      parsed = JSON.parse(raw) as { needs?: unknown };
    } catch {
      throw new Error("INVALID_JSON");
    }
    if (
      !Array.isArray(parsed.needs) ||
      parsed.needs.some((need) => !isModelNeed(need))
    )
      throw new Error("SCHEMA_MISMATCH");
    return modelNeedsToInterpretation({
      originalText: input.text,
      redactedText: redacted,
      needs: parsed.needs as ModelNeed[],
      traceId: input.traceId,
      language: input.language,
    });
  }
}
