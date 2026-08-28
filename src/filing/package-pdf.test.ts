import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SCENARIO_PROMPTS, interpretWithFixture } from "../content/scenarios";
import {
  DEMO_OTP,
  NORTHERN_RAILWAY_HOLDER,
  NORTHERN_RAILWAY_ROUTE,
  buildFilingPackageArtifact,
  createFilingModule,
} from "./index";
import {
  buildFilingPackagePdfPlan,
  FILING_PACKAGE_PDF_FILENAME,
  serializeFilingPackagePdf,
} from "./package-pdf";

async function confirmedInput() {
  const filing = createFilingModule();
  const prepared = await filing.prepare({
    need: interpretWithFixture(SCENARIO_PROMPTS[2].prompt)[0],
    holder: NORTHERN_RAILWAY_HOLDER,
    route: NORTHERN_RAILWAY_ROUTE,
  });
  const acknowledgement = await filing.demoSubmit({
    package: prepared,
    confirmation: {
      otp: DEMO_OTP,
      profile: filing.demoProfile,
      reviewed: true,
      payment: { method: "demo_upi", amountInr: 10 },
    },
  });
  return {
    package: {
      ...prepared,
      attachments: [
        {
          name: "records.pdf",
          mimeType: "application/pdf",
          sizeBytes: 42,
          secret: "must-not-export",
        },
      ],
      prompt: "must-not-export",
      diagnostics: { traceId: "must-not-export" },
    },
    profile: { ...filing.demoProfile },
    fee: { method: "demo_upi" as const, amountInr: 10 },
    acknowledgement,
  };
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

describe("Filing Package PDF export", () => {
  it("renders the allowlisted artifact as an A4 English PDF with a route link", async () => {
    expect(FILING_PACKAGE_PDF_FILENAME).toBe("rti-tathya-filing-package.pdf");
    const input = await confirmedInput();
    const artifact = buildFilingPackageArtifact(input);
    const plan = buildFilingPackagePdfPlan(input, "en");
    const planText = plan
      .flatMap((page) => page.commands)
      .filter((command) => command.kind === "text")
      .map((command) => command.value)
      .join("\n");
    const pdf = await serializeFilingPackagePdf(input, "en");
    const text = new TextDecoder().decode(pdf);

    expect(artifact.acknowledgement.registrationNumber).toBe(
      "DEMO-RTI-2026-0042",
    );
    expect(planText).toContain("DEMO-RTI-2026-0042");
    expect(planText).toContain("maintenance of lifts and escalators");
    expect(planText).toContain("contractor names and contract values");
    expect(planText).toContain("Northern Railway");
    expect(planText).not.toContain("must-not-export");
    expect(plan.flatMap((page) => page.links)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: NORTHERN_RAILWAY_ROUTE.officialUrl }),
      ]),
    );

    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("595 842");
    expect(text).toContain("/ToUnicode");
    expect(text).toContain("/FontFile2");
    expect(text).toContain("/Subtype /Link");
    expect(text).toContain("https://rtionline.gov.in/");
  });

  it("renders the final filing draft and acknowledgement in Hindi", async () => {
    const input = await confirmedInput();
    const marker = "CITIZEN-EDIT-MARKER";
    input.package.draft.text = `${input.package.draft.text} ${marker}`;
    input.acknowledgement.submittedDraft = input.package.draft.text;
    const plan = buildFilingPackagePdfPlan(input, "hi");
    const planText = plan
      .flatMap((page) => page.commands)
      .filter((command) => command.kind === "text")
      .map((command) => command.value)
      .join("\n");
    const pdf = await serializeFilingPackagePdf(input, "hi");
    const text = new TextDecoder().decode(pdf);

    expect(planText).toContain("डेमो फाइलिंग पैकेज");
    expect(planText).toContain("फाइलिंग ड्राफ्ट");
    expect(planText).toContain("डेमो UPI");
    expect(planText).toContain("काल्पनिक सबमिशन समय");
    expect(planText).toContain(marker);
    expect(
      buildFilingPackageArtifact(input).filingPackage.draft.text,
    ).toContain(marker);
    expect(
      buildFilingPackageArtifact(input).acknowledgement.submittedDraft,
    ).toContain(marker);
    expect(text).toContain("/Subtype /Type0");
    expect(text).toContain("/ToUnicode");
  });
});
