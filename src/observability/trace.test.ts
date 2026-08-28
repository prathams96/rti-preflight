import { describe, expect, it } from "vitest";
import {
  createTraceEvent,
  generateTraceId,
  normalizeTraceId,
  sanitizeTraceEvent,
} from "./trace";
import type { TraceEvent } from "./trace";

describe("privacy-safe trace contract", () => {
  it("normalizes caller IDs and generates opaque IDs without citizen input", () => {
    expect(normalizeTraceId(" TR-0123456789ABCDEF ")).toBe(
      "tr-0123456789abcdef",
    );
    expect(generateTraceId()).toMatch(/^tr-[a-f0-9]{16}$/);
    expect(generateTraceId()).not.toBe(generateTraceId());
    expect(normalizeTraceId(undefined)).toMatch(/^tr-[a-f0-9]{16}$/);
  });

  it("strips raw payloads and identifier-like fields", () => {
    const traceId = generateTraceId();
    const event = sanitizeTraceEvent({
      eventName: "interpretation.completed",
      traceId,
      component: "preflight",
      version: "1.0.0",
      hash: "snapshot-hash",
      status: "ok",
      counts: { needs: 2 },
      prompt: "My Aadhaar number is 1234",
      evidence: { extract: "private evidence" },
      modelResponse: "raw response",
      filingProfile: { email: "citizen@example.com" },
      secret: "do-not-log",
      identifier: "citizen@example.com",
      registrationNumber: "REG-123",
      statusWithIdentifier: "phone +91 9876543210",
    });

    expect(event).toEqual({
      eventName: "interpretation.completed",
      traceId,
      component: "preflight",
      version: "1.0.0",
      hash: "snapshot-hash",
      status: "ok",
      counts: { needs: 2 },
    });
    expect(JSON.stringify(event)).not.toMatch(
      /Aadhaar|private evidence|raw response|citizen@example|do-not-log|REG-123|9876543210/i,
    );
    const redactedSafeField = sanitizeTraceEvent({
      eventName: "resolution.completed",
      traceId: generateTraceId(),
      status: "phone +91 9876543210",
    });
    expect(redactedSafeField?.status).toBe("phone [REDACTED]");
  });

  it("models interpretation, resolution, and filing acknowledgement events", () => {
    const events: TraceEvent[] = [
      createTraceEvent("interpretation.started", "tr-0123456789abcdef"),
      createTraceEvent("resolution.completed", "tr-0123456789abcdef", {
        status: "resolved",
        counts: { evidence: 1 },
      }),
      createTraceEvent("filing.acknowledged", "tr-0123456789abcdef", {
        code: "demo-accepted",
      }),
    ];

    expect(events.map((event) => event.eventName)).toEqual([
      "interpretation.started",
      "resolution.completed",
      "filing.acknowledged",
    ]);
    expect(() => JSON.stringify(events)).not.toThrow();
  });

  it("accepts evidence and route lifecycle events on the same opaque trace", () => {
    const traceId = generateTraceId();
    const events = [
      createTraceEvent("evidence.rejected", traceId, {
        component: "grounding-gate",
        version: "grounding-gate-v1",
        status: "downgraded",
        code: "citizen-challenge",
      }),
      createTraceEvent("route.validated", traceId, {
        component: "filing-route",
        version: "route-profile-v1",
        status: "working",
        code: "northern-railway-route",
      }),
    ];

    expect(events.every((event) => event.traceId === traceId)).toBe(true);
    expect(events.map((event) => event.eventName)).toEqual([
      "evidence.rejected",
      "route.validated",
    ]);
  });

  it("rejects unknown lifecycle events", () => {
    expect(
      sanitizeTraceEvent({ eventName: "prompt.received", traceId: "x" }),
    ).toBe(undefined);
  });
});
