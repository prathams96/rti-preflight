import {
  clarificationsForNeeds,
  interpretWithFixture,
} from "../content/scenarios";
import type { Language, NeedInterpretation } from "../domain/types";
import type { InterpretationAdapter } from "./adapter";
import { redactSensitiveIdentifiers } from "./redaction";

export class DeterministicInterpretationAdapter implements InterpretationAdapter {
  async interpret(input: {
    text: string;
    traceId: string;
    language?: Language;
  }): Promise<NeedInterpretation> {
    const { redacted } = redactSensitiveIdentifiers(input.text);
    const needs = interpretWithFixture(redacted);
    return {
      originalText: input.text,
      redactedText: redacted,
      needs,
      clarifications: clarificationsForNeeds(needs).slice(0, 2),
      traceId: input.traceId,
      language: input.language ?? "en",
    };
  }
}
