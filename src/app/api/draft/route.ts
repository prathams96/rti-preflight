import { NextResponse } from "next/server";
import type { Language } from "../../../domain/types";
import { matchesLanguage } from "../../../model/language";
import {
  createFilingModule,
  createGenericRtiDemoRoute,
  isNorthernRailwayGuidedNeed,
  NORTHERN_RAILWAY_HOLDER,
  NORTHERN_RAILWAY_ROUTE,
  validateDraft,
  validateFilingPackage,
} from "../../../filing";
import { detectDraftDivergence } from "../../../filing/validation";
import { normaliseNeedPhrase } from "../../../filing/phrase";
import { localizeFilingDraft } from "../../../ui/localization";
import { redactSensitiveIdentifiers } from "../../../model/redaction";
import {
  OPENAI_MODEL,
  OPENAI_REASONING,
  OPENAI_TIMEOUT_MS,
  isProviderTimeout,
  providerFailure,
  PROVIDER_TIMEOUT,
} from "../../../model/openai-config.server";
import type {
  ConfirmedFilingNeed,
  ValidatedFilingPackage,
} from "../../../filing/types";

export const runtime = "nodejs";

type ResponsePayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

function outputText(payload: ResponsePayload): string {
  return (
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? "")
      .join("") ??
    ""
  );
}

function genericFallback(
  need: ConfirmedFilingNeed,
  language: Language,
): string {
  const phrase = normaliseNeedPhrase(
    (need.presentation?.language === language
      ? need.presentation.canonicalNeed
      : need.canonicalNeed) ??
      need.originalText ??
      "the confirmed information need",
  );
  return language === "hi"
    ? `कृपया पुष्ट की गई सूचना-ज़रूरत “${phrase}” के दायरे में उपलब्ध अभिलेखों की प्रतियां उपलब्ध कराएं। अभिलेख इलेक्ट्रॉनिक रूप में उपलब्ध कराएं।`
    : `Please provide copies of records held within the scope of the confirmed Information Need: ${phrase}. Please provide the records in electronic form.`;
}

function providerNeed(need: ConfirmedFilingNeed) {
  const redact = (value: string | undefined) =>
    redactSensitiveIdentifiers(value ?? "").redacted;
  return {
    canonicalNeed: redact(need.canonicalNeed),
    measure: redact(need.measure),
    geography: redact(need.geography),
    period: redact(need.period),
    breakdown: redact(need.breakdown),
    informationHolder: redact(need.informationHolder),
    resolutionPreference: need.resolutionPreference ?? "unsure",
    unresolvedClarifications: (need.unresolvedClarifications ?? []).map(redact),
  };
}

