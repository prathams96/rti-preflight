import { describe, expect, it } from "vitest";
import { RTIPreflightModule } from "../preflight/module";
import { snapshot } from "./snapshot";
import type { EvidenceBriefInput } from "./brief";
import {
  evidenceBriefPdfFilename,
  serializeEvidenceBriefPdf,
} from "./brief-pdf";

const SEARCH_DATE = "2026-08-27";

async function resolve(text: string) {
  const preflight = new RTIPreflightModule();
  const need = (await preflight.interpret({ text, traceId: "trace-pdf" }))
    .needs[0];
  return { need, result: await preflight.resolve({ need, snapshot }) };
}

function pdfText(input: EvidenceBriefInput): string {
  return new TextDecoder().decode(serializeEvidenceBriefPdf(input));
}

describe("Evidence Brief PDF export", () => {
  it("renders the derived golden result as an A4 branded PDF with source links", async () => {
    const { need, result } = await resolve(
      "Between 2021 and 2023 which States reported property stolen up and recovery down?",
    );
    const input = { need, result, searchDate: SEARCH_DATE };
    const pdf = serializeEvidenceBriefPdf(input);
    const text = new TextDecoder().decode(pdf);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 595 842]");
    expect(text).toContain("RTI TATHYA");
    expect(text).toContain("Evidence Brief");
    expect(text).toContain("Confirmed Information Need");
    expect(text).toContain("2023 stolen value > 2021 stolen value");
    expect(text).toContain("Gujarat");
    expect(text).toContain("State/UT-wise Value of Property Stolen");
    expect(text).toContain(
      "https://www.data.gov.in/resource/stateut-wise-value",
    );
    expect(text).toContain("/Subtype /Link");
    expect(text).toContain("Search Scope");
    expect(text).toContain("Search date: 2026-08-27");
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
    const text = pdfText({
      need: resolved.need,
      result,
      searchDate: SEARCH_DATE,
    });

    expect(text).toContain("Partially resolved");
    expect(text).toContain("Some requested records remain unresolved.");
    expect(text).toContain("The requested period is not represented.");
    expect(text).toContain("No supporting evidence was included");
    expect(text).not.toContain("Gujarat");
  });

  it("distinguishes the outside-coverage golden result from an in-snapshot no-finding", async () => {
    const { need, result } = await resolve(
      "What is the budget for a local park?",
    );
    const text = pdfText({ need, result, searchDate: SEARCH_DATE });

    expect(text).toContain("Outside snapshot coverage");
    expect(text).toContain(
      "The requested authority or publication is not registered",
    );
    expect(text).toContain("Capability Manifest");
    expect(text).toContain("No calculation was used for this result.");
    expect(text).not.toContain("No answer found");
  });

  it("labels the synthetic golden result and does not add a filing profile", async () => {
    const { need, result } = await resolve(
      "Find an earlier RTI response relevant to a selected Central information need.",
    );
    const text = pdfText({ need, result, searchDate: SEARCH_DATE });

    expect(text).toContain("Synthetic fixture");
    expect(text).toContain("not an official response");
    expect(text).toContain(
      "A synthetic earlier RTI response fixture is available.",
    );
    expect(text).toContain("Search Scope");
    expect(text).not.toMatch(
      /123456|fictional applicant|Demo OTP|UPI|filing profile/i,
    );
  });
});
