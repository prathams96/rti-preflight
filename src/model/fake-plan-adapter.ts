import type { PlanAdapter } from "./plan-adapter";
import { planForAnalysis } from "./plan-adapter";

/** Offline planner used by tests and by the no-key prototype path. */
export class DeterministicPlanAdapter implements PlanAdapter {
  async plan(input: Parameters<PlanAdapter["plan"]>[0]) {
    return planForAnalysis(input.need, input.table);
  }
}
