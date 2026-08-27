import type { NeedInterpretation } from "../domain/types";

export type InterpretationAdapter = {
  interpret(input: {
    text: string;
    traceId: string;
  }): Promise<NeedInterpretation>;
};
