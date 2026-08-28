import { describe, expect, it } from "vitest";
import type { InformationNeed } from "../domain/types";
import { SCENARIO_PROMPTS, interpretWithFixture } from "../content/scenarios";
import {
  createFilingModule,
  createGenericRtiDemoRoute,
  NORTHERN_RAILWAY_HOLDER,
  NORTHERN_RAILWAY_ROUTE,
} from "../filing";
import { isFilingDemoReady } from "./filing-flow";

describe("filing demo readiness", () => {
  it("keeps the canonical Northern Railway draft ready for the filing demo", async () => {
    const filing = createFilingModule();
    const need = interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0];
    const filingPackage = await filing.prepare({
      need,
      holder: NORTHERN_RAILWAY_HOLDER,
      route: NORTHERN_RAILWAY_ROUTE,
    });

    expect(
      isFilingDemoReady({
        need,
        draftText: filingPackage.draft.text,
        filingPackage,
      }),
    ).toBe(true);
  });

  it("does not enable filing for a route-invalid or divergent draft", async () => {
    const filing = createFilingModule();
    const need = interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0];
    const filingPackage = await filing.prepare({
      need,
      holder: NORTHERN_RAILWAY_HOLDER,
      route: NORTHERN_RAILWAY_ROUTE,
    });

    expect(
      isFilingDemoReady({
        need,
        draftText: `${filingPackage.draft.text}\nAlso disclose pension arrears.`,
        filingPackage,
      }),
    ).toBe(false);
    expect(
      isFilingDemoReady({
        need,
        draftText: "Please provide unrelated school records.",
        filingPackage,
      }),
    ).toBe(false);
  });

  it("keeps an interpreted non-directory question editable but outside filing coverage", async () => {
    const filing = createFilingModule();
    const need: InformationNeed = {
      id: "need-city-budget",
      originalText: "Show me the municipal park maintenance budget.",
      canonicalNeed:
        "records of the municipal park maintenance budget for financial year 2025-26",
      measure: "Maintenance budget",
      geography: "Municipal parks",
      period: "Financial year 2025-26",
      breakdown: "Year",
      informationHolder: "City Municipal Corporation",
      informationHolderStatus: "unverified",
      resolutionPreference: "formal",
      unresolvedClarifications: [],
      scenario: "unsupported",
    };
    const { holder, route } = createGenericRtiDemoRoute(need);
    const filingPackage = await filing.prepare({ need, holder, route });

    expect(route.officialUrl).toBeUndefined();
    expect(
      isFilingDemoReady({
        need,
        draftText: filingPackage.draft.text,
        filingPackage,
      }),
    ).toBe(false);
  });
});
