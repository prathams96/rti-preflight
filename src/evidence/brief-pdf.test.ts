import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { RTIPreflightModule } from "../preflight/module";
import { snapshot } from "./snapshot";
import { buildEvidenceBrief, type EvidenceBriefInput } from "./brief";
import {
  evidenceBriefPdfFilename,
  serializeEvidenceBriefPdf,
} from "./brief-pdf";
import { localizeNeed, localizeResolution } from "../ui/localization";

const SEARCH_DATE = "2026-08-27";

async function resolve(text: string) {
  const preflight = new RTIPreflightModule();
  const need = (await preflight.interpret({ text, traceId: "trace-pdf" }))
    .needs[0];
  return { need, result: await preflight.resolve({ need, snapshot }) };
}

async function pdfText(input: EvidenceBriefInput): Promise<string> {
  return new TextDecoder().decode(await serializeEvidenceBriefPdf(input));
}

beforeEach(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const weight = url.includes("700") ? "700" : "400";
    const filename = `noto-sans-combined-${weight}.ttf`;
    return new Response(readFileSync(`public/fonts/${filename}`), {
      status: 200,
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Evidence Brief PDF export", () => {
  it("renders the derived golden result as an A4 branded PDF with source links", async () => {
    const { need, result } = await resolve(
      "Between 2021 and 2023 which States reported property stolen up and recovery down?",
    );
    const input = { need, result, searchDate: SEARCH_DATE };
    const pdf = await serializeEvidenceBriefPdf(input);
    const text = new TextDecoder().decode(pdf);

    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("595 842");
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/ToUnicode");
    expect(text).toContain(
      "https://www.data.gov.in/resource/stateut-wise-value",
    );
    expect(text).toContain("/Subtype /Link");
    expect(text).not.toMatch(/trace-pdf|traceId|rawModel|filingProfile/);
    expect(evidenceBriefPdfFilename(SEARCH_DATE)).toBe(
      "rti-tathya-evidence-brief-2026-08-27.pdf",
    );
  });

  it("keeps a partial golden result readable without inventing evidence", async () => {
    const resolved = await resolve(
      "How much was spent on lifts at New Delhi Railway Station?",
    );
    const result = structuredClone(resolved.result);
    result.outcome = "PARTIALLY_RESOLVED";
    result.headline = "Some requested records remain unresolved.";
    result.evidence = [];
    result.gaps = ["The requested period is not represented."];
    const brief = buildEvidenceBrief({
      need: resolved.need,
      result,
      searchDate: SEARCH_DATE,
    });
    const text = await pdfText({
      need: resolved.need,
      result,
      searchDate: SEARCH_DATE,
    });

    expect(brief.result.outcome).toBe("PARTIALLY_RESOLVED");
    expect(brief.result.headline).toBe(
      "Some requested records remain unresolved.",
    );
    expect(brief.result.gaps).toEqual([
      "The requested period is not represented.",
    ]);
    expect(brief.result.evidence).toEqual([]);
    expect(text).toContain("/Subtype /Type0");
    expect(text).toContain("/ToUnicode");
  });

  it("distinguishes the outside-coverage golden result from an in-snapshot no-finding", async () => {
    const { need, result } = await resolve(
      "What is the budget for a local park?",
    );
    const brief = buildEvidenceBrief({ need, result, searchDate: SEARCH_DATE });
    const text = await pdfText({ need, result, searchDate: SEARCH_DATE });

    expect(brief.result.outcome).toBe("OUTSIDE_SNAPSHOT_COVERAGE");
    expect(brief.result.coverageManifest).toBeDefined();
    expect(brief.result.evidence).toEqual([]);
    expect(brief.result.calculation).toBeUndefined();
    expect(text).toContain("/Subtype /Type0");
    expect(text).toContain("/ToUnicode");
  });

  it("labels the synthetic golden result and does not add a filing profile", async () => {
    const { need, result } = await resolve(
      "Find an earlier RTI response relevant to a selected Central information need.",
    );
    const brief = buildEvidenceBrief({ need, result, searchDate: SEARCH_DATE });
    const text = await pdfText({ need, result, searchDate: SEARCH_DATE });

    expect(brief.result.evidence[0].sourceType).toBe("rti_response_fixture");
    expect(brief.result.evidence[0].syntheticDisclosure).toMatch(
      /fictional|not an official|not a real RTI response/i,
    );
    expect(JSON.stringify(brief)).not.toMatch(
      /123456|fictional applicant|Demo OTP|UPI|filing profile/i,
    );
    expect(text).toContain("/Subtype /Type0");
    expect(text).toContain("/ToUnicode");
  });

  it("keeps localized Hindi content readable in the exported PDF", async () => {
    const { need, result } = await resolve(
      "Between 2021 and 2023 which States reported property stolen up and recovery down?",
    );
    const localized = {
      need: localizeNeed(need, "hi"),
      result: localizeResolution(result, "hi"),
      searchDate: SEARCH_DATE,
      language: "hi" as const,
    };
    const text = await pdfText(localized);
    const brief = buildEvidenceBrief(localized);

    expect(brief.confirmedInformationNeed.canonicalNeed).toContain(
      "राज्यों/केंद्र शासित प्रदेशों",
    );
    expect(brief.result.headline).toBe(
      "हमें आधिकारिक सरकारी डेटा से एक उत्तर मिला",
    );
    expect(text).toContain("/Subtype /Type0");
    expect(text).toContain("/FontFile2");
    expect(text).toContain("/ToUnicode");
    expect(text).not.toContain("????????");
  });
});
