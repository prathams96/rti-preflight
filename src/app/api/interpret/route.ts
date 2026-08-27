import { NextResponse } from "next/server";
import { RTIPreflightModule } from "../../../preflight/module";
import {
  DeterministicInterpretationAdapter,
  traceIdFor,
} from "../../../model/fake-adapter";
import { OpenAIInterpretationAdapter } from "../../../model/openai-adapter.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: unknown };
    if (
      typeof body.text !== "string" ||
      body.text.trim().length === 0 ||
      body.text.length > 8_000
    ) {
      return NextResponse.json(
        {
          code: "INVALID_INPUT",
          message: "Enter an information need to continue.",
        },
        { status: 400 },
      );
    }
    const traceId = traceIdFor(body.text);
    const adapter = process.env.OPENAI_API_KEY
      ? new OpenAIInterpretationAdapter()
      : new DeterministicInterpretationAdapter();
    const interpretation = await new RTIPreflightModule(adapter).interpret({
      text: body.text,
      traceId,
    });
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
