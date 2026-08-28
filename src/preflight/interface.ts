import type {
  InformationNeed,
  NeedInterpretation,
  RenderableResolution,
  Language,
} from "../domain/types";
import type { Snapshot } from "../evidence/snapshot";

export interface PreflightModule {
  interpret(input: {
    text: string;
    traceId: string;
    language?: Language;
  }): Promise<NeedInterpretation>;
  resolve(input: {
    need: InformationNeed;
    snapshot: Snapshot;
    traceId?: string;
    language?: Language;
  }): Promise<RenderableResolution>;
}
