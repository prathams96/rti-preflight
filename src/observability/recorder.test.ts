import { describe, expect, it } from "vitest";
import { createTraceRecorder, generateTraceId } from "./index";

describe("local trace recorder", () => {
  it("keeps one safe lifecycle stream and returns detached event lists", () => {
    const recorder = createTraceRecorder();
    const traceId = generateTraceId();
    recorder.record("interpretation.started", traceId, {
      component: "interpretation-route",
    });
    recorder.record("resolution.completed", traceId, {
      status: "ok",
      counts: { evidence: 1 },
    });

    const first = recorder.events();
    expect(first).toHaveLength(2);
    expect(first[0].traceId).toBe(traceId);
    expect(() => JSON.stringify(first)).not.toThrow();
    expect(recorder.events()).not.toBe(first);

    recorder.clear();
    expect(recorder.events()).toEqual([]);
  });
});
