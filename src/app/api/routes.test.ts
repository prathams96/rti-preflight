import { describe, expect, it } from "vitest";
import { POST as interpret } from "./interpret/route";
import { POST as resolve } from "./resolve/route";
import { DemoAdapter } from "../../filing/adapter";
import type { CitizenConfirmed } from "../../filing/types";

describe("release boundary routes", () => {
  it("rejects empty and oversized interpretation bodies before any provider call", async () => {
    const empty = await interpret(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        body: JSON.stringify({ text: " " }),
      }),
    );
    const oversized = await interpret(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        body: JSON.stringify({ text: "x".repeat(8_001) }),
      }),
    );
    expect(empty.status).toBe(400);
    expect(oversized.status).toBe(400);
  });

  it("requires a confirmed need at the resolution boundary", async () => {
    const response = await resolve(
      new Request("http://localhost/api/resolve", {
        method: "POST",
        body: JSON.stringify({ need: null }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_NEED" });
  });

  it("carries a valid opaque trace ID across the API boundary", async () => {
    const traceId = "tr-0123456789abcdef";
    const response = await interpret(
      new Request("http://localhost/api/interpret", {
        method: "POST",
        headers: { "x-rti-trace-id": traceId },
        body: JSON.stringify({
          text: "Which States reported property stolen up and recovery down?",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).traceId).toBe(traceId);
  });

  it("keeps Demo Adapter submission offline", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("network denied by release test");
    }) as typeof fetch;
    try {
      const input = {
        package: {
          valid: true,
          draft: {
            text: "records",
            needId: "need-1",
            holderId: "holder-1",
            routeId: "route-1",
          },
          confirmedNeed: { id: "need-1" },
          holder: { id: "holder-1", canonicalName: "Test authority" },
          route: {
            id: "route-1",
            authority: {
              id: "holder-1",
              canonicalName: "Test authority",
              portalNames: { "route-1": "Demo route" },
              jurisdiction: "central" as const,
              aliases: [],
              lastVerified: "2026-08-27",
              verifiedBy: "test",
            },
            profile: {
              id: "route-profile",
              version: "1",
              verifiedAt: "2026-08-27",
              text: { maxChars: 3000, overflowStrategy: "reject" as const },
              identity: { fieldsRequired: [], fieldsProhibited: [] },
              sourceUrl: "https://example.invalid/route",
              submission: "demo" as const,
            },
            officialUrl: "https://example.invalid/route",
            guidedCoverage: true,
          },
          validation: {
            valid: true,
            text: "records",
            characterCount: 7,
            errors: [],
          },
        },
        confirmation: {
          otp: "123456",
          profile: {
            fullName: "DEMO CITIZEN",
            email: "demo@example.invalid",
            address: "Fictional address",
            state: "Delhi",
            pinCode: "110000",
          },
          reviewed: true,
          payment: { method: "demo_upi" as const, amountInr: 10 },
        },
      } satisfies CitizenConfirmed;
      const acknowledgement = await new DemoAdapter().submit(input);
      expect(acknowledgement.disclosure).toContain("No request");
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
