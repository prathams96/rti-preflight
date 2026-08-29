import { describe, expect, it } from "vitest";
import { SCENARIO_PROMPTS, interpretWithFixture } from "../content/scenarios";
import { isFilingDemoReady } from "../ui/filing-flow";
import {
  DEMO_OTP,
  NORTHERN_RAILWAY_HOLDER,
  NORTHERN_RAILWAY_ROUTE,
  createFilingModule,
  createGenericRtiDemoRoute,
} from "./index";

const FULL_FLOW_CASES: Array<[string, string]> = [
  ...SCENARIO_PROMPTS.map(({ id, prompt }) => [id, prompt] as [string, string]),
  ["arbitrary", "What are the number of MSMEs shut in 2026 from 2025"],
  ["outside-snapshot", "Which public records exist for a new subject?"],
  ["relevant-authority", "Which public records are available?"],
];

describe("complete mock filing journey", () => {
  it.each(FULL_FLOW_CASES)(
    "supports the full flow for %s",
    async (_label, text) => {
      const preflightNeed = interpretWithFixture(text)[0];
      const filing = createFilingModule();
      const selected =
        preflightNeed.scenario === "railway-filing"
          ? { holder: NORTHERN_RAILWAY_HOLDER, route: NORTHERN_RAILWAY_ROUTE }
          : createGenericRtiDemoRoute(preflightNeed);
      const filingPackage = await filing.prepare({
        need: preflightNeed,
        holder: selected.holder,
        route: selected.route,
      });

      expect(filingPackage.valid).toBe(true);
      expect(
        isFilingDemoReady({
          need: preflightNeed,
          draftText: filingPackage.draft.text,
          filingPackage,
        }),
      ).toBe(true);

      const acknowledgement = await filing.demoSubmit({
        package: filingPackage,
        confirmation: {
          otp: DEMO_OTP,
          profile: filing.demoProfile,
          reviewed: true,
          payment: { method: "demo_upi", amountInr: 10 },
        },
      });

      expect(acknowledgement.registrationNumber).toMatch(/^DEMO-/);
      expect(acknowledgement.submittedDraft).toBe(filingPackage.draft.text);
      expect(acknowledgement.fee).toEqual({
        method: "demo_upi",
        amountInr: 10,
      });
      expect(acknowledgement.disclosure).toMatch(
        /No request, payment, or personal information was sent to a government system/,
      );
      expect(acknowledgement.route).toBe(
        preflightNeed.scenario === "railway-filing"
          ? NORTHERN_RAILWAY_ROUTE.officialUrl
          : "Generic RTI demo route (not verified)",
      );
    },
  );

  it("keeps the generic fallback authority neutral", () => {
    const need = interpretWithFixture("Which public records are available?")[0];
    const { holder, route } = createGenericRtiDemoRoute(need);
    expect(holder.canonicalName).toBe("Relevant public authority");
    expect(route.authority.canonicalName).toBe("Relevant public authority");
    expect(route.officialUrl).toBeUndefined();
    expect(route.profile.sourceUrl).toBe("https://example.invalid/rti-demo");
  });
});
