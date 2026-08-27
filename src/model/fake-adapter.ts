import { createHash } from "node:crypto";
import {
  clarificationsForNeeds,
  interpretWithFixture,
} from "../content/scenarios";
import type { NeedInterpretation } from "../domain/types";
import type { InterpretationAdapter } from "./adapter";
import { redactSensitiveIdentifiers } from "./redaction";

export class DeterministicInterpretationAdapter implements InterpretationAdapter {
  async interpret(input: {
    text: string;
    traceId: string;
  }): Promise<NeedInterpretation> {
    const { redacted } = redactSensitiveIdentifiers(input.text);
    const needs = interpretWithFixture(redacted);
    return {
      originalText: input.text,
      redactedText: redacted,
      needs,
      clarifications: clarificationsForNeeds(needs).slice(0, 2),
      traceId: input.traceId,
    };
  }
}

export function traceIdFor(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
