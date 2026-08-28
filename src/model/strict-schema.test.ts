import { describe, expect, it } from "vitest";
import { INFORMATION_NEED_SCHEMA } from "./openai-adapter.server";
import { CALC_PLAN_SCHEMA } from "./openai-plan-adapter.server";
import { assertStrictSchemaObject } from "./strict-schema";

describe("OpenAI strict structured-output schemas", () => {
  it("lists every interpretation schema property as required recursively", () => {
    expect(() =>
      assertStrictSchemaObject(INFORMATION_NEED_SCHEMA),
    ).not.toThrow();
  });

  it("lists every CalcPlan schema property as required recursively", () => {
    expect(() => assertStrictSchemaObject(CALC_PLAN_SCHEMA)).not.toThrow();
  });
});
