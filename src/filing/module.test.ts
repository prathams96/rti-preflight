import { describe, expect, it } from "vitest";
import {
  DEMO_OTP,
  NORTHERN_RAILWAY_HOLDER,
  NORTHERN_RAILWAY_PROFILE,
  NORTHERN_RAILWAY_ROUTE,
  createFilingModule,
  detectDraftDivergence,
  validateDraft,
  validateDemoStep,
  buildFilingPackageArtifact,
  serializeFilingPackageArtifact,
} from "./index";

const need = {
  id: "need-railway",
  originalText: "Raw citizen prompt must not enter a Filing Package.",
  canonicalNeed:
    "maintenance expenditure for lifts and escalators and contractors at New Delhi Railway Station during FY 2024-25",
};

describe("Filing Module public seam", () => {
  async function confirmedInput() {
    const filing = createFilingModule();
    const prepared = await filing.prepare({
      need,
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
            id: "attachment-1",
            name: "records.pdf",
            mimeType: "application/pdf",
            sizeBytes: 42,
            secret: "must-not-export",
          },
        ],
        prompt: "must-not-export",
        diagnostics: { rawModelPayload: "must-not-export" },
      },
      profile: { ...filing.demoProfile },
      fee: { method: "demo_upi" as const, amountInr: 10 },
      acknowledgement,
    };
  }

  it("builds a JSON-safe artifact with confirmed fields, metadata, attachment metadata, and disclosures", async () => {
    const input = await confirmedInput();
    const artifact = buildFilingPackageArtifact(input);

    expect(artifact.confirmedNeed).toMatchObject({
      id: need.id,
      canonicalNeed: need.canonicalNeed,
    });
    expect(artifact.productName).toBe("RTI Tathya");
    expect(artifact.filingPackage.route).toMatchObject({
      id: NORTHERN_RAILWAY_ROUTE.id,
      officialUrl: NORTHERN_RAILWAY_ROUTE.officialUrl,
      profile: { id: NORTHERN_RAILWAY_PROFILE.id },
    });
    expect(artifact.filingPackage.attachments).toEqual([
      {
        id: "attachment-1",
        name: "records.pdf",
        mimeType: "application/pdf",
        sizeBytes: 42,
      },
    ]);
    expect(artifact.disclosures).toEqual({
      routeValidation: "working",
      draftValidation: "working",
      filing: "simulated",
      payment: "simulated",
      governmentIntegration: "absent",
      acknowledgement: "simulated",
    });
    const serialized = serializeFilingPackageArtifact(input);
    expect(serialized).not.toContain("must-not-export");
    expect(serialized).not.toContain("rawModelPayload");
    expect(serialized).not.toContain("Raw citizen prompt");
    expect(serialized).toContain("DEMO-RTI-2026-0042");
  });

  it("is detached, immutable, and deterministic", async () => {
    const input = await confirmedInput();
    const first = buildFilingPackageArtifact(input);
    const second = buildFilingPackageArtifact(input);
    expect(first).toEqual(second);
    expect(serializeFilingPackageArtifact(input)).toBe(
      serializeFilingPackageArtifact(input),
    );
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.filingPackage.route)).toBe(true);

    input.package.draft.text = "changed after export";
    input.profile.fullName = "changed after export";
    expect(first.filingPackage.draft.text).not.toBe("changed after export");
    expect(first.filingPackage.fictionalProfile.fullName).toBe("DEMO CITIZEN");
  });

  it("exposes the verified Northern Railway route and its 3,000 character rule", () => {
    expect(NORTHERN_RAILWAY_HOLDER.canonicalName).toBe("Northern Railway");
    expect(NORTHERN_RAILWAY_ROUTE.profile.text.maxChars).toBe(3000);
    expect(NORTHERN_RAILWAY_ROUTE.profile.submission).toBe("demo");
    expect(NORTHERN_RAILWAY_ROUTE.profile.verifiedAt).toMatch(/^2026-/);
    expect(NORTHERN_RAILWAY_ROUTE.profile.sourceUrls).toContain(
      "https://rtionline.gov.in/request/allpa.php",
    );
    expect(NORTHERN_RAILWAY_ROUTE.profile.constraintSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "text-limit",
          sourceUrls: expect.any(Array),
        }),
      ]),
    );
    expect(NORTHERN_RAILWAY_ROUTE.profile.text.newlinesPermitted).toBe(false);
    expect(NORTHERN_RAILWAY_ROUTE.profile.attachments).toMatchObject({
      maxCount: 1,
      maxBytes: 1_000_000,
      mimeTypes: ["application/pdf"],
    });
    expect(NORTHERN_RAILWAY_ROUTE.profile.fee).toMatchObject({
      amountInr: 10,
      exemptions: [{ code: "BPL" }],
    });
    expect(NORTHERN_RAILWAY_ROUTE.profile.identity.fieldsProhibited).toEqual(
      expect.arrayContaining(["aadhaar", "pan", "upiId", "cvv"]),
    );
    expect(NORTHERN_RAILWAY_ROUTE.profile.routing?.intermediary).toBe(
      "Nodal Officer",
    );
    expect(NORTHERN_RAILWAY_ROUTE.profile.jurisdictionRule).toContain(
      "Central",
    );
  });

  it("accepts the boundary and rejects overflow without truncating", () => {
    expect(
      validateDraft("x".repeat(2999), NORTHERN_RAILWAY_ROUTE.profile),
    ).toMatchObject({ valid: true, characterCount: 2999 });
    const exactlyAtLimit = "x".repeat(3000);
    expect(
      validateDraft(exactlyAtLimit, NORTHERN_RAILWAY_ROUTE.profile),
    ).toMatchObject({
      valid: true,
      characterCount: 3000,
    });
    const overflow = "x".repeat(3001);
    expect(
      validateDraft(overflow, NORTHERN_RAILWAY_ROUTE.profile),
    ).toMatchObject({
      valid: false,
      characterCount: 3001,
      overflowBy: 1,
    });
    expect(validateDraft(overflow, NORTHERN_RAILWAY_ROUTE.profile).text).toBe(
      overflow,
    );
    expect(
      validateDraft("valid\ntext", NORTHERN_RAILWAY_ROUTE.profile),
    ).toMatchObject({ valid: false, characterCount: 10 });
  });

  it("prepares the railway draft and refuses a divergent added need", async () => {
    const filing = createFilingModule();
    const prepared = await filing.prepare({
      need,
      holder: NORTHERN_RAILWAY_HOLDER,
      route: NORTHERN_RAILWAY_ROUTE,
    });
    expect(prepared.valid).toBe(true);
    expect(detectDraftDivergence(need, prepared.draft.text)).toEqual({
      diverged: false,
      addedTerms: [],
    });
    expect(prepared.draft.text).toContain(
      "maintenance of lifts and escalators",
    );
    expect(
      detectDraftDivergence(
        need,
        `${prepared.draft.text}\nAlso disclose pension arrears.`,
      ).diverged,
    ).toBe(true);
    expect(
      detectDraftDivergence(
        need,
        `${prepared.draft.text} Include invoice reference numbers where available.`,
      ).diverged,
    ).toBe(false);
    expect(
      detectDraftDivergence(
        need,
        "Please provide records about municipal waste collection in Ward 5.",
      ).diverged,
    ).toBe(true);
  });

  it("keeps the fictional filing profile separate and requires explicit demo steps", async () => {
    const filing = createFilingModule();
    const prepared = await filing.prepare({
      need,
      holder: NORTHERN_RAILWAY_HOLDER,
      route: NORTHERN_RAILWAY_ROUTE,
    });
    expect(JSON.stringify(prepared)).not.toContain("DEMO CITIZEN");
    expect(validateDemoStep("otp", { otp: DEMO_OTP }).valid).toBe(true);
    expect(validateDemoStep("otp", { otp: "000000" }).valid).toBe(false);
    expect(
      validateDemoStep("identity", { profile: filing.demoProfile }).valid,
    ).toBe(true);
    expect(validateDemoStep("review", { confirmed: false }).valid).toBe(false);
    expect(
      validateDemoStep("payment", { method: "demo_upi", amountInr: 10 }).valid,
    ).toBe(true);
    const acknowledgement = await filing.demoSubmit({
      package: prepared,
      confirmation: {
        otp: DEMO_OTP,
        profile: filing.demoProfile,
        reviewed: true,
        payment: { method: "demo_upi", amountInr: 10 },
      },
    });
    expect(acknowledgement.registrationNumber).toBe("DEMO-RTI-2026-0042");
    expect(acknowledgement.disclosure).toMatch(
      /No request, payment, or personal information/,
    );
  });

  it("rejects prohibited identity fields and revalidates edited drafts", async () => {
    const filing = createFilingModule();
    const prepared = await filing.prepare({
      need,
      holder: NORTHERN_RAILWAY_HOLDER,
      route: NORTHERN_RAILWAY_ROUTE,
    });
    expect(
      validateDemoStep("identity", {
        profile: { ...filing.demoProfile, pan: "never" },
      }).valid,
    ).toBe(false);
    const edited = {
      ...prepared,
      draft: { ...prepared.draft, text: "x".repeat(3001) },
    };
    await expect(
      filing.demoSubmit({
        package: edited,
        confirmation: {
          otp: DEMO_OTP,
          profile: filing.demoProfile,
          reviewed: true,
          payment: { method: "demo_upi", amountInr: 10 },
        },
      }),
    ).rejects.toThrow("FILING_PACKAGE_NOT_CONFIRMED");
  });

  it("counts Hindi and multiline text without rewriting it", () => {
    const text = "सूचना\n".repeat(500);
    const validation = validateDraft(text, NORTHERN_RAILWAY_ROUTE.profile);
    expect(validation.text).toBe(text);
    expect(validation.characterCount).toBe([...text].length);
    expect(
      detectDraftDivergence(need, `${text}\nपेंशन बकाया की जानकारी दें`)
        .diverged,
    ).toBe(true);
  });

  it("keeps Demo Payment and submission disabled outside Guided Filing Coverage", async () => {
    const filing = createFilingModule();
    const outsideRoute = {
      ...NORTHERN_RAILWAY_ROUTE,
      id: "unverified-route",
      guidedCoverage: false,
    };
    const prepared = await filing.prepare({
      need,
      holder: NORTHERN_RAILWAY_HOLDER,
      route: outsideRoute,
    });
    await expect(
      filing.demoSubmit({
        package: prepared,
        confirmation: {
          otp: DEMO_OTP,
          profile: filing.demoProfile,
          reviewed: true,
          payment: { method: "demo_upi", amountInr: 10 },
        },
      }),
    ).rejects.toThrow("FILING_PACKAGE_NOT_CONFIRMED");
  });
});
