import { DemoAdapter, type FilingAdapter } from "./adapter";
import { NORTHERN_RAILWAY_ROUTE } from "./profile";
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
  ValidatedFilingPackage,
} from "./types";

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
}

export function createFilingModule(
  adapter: FilingAdapter = new DemoAdapter(),
): FilingModule {
  return {
    async prepare({ need, holder, route }) {
      const text =
        route.id === NORTHERN_RAILWAY_ROUTE.id
          ? RAILWAY_DRAFT
          : `Please provide records concerning ${need.canonicalNeed ?? need.originalText ?? "the confirmed Information Need"}.`;
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
  };
}

export { detectDraftDivergence };
