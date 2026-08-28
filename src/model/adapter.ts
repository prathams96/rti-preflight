import type { Language, NeedInterpretation } from "../domain/types";

export type InterpretationAdapter = {
  interpret(input: {
    text: string;
    traceId: string;
    language?: Language;
  }): Promise<NeedInterpretation>;
};
