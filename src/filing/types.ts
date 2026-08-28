export type FilingAuthority = {
  id: string;
  canonicalName: string;
  portalNames: Record<string, string>;
  jurisdiction: "central" | "state" | "local";
  aliases: string[];
  lastVerified: string;
  verifiedBy: string;
};

export type PortalProfile = {
  id: string;
  version: string;
  verifiedAt: string;
  text: {
    maxChars: number;
    overflowStrategy: "attachment_pdf" | "reject";
    newlinesPermitted?: boolean;
    allowedCharset?: string;
  };
  attachments?: {
    maxCount: number;
    maxBytes: number;
    mimeTypes: string[];
    prohibited: string[];
  };
  fee?: {
    amountInr: number;
    exemptions: { code: string; proofRequired: string }[];
    methods: "demo_upi"[];
  };
  identity: { fieldsRequired: string[]; fieldsProhibited: string[] };
  routing?: { intermediary: string | null };
  jurisdictionRule?: string;
  sourceUrl: string;
  sourceUrls?: string[];
  constraintSources?: {
    id: string;
    label: string;
    sourceUrls: string[];
  }[];
  unverifiedConstraints?: string[];
  submission: "demo";
};

export type FilingRouteRef = {
  id: string;
  authority: FilingAuthority;
  profile: PortalProfile;
  officialUrl: string;
  guidedCoverage: boolean;
};

export type InformationHolderRef = { id: string; canonicalName: string };

export type FilingDraft = {
  text: string;
  needId: string;
  holderId: string;
  routeId: string;
};

export type DraftValidation = {
  valid: boolean;
  text: string;
  characterCount: number;
  overflowBy?: number;
  errors: string[];
};

export type ConfirmedFilingNeed = {
  id: string;
  canonicalNeed?: string;
  originalText?: string;
  measure?: string;
  geography?: string;
  period?: string;
  breakdown?: string;
  informationHolder?: string;
  informationHolderStatus?: "verified" | "unverified";
  resolutionPreference?: string;
  unresolvedClarifications?: string[];
  scenario?: string;
};

export type ValidatedFilingPackage = {
  valid: true;
  draft: FilingDraft;
  confirmedNeed: ConfirmedFilingNeed;
  holder: InformationHolderRef;
  route: FilingRouteRef;
  validation: DraftValidation;
  /** Optional attachment metadata represented by the filing package. */
  attachments?: FilingAttachment[];
};

export type FilingAttachment = {
  id?: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

export type FictionalFilingProfile = {
  fullName: string;
  email: string;
  address: string;
  state: string;
  pinCode: string;
};

export type CitizenConfirmed = {
  package: ValidatedFilingPackage;
  confirmation: {
    otp: string;
    profile: FictionalFilingProfile;
    reviewed: boolean;
    payment: { method: "demo_upi"; amountInr: number };
  };
};

export type DemoAcknowledgement = {
  registrationNumber: string;
  disclosure: string;
  holder: string;
  route: string;
  submittedDraft: string;
  fee: { amountInr: number; method: "demo_upi" };
  submittedAt: string;
};

export type DemoStep =
  "draft" | "otp" | "identity" | "review" | "payment" | "confirmation";

export type StepValidation = { valid: boolean; errors: string[] };

export type FilingFee = { amountInr: number; method: "demo_upi" };

export type FilingPackageArtifactInput = {
  package: ValidatedFilingPackage;
  profile: FictionalFilingProfile;
  fee: FilingFee;
  acknowledgement: DemoAcknowledgement;
  attachments?: FilingAttachment[];
};

export type FilingPackageArtifact = {
  artifactVersion: "1";
  kind: "filing-package";
  disclosure: "Independent research assistant—not an official RTI response.";
  confirmedNeed: Record<string, unknown>;
  filingPackage: {
    draft: Pick<FilingDraft, "text" | "needId" | "holderId" | "routeId">;
    holder: InformationHolderRef;
    route: FilingRouteRef;
    fictionalProfile: FictionalFilingProfile;
    fee: FilingFee;
    attachments?: FilingAttachment[];
  };
  acknowledgement: Pick<
    DemoAcknowledgement,
    | "registrationNumber"
    | "disclosure"
    | "holder"
    | "route"
    | "submittedDraft"
    | "fee"
    | "submittedAt"
  >;
  disclosures: {
    routeValidation: "working";
    draftValidation: "working";
    filing: "simulated";
    payment: "simulated";
    governmentIntegration: "absent";
    acknowledgement: "simulated";
  };
};
