import { NextResponse } from "next/server";
import { RTIPreflightModule } from "../../../preflight/module";
import { DeterministicInterpretationAdapter } from "../../../model/fake-adapter";
import { OpenAIInterpretationAdapter } from "../../../model/openai-adapter.server";
import { normalizeTraceId } from "../../../observability";
import { isExactNcrbSeededPrompt } from "../../../content/scenarios";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: unknown;
      language?: unknown;
    };
    if (
      typeof body.text !== "string" ||
      body.text.trim().length === 0 ||
      body.text.length > 8_000
    ) {
      return NextResponse.json(
        {
          code: "INVALID_INPUT",
          message: "Enter the information you are looking for to continue.",
        },
        { status: 400 },
      );
    }
    if (
      body.language !== undefined &&
      body.language !== "en" &&
      body.language !== "hi"
    )
      return NextResponse.json(
        { code: "INVALID_LANGUAGE", message: "Language must be en or hi." },
        { status: 400 },
      );
    const language = body.language === "hi" ? "hi" : "en";
    const traceId = normalizeTraceId(request.headers.get("x-rti-trace-id"));
    const deterministic = new DeterministicInterpretationAdapter();
    let interpretation;
    if (process.env.OPENAI_API_KEY) {
      try {
        interpretation = await new RTIPreflightModule(
          new OpenAIInterpretationAdapter(),
        ).interpret({ text: body.text, traceId, language });
      } catch {
        // The deterministic parser is reserved for the explicit seeded demo
        // fixture. Arbitrary production free text must not be reparsed after
        // model failure because guessed semantics are unsafe.
        if (!isExactNcrbSeededPrompt(body.text))
          return NextResponse.json(
            {
              code: "INTERPRETATION_UNAVAILABLE",
              message:
                "We couldn’t interpret your request just now. Nothing was submitted.",
            },
            { status: 503 },
          );
        interpretation = await new RTIPreflightModule(deterministic).interpret({
          text: body.text,
          language,
          traceId,
        });
      }
    } else {
      interpretation = await new RTIPreflightModule(deterministic).interpret({
        text: body.text,
        language,
        traceId,
      });
    }
    return NextResponse.json(interpretation);
  } catch {
    return NextResponse.json(
      {
        code: "INTERPRETATION_UNAVAILABLE",
        message:
          "We couldn’t interpret your request just now. Nothing was submitted.",
      },
      { status: 503 },
    );
  }
}