function hasNorthernRailwayScopeAnchors(text: string): boolean {
  const normalized = text.normalize("NFKC").toLocaleLowerCase();
  const recordConcepts = [
    /expenditure|व्यय|खर्च/u,
    /ledger|लेजर/u,
    /work orders?|कार्यादेश/u,
    /contracts?|अनुबंध/u,
    /contractors?|ठेकेदार/u,
  ].filter((pattern) => pattern.test(normalized)).length;
  return (
    /lifts?|लिफ्ट/u.test(normalized) &&
    /escalators?|एस्केलेटर/u.test(normalized) &&
    /new delhi railway station|नई दिल्ली रेलवे स्टेशन/u.test(normalized) &&
    /maintenance|रखरखाव/u.test(normalized) &&
    /2024/u.test(normalized) &&
    /25/u.test(normalized) &&
    recordConcepts >= 2
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      need?: ConfirmedFilingNeed;
      language?: unknown;
      route?: unknown;
      maxChars?: unknown;
    };
    if (
      !body.need ||
      typeof body.need !== "object" ||
      typeof body.need.id !== "string" ||
      typeof body.need.canonicalNeed !== "string" ||
      !body.need.canonicalNeed.trim()
    )
      return NextResponse.json({ code: "INVALID_NEED" }, { status: 400 });
    if (
      body.language !== undefined &&
      body.language !== "en" &&
      body.language !== "hi"
    )
      return NextResponse.json({ code: "INVALID_LANGUAGE" }, { status: 400 });

    const language: Language = body.language === "hi" ? "hi" : "en";
    const suppliedRoute =
      body.route && typeof body.route === "object"
        ? (body.route as Record<string, unknown>)
        : undefined;
    const verifiedRouteCoverage =
      isNorthernRailwayGuidedNeed(body.need) &&
      (suppliedRoute === undefined ||
        suppliedRoute.id === NORTHERN_RAILWAY_ROUTE.id);
    const selected = verifiedRouteCoverage
      ? { holder: NORTHERN_RAILWAY_HOLDER, route: NORTHERN_RAILWAY_ROUTE }
      : createGenericRtiDemoRoute(body.need);
    const routeLimit = verifiedRouteCoverage
      ? NORTHERN_RAILWAY_ROUTE.profile.text.maxChars
      : 3_000;
    // Portal constraints are registry-owned; caller input cannot narrow or expand them.
    const maxChars = routeLimit;
    const profile = verifiedRouteCoverage
      ? {
          ...NORTHERN_RAILWAY_ROUTE.profile,
          text: { ...NORTHERN_RAILWAY_ROUTE.profile.text, maxChars },
        }
      : {
          ...selected.route.profile,
          text: { ...selected.route.profile.text, maxChars },
        };
    const prepared = await createFilingModule().prepare({
      need: body.need,
      holder: selected.holder,
      route: { ...selected.route, profile },
    });
    const fallbackText = verifiedRouteCoverage
      ? localizeFilingDraft(prepared.draft.text, language)
      : genericFallback(body.need, language);
    const fallbackValidation = validateDraft(fallbackText, profile);
    const fallbackPackage = {
      ...prepared,
      draft: { ...prepared.draft, text: fallbackText },
      validation: fallbackValidation,
    };

    const fallbackResponse = (degradationCode: string) =>
      NextResponse.json({
        draft: { text: fallbackText },
        filingPackage: fallbackPackage,
        guidedCoverage: true,
        validation: fallbackValidation,
        generation: "deterministic" as const,
        degraded: true,
        degradationCode,
      });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return fallbackResponse("PROVIDER_NOT_CONFIGURED");

    try {
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
                content: `Draft an RTI request, not an answer. ${language === "hi" ? "The draft must be natural Hindi." : "The draft must be natural English."} Ask for records. Do not invent facts, statutory promises, deadlines, record availability, a public authority, or a new Information Need. Do not state that records exist or are unavailable. Respect the supplied scope and the maximum character count. Return draft text only through the schema field.`,
              },
              {
                role: "user",
                content: JSON.stringify({
                  confirmedCanonicalNeed: providerNeed(body.need),
                  verifiedRoute: verifiedRouteCoverage
                    ? {
                        authority:
                          NORTHERN_RAILWAY_ROUTE.authority.canonicalName,
                        routeId: NORTHERN_RAILWAY_ROUTE.id,
                        maxChars,
                        newlinesPermitted:
                          NORTHERN_RAILWAY_ROUTE.profile.text.newlinesPermitted,
                      }
                    : null,
                  maxChars,
                }),
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "filing_draft",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: { text: { type: "string" } },
                  required: ["text"],
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
        const { code } = await providerFailure("draft", response);
        throw new Error(code);
      }
      const raw = outputText((await response.json()) as ResponsePayload);
      if (!raw) throw new Error("DRAFT_SCHEMA_MISMATCH");
      const parsed = JSON.parse(raw) as { text?: unknown };
      if (typeof parsed.text !== "string" || !parsed.text.trim())
        throw new Error("DRAFT_SCHEMA_MISMATCH");
      if (!matchesLanguage(parsed.text, language))
        throw new Error("LANGUAGE_MISMATCH");
      const validation = validateDraft(parsed.text, profile);
      const divergence = detectDraftDivergence(body.need, parsed.text);
      if (
        !validation.valid ||
        divergence.diverged ||
        (verifiedRouteCoverage && !hasNorthernRailwayScopeAnchors(parsed.text))
      )
        throw new Error("DRAFT_VALIDATION_FAILED");

      const filingPackage: ValidatedFilingPackage = {
        ...prepared,
        draft: { ...prepared.draft, text: parsed.text },
        validation,
      };
      if (!validateFilingPackage(filingPackage).valid)
        throw new Error("ROUTE_VALIDATION_FAILED");
      return NextResponse.json({
        draft: { text: parsed.text },
        filingPackage,
        guidedCoverage: true,
        validation,
        generation: "openai" as const,
        degraded: false,
      });
    } catch (error) {
      return fallbackResponse(
        error instanceof Error ? error.message : "DRAFT_PROVIDER_FAILED",
      );
    }
  } catch {
    return NextResponse.json(
      {
        code: "DRAFT_UNAVAILABLE",
        message: "We couldn’t prepare a filing draft just now.",
      },
      { status: 503 },
    );
  }
}
