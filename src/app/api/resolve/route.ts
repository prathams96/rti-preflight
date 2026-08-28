import { NextResponse } from "next/server";
import { snapshot, validateSnapshot } from "../../../evidence/snapshot";
import { RTIPreflightModule } from "../../../preflight/module";
import { normalizeTraceId } from "../../../observability";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      need?: Parameters<RTIPreflightModule["resolve"]>[0]["need"];
    };
    if (!body.need || typeof body.need !== "object")
      return NextResponse.json({ code: "INVALID_NEED" }, { status: 400 });
    validateSnapshot();
    const result = await new RTIPreflightModule().resolve({
      need: body.need,
      snapshot,
      traceId: normalizeTraceId(request.headers.get("x-rti-trace-id")),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_NEED") {
      return NextResponse.json(
        {
          code: "INVALID_NEED",
          message: "Confirm the Information Need before searching.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        code: "RESOLUTION_UNAVAILABLE",
        message: "We couldn’t check the prototype snapshot just now.",
      },
      { status: 503 },
    );
  }
}
