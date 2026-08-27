import type {
  InformationNeed,
  NeedInterpretation,
  RenderableResolution,
} from "../domain/types";
import type { Snapshot } from "../evidence/snapshot";

export interface PreflightModule {
  interpret(input: {
    text: string;
    traceId: string;
  }): Promise<NeedInterpretation>;
  resolve(input: {
    need: InformationNeed;
    snapshot: Snapshot;
  }): Promise<RenderableResolution>;
}
