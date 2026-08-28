import { DemoAdapter, type FilingAdapter } from "./adapter";
import { NORTHERN_RAILWAY_ROUTE } from "./profile";
import { normaliseNeedPhrase } from "./phrase";
import {
  detectDraftDivergence,
  validateFilingPackage,
  validateDemoStep,
  validateDraft,
} from "./validation";
import type {
  CitizenConfirmed,
  DemoAcknowledgement,
  FictionalFilingProfile,
  InformationHolderRef,
  FilingRouteRef,
  FilingPackageArtifact,
  FilingPackageArtifactInput,
  FilingAttachment,
  PortalProfile,
  ValidatedFilingPackage,
} from "./types";

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      freeze(child);
  }
  return value;
}

function routeMetadata(route: FilingRouteRef): FilingRouteRef {
  const profile: PortalProfile = {
    id: route.profile.id,
    version: route.profile.version,
    verifiedAt: route.profile.verifiedAt,
    text: clone(route.profile.text),
    identity: clone(route.profile.identity),
    sourceUrl: route.profile.sourceUrl,
    submission: route.profile.submission,
    ...(route.profile.attachments === undefined
      ? {}
      : { attachments: clone(route.profile.attachments) }),
    ...(route.profile.fee === undefined
      ? {}
      : { fee: clone(route.profile.fee) }),
    ...(route.profile.routing === undefined
      ? {}
      : { routing: clone(route.profile.routing) }),
    ...(route.profile.jurisdictionRule === undefined
      ? {}
      : { jurisdictionRule: route.profile.jurisdictionRule }),
    ...(route.profile.sourceUrls === undefined
      ? {}
      : { sourceUrls: clone(route.profile.sourceUrls) }),
    ...(route.profile.constraintSources === undefined
      ? {}
      : { constraintSources: clone(route.profile.constraintSources) }),
    ...(route.profile.unverifiedConstraints === undefined
      ? {}
      : { unverifiedConstraints: clone(route.profile.unverifiedConstraints) }),
  };
  return {
    id: route.id,
    authority: {
      id: route.authority.id,
      canonicalName: route.authority.canonicalName,
      portalNames: clone(route.authority.portalNames),
      jurisdiction: route.authority.jurisdiction,
      aliases: clone(route.authority.aliases),
      lastVerified: route.authority.lastVerified,
      verifiedBy: route.authority.verifiedBy,
    },
    profile,
    officialUrl: route.officialUrl,
    guidedCoverage: route.guidedCoverage,
  };
}

function attachmentMetadata(
  attachments: readonly unknown[],
): FilingAttachment[] {
  return attachments.map((attachment) => {
    const value = attachment as FilingAttachment;
    return {
      ...(value.id === undefined ? {} : { id: value.id }),
      name: value.name,
      mimeType: value.mimeType,
      sizeBytes: value.sizeBytes,
    };
  });
}

const NEED_FIELDS = [
  "id",
  "canonicalNeed",
  "measure",
  "geography",
  "period",
  "breakdown",
  "informationHolder",
  "informationHolderStatus",
  "resolutionPreference",
  "unresolvedClarifications",
] as const;

/** Build a detached, JSON-safe download artifact from the confirmed filing state. */
export function buildFilingPackageArtifact(
  input: FilingPackageArtifactInput,
): FilingPackageArtifact {
  const { package: filingPackage, profile, fee, acknowledgement } = input;
  const confirmedNeed = Object.fromEntries(
    NEED_FIELDS.flatMap((field) =>
      field in filingPackage.confirmedNeed
        ? [
            [
              field,
              clone(
                filingPackage.confirmedNeed[
                  field as keyof typeof filingPackage.confirmedNeed
                ],
              ),
            ],
          ]
        : [],
    ),
  );
  const representedAttachments = input.attachments ?? filingPackage.attachments;
  const artifact: FilingPackageArtifact = {
    artifactVersion: "1",
    kind: "filing-package",
    productName: "RTI Tathya",
    disclosure: "Independent research assistant—not an official RTI response.",
    confirmedNeed,
    filingPackage: {
      draft: {
        text: filingPackage.draft.text,
        needId: filingPackage.draft.needId,
        holderId: filingPackage.draft.holderId,
        routeId: filingPackage.draft.routeId,
      },
      holder: {
        id: filingPackage.holder.id,
        canonicalName: filingPackage.holder.canonicalName,
      },
      route: routeMetadata(filingPackage.route),
      fictionalProfile: {
        fullName: profile.fullName,
        email: profile.email,
        address: profile.address,
        state: profile.state,
        pinCode: profile.pinCode,
      },
      fee: { amountInr: fee.amountInr, method: fee.method },
      ...(representedAttachments === undefined
        ? {}
        : { attachments: attachmentMetadata(representedAttachments) }),
    },
    acknowledgement: {
      registrationNumber: acknowledgement.registrationNumber,
      disclosure: acknowledgement.disclosure,
      holder: acknowledgement.holder,
      route: acknowledgement.route,
      submittedDraft: acknowledgement.submittedDraft,
      fee: clone(acknowledgement.fee),
      submittedAt: acknowledgement.submittedAt,
    },
    disclosures: {
      routeValidation: "working",
      draftValidation: "working",
      filing: "simulated",
      payment: "simulated",
      governmentIntegration: "absent",
      acknowledgement: "simulated",
    },
  };
  return freeze(artifact);
}

