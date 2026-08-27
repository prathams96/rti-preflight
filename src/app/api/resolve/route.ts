import { NextResponse } from "next/server";
import { snapshot, validateSnapshot } from "../../../evidence/snapshot";
import { RTIPreflightModule } from "../../../preflight/module";

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
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        code: "RESOLUTION_UNAVAILABLE",
        message: "We couldn’t check the prototype snapshot just now.",
      },
      { status: 503 },
    );
  }
}
