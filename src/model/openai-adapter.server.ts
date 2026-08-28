import type {
  AnalysisIntent,
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
  ncrbAnalysisIntent,
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
  analysisIntent?: AnalysisIntent;
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

function isAnalysisIntent(value: unknown): value is AnalysisIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intent = value as Record<string, unknown>;
  return (
    (intent.logic === "and" || intent.logic === "or") &&
    Array.isArray(intent.predicates) &&
    intent.predicates.length > 0 &&
    intent.predicates.every((predicate) => {
      if (
        !predicate ||
        typeof predicate !== "object" ||
        Array.isArray(predicate)
      )
        return false;
      const item = predicate as Record<string, unknown>;
      return (
        typeof item.measure === "string" &&
        (item.comparison === "increase" || item.comparison === "decrease") &&
        typeof item.fromPeriod === "string" &&
        typeof item.toPeriod === "string"
      );
    }) &&
    (intent.ranking === undefined ||
      (typeof intent.ranking === "object" &&
        intent.ranking !== null &&
        !Array.isArray(intent.ranking) &&
        typeof (intent.ranking as Record<string, unknown>).measure ===
          "string" &&
        ((intent.ranking as Record<string, unknown>).direction === "asc" ||
          (intent.ranking as Record<string, unknown>).direction === "desc") &&
        Number.isInteger((intent.ranking as Record<string, unknown>).limit) &&
        Number((intent.ranking as Record<string, unknown>).limit) > 0))
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
    (need.analysisIntent === undefined ||
      isAnalysisIntent(need.analysisIntent)) &&
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
      ...(normalizedNeed.analysisIntent
        ? { analysisIntent: normalizedNeed.analysisIntent }
        : index === 0
          ? (() => {
              const intent = ncrbAnalysisIntent(input.originalText);
              return intent ? { analysisIntent: intent } : {};
            })()
          : {}),
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
              content: `Interpret the citizen's request using only schema-constrained fields. Canonical fields must be stable English/canonical values for deterministic application logic. ${input.language === "hi" ? "All display fields and clarification wording must be natural Hindi. Every natural-language display field must contain at least three Devanagari characters; for numeric period fields, include a Hindi word such as वर्ष or के बीच. Keep display.informationHolder as the exact registered Roman authority name or alias (for example, NCRB, EPFO, or Northern Railway); do not translate it or add parenthetical text." : "All display fields and clarification wording must be natural English."} Do not infer the selected language from the citizen's text. Never provide facts, evidence, figures, or URLs. Every display field is checked against its corresponding canonical field: preserve every number from that canonical field exactly in the same display field; do not drop or invent numeric information. In particular, if the citizen's request contains years, repeat those years in both display.canonicalNeed and display.period when the canonical fields contain them. For tabular comparisons, populate analysisIntent with each requested measure, comparison direction, and the two requested periods; preserve AND versus OR and include ranking only when requested. Do not add a predicate merely because another measure exists in the table. For the seeded NCRB example, display.canonicalNeed and display.period must both contain 2021 and 2023. For the seeded Railway example, keep FY 2024–25 in display.period and do not add those numbers to display.canonicalNeed because the canonical field has no period numbers. For a request about stolen and recovered property across States/UTs, use National Crime Records Bureau as the information holder. For a request about lift or escalator maintenance at New Delhi Railway Station, use Northern Railway as the information holder. For an EPF claim, use Employees' Provident Fund Organisation. When an information holder is known, repeat that registered authority in display.informationHolder or use its registered abbreviation; do not use “Unspecified”.`,
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
                        analysisIntent: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            logic: { type: "string", enum: ["and", "or"] },
                            predicates: {
                              type: "array",
                              minItems: 1,
                              items: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                  measure: { type: "string" },
                                  comparison: {
                                    type: "string",
                                    enum: ["increase", "decrease"],
                                  },
                                  fromPeriod: { type: "string" },
                                  toPeriod: { type: "string" },
                                },
                                required: [
                                  "measure",
                                  "comparison",
                                  "fromPeriod",
                                  "toPeriod",
                                ],
                              },
                            },
                            ranking: {
                              type: "object",
                              additionalProperties: false,
                              properties: {
                                measure: { type: "string" },
                                direction: {
                                  type: "string",
                                  enum: ["asc", "desc"],
                                },
                                limit: { type: "integer", minimum: 1 },
                              },
                              required: ["measure", "direction", "limit"],
                            },
                          },
                          required: ["logic", "predicates"],
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