/** Serialize the filing artifact with stable field ordering and no session state. */
export function serializeFilingPackageArtifact(
  input: FilingPackageArtifactInput,
): string {
  return JSON.stringify(buildFilingPackageArtifact(input));
}

export const DEMO_OTP = "123456";
export const DEMO_PROFILE: FictionalFilingProfile = {
  fullName: "DEMO CITIZEN",
  email: "demo.citizen@example.invalid",
  address: "Fictional demo address, New Delhi",
  state: "Delhi",
  pinCode: "110000",
};

const RAILWAY_DRAFT =
  "Please provide the following records concerning maintenance of lifts and escalators at New Delhi Railway Station during financial year 2024–25: 1. The expenditure statement or relevant ledger extract showing the total amount spent on maintenance of lifts and escalators. 2. Copies of the applicable work orders or contracts, including contractor names and contract values. Please provide the records in electronic form. If these records are held by another public authority, please transfer the application as applicable and inform the applicant.";

export interface FilingModule {
  prepare(input: {
    need: { id: string; canonicalNeed?: string; originalText?: string };
    holder: InformationHolderRef;
    route: FilingRouteRef;
  }): Promise<ValidatedFilingPackage>;
  demoSubmit(input: CitizenConfirmed): Promise<DemoAcknowledgement>;
  validateStep: typeof validateDemoStep;
  validateDraft: typeof validateDraft;
  detectDraftDivergence: typeof detectDraftDivergence;
  demoProfile: FictionalFilingProfile;
  buildArtifact: typeof buildFilingPackageArtifact;
  serializeArtifact: typeof serializeFilingPackageArtifact;
}

export function createFilingModule(
  adapter: FilingAdapter = new DemoAdapter(),
): FilingModule {
  return {
    async prepare({ need, holder, route }) {
      const text =
        route.id === NORTHERN_RAILWAY_ROUTE.id
          ? RAILWAY_DRAFT
          : `Please provide records showing ${normaliseNeedPhrase(
              need.canonicalNeed ??
                need.originalText ??
                "the confirmed information need",
            )}.`;
      const validation = validateDraft(text, route.profile);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      return {
        valid: true,
        draft: {
          text,
          needId: need.id,
          holderId: holder.id,
          routeId: route.id,
        },
        confirmedNeed: need,
        holder,
        route,
        validation,
      };
    },
    async demoSubmit(input) {
      const otp = validateDemoStep("otp", { otp: input.confirmation.otp });
      const identity = validateDemoStep("identity", {
        profile: input.confirmation.profile,
      });
      const review = validateDemoStep("review", {
        confirmed: input.confirmation.reviewed,
      });
      const payment = validateDemoStep("payment", input.confirmation.payment);
      const currentDraft = validateDraft(
        input.package.draft.text,
        input.package.route.profile,
      );
      const divergence = detectDraftDivergence(
        input.package.confirmedNeed,
        input.package.draft.text,
      );
      if (
        !input.package.route.guidedCoverage ||
        !input.package.valid ||
        !validateFilingPackage(input.package).valid ||
        !currentDraft.valid ||
        divergence.diverged ||
        !otp.valid ||
        !identity.valid ||
        !review.valid ||
        !payment.valid
      )
        throw new Error("FILING_PACKAGE_NOT_CONFIRMED");
      return adapter.submit(input);
    },
    validateStep: validateDemoStep,
    validateDraft,
    detectDraftDivergence,
    demoProfile: DEMO_PROFILE,
    buildArtifact: buildFilingPackageArtifact,
    serializeArtifact: serializeFilingPackageArtifact,
  };
}

export { detectDraftDivergence };
