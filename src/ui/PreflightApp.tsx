"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import type {
  InformationNeed,
  Language,
  NarrationState,
  NeedInterpretation,
  RenderableResolution,
  ResolutionPreference,
} from "../domain/types";
import {
  CPCB_CONFLICT_DECISION,
  hasExplicitDraftingIntent,
  SCENARIO_PROMPTS,
  shouldPreferDraftingRoute,
} from "../content/scenarios";
import { DISCLOSURE_LEDGER } from "../disclosure/ledger";
import {
  createFilingModule,
  detectDraftDivergence,
  isNorthernRailwayGuidedNeed,
  NORTHERN_RAILWAY_ROUTE,
  validateDemoStep,
  validateDraft,
  type DemoAcknowledgement,
  type DemoStep,
  type ConfirmedFilingNeed,
  type FictionalFilingProfile,
  type ValidatedFilingPackage,
} from "../filing";
import { EPFO_CLAIM_STATUS_ROUTE } from "../service/epfo-route";
import { createTraceRecorder, generateTraceId } from "../observability";
import { ASK_SCREEN_COPY } from "./start-screen-copy";
import {
  RESULT_STAGE_COPY,
  draftReturnPhase,
  resultOutcomeAfterCitationReview,
  resultForCitationReview,
  type CitationReviewState,
} from "./result-stage";
import { informationNeedEditErrors } from "../preflight/need-validation";
import {
  localizeDisclosureEntry,
  canonicalizeNeedValue,
  clarificationDisplay,
  localizeFilingProfile,
  localizeMessage,
  localizeNeed,
  localizeResolution,
  localizeText,
  isUnknownClarification,
} from "./localization";

export type Phase =
  | "start"
  | "select"
  | "confirm"
  | "search"
  | "result"
  | "draft"
  | "file"
  | "acknowledgement";
type AiThinkingTask = "interpretation" | "resolution" | "draft";
type SavedState = {
  phase: Phase;
  text: string;
  needs?: InformationNeed[];
  need?: InformationNeed;
  result?: RenderableResolution;
  language: Language;
  challengedEvidenceId?: string;
  challengedNeedSignature?: string;
};

type SessionFilingState = {
  phase: Extract<Phase, "draft" | "file" | "acknowledgement">;
  need: InformationNeed;
  draftText: string;
  package?: ValidatedFilingPackage;
  step: DemoStep;
  otp: string;
  profile: FictionalFilingProfile;
  reviewed: boolean;
  paymentConfirmed: boolean;
  acknowledgement?: DemoAcknowledgement;
  language: Language;
};

type SavedPreflight = {
  id: string;
  label: string;
  text: string;
  phase?: Extract<Phase, "start" | "confirm" | "result" | "draft">;
  need?: InformationNeed;
  result?: RenderableResolution;
  draftText?: string;
  draftOriginalText?: string;
  filingPackage?: ValidatedFilingPackage;
  language: Language;
};

type IconName = "info" | "external" | "check" | "warning" | "pending";

function Icon({ name }: { name: IconName }) {
  const paths = {
    info: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 10.5v5M12 7.5h.01" />
      </>
    ),
    external: <path d="M13 5h6v6m-1-5-8 8M16 15v3H5V7h3" />,
    check: <path d="m5 12 4.2 4L19 6.5" />,
    warning: (
      <>
        <path d="m12 4 8 15H4L12 4Z" />
        <path d="M12 9v4.5M12 16h.01" />
      </>
    ),
    pending: <path d="M12 4a8 8 0 1 0 8 8M12 4v8h8" />,
  } as const;

  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

type PersistedEnvelope<T> = { version: 2; state: T };
const RESEARCH_KEY = "rti-preflight-state-v2";
const FILING_KEY = "rti-preflight-filing-v2";
const SAVED_PREFLIGHTS_KEY = "rti-preflight-saved";
const LEGACY_RESEARCH_KEY = "rti-preflight-draft";
const LEGACY_FILING_KEY = "rti-preflight-filing";
const RESEARCH_PHASES = ["select", "confirm", "search", "result"] as const;
type ResearchPhase = (typeof RESEARCH_PHASES)[number];
const isResearchPhase = (phase: Phase): phase is ResearchPhase =>
  RESEARCH_PHASES.includes(phase as ResearchPhase);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isOneOf = <T extends string>(
  value: unknown,
  options: readonly T[],
): value is T => typeof value === "string" && options.includes(value as T);

const SCENARIOS = [
  "ncrb-property",
  "previous-rti",
  "epfo-status",
  "cpcb-conflict",
  "railway-filing",
  "unsupported",
] as const;
const OUTCOMES = [
  "SOURCE_RESOLVED",
  "DERIVED_FINDING",
  "PARTIALLY_RESOLVED",
  "EVIDENCE_CONFLICT",
  "FORMAL_RESPONSE_REQUIRED",
  "NO_RELIABLE_FINDING",
  "OUTSIDE_SNAPSHOT_COVERAGE",
  "OFFICIAL_SERVICE_ROUTE",
] as const;

function isGroundingReference(value: unknown): boolean {
  if (!isObject(value)) return false;
  const locator = value.locator;
  const validLocator =
    isObject(locator) &&
    (locator.kind === "cell"
      ? isNonEmptyString(locator.rowKey) && isNonEmptyString(locator.colKey)
      : locator.kind === "jsonPointer" && isNonEmptyString(locator.pointer));
  return (
    isNonEmptyString(value.sourceBlobHash) &&
    isNonEmptyString(value.representationHash) &&
    isNonEmptyString(value.locatedContent) &&
    isNonEmptyString(value.locatedContentHash) &&
    validLocator &&
    isNonEmptyString(value.extractionMethod) &&
    isNonEmptyString(value.extractionVersion) &&
    isOneOf(value.confidence, ["exact", "inferred_header"] as const)
  );
}

function isEvidenceItem(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.sourceTitle) &&
    isNonEmptyString(value.publisher) &&
    isOneOf(value.sourceType, [
      "official_dataset",
      "rti_response_fixture",
      "official_service_route",
    ] as const) &&
    (value.url === undefined || isNonEmptyString(value.url)) &&
    (value.alternateUrl === undefined ||
      isNonEmptyString(value.alternateUrl)) &&
    isNonEmptyString(value.applicablePeriod) &&
    (value.publicationDate === undefined ||
      isNonEmptyString(value.publicationDate)) &&
    (value.scope === undefined || isNonEmptyString(value.scope)) &&
    (value.methodology === undefined || isNonEmptyString(value.methodology)) &&
    (value.syntheticDisclosure === undefined ||
      isNonEmptyString(value.syntheticDisclosure)) &&
    isNonEmptyString(value.extract) &&
    isOneOf(value.translationStatus, [
      "original",
      "machine_translated",
    ] as const) &&
    Array.isArray(value.grounding) &&
    value.grounding.every(isGroundingReference)
  );
}

function isDerivedRow(value: unknown): boolean {
  if (!isObject(value)) return false;
  const calculationMetadata = value.calculationMetadata;
  return (
    isNonEmptyString(value.geography) &&
    isNonEmptyString(value.stolen2021) &&
    isNonEmptyString(value.stolen2023) &&
    isNonEmptyString(value.stolenDelta) &&
    isNonEmptyString(value.recovery2021) &&
    isNonEmptyString(value.recovery2023) &&
    isNonEmptyString(value.recoveryDelta) &&
    value.unit === "INR crore" &&
    Array.isArray(value.lineage) &&
    value.lineage.every(isGroundingReference) &&
    (calculationMetadata === undefined ||
      (isObject(calculationMetadata) &&
        [
          "representationHash",
          "planHash",
          "engineVersion",
          "engineHash",
          "policyVersion",
          "policyHash",
        ].every((key) => isNonEmptyString(calculationMetadata[key]))))
  );
}

function isExecutionReceipt(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    isNonEmptyString(value.snapshotHash) &&
    isNonEmptyString(value.capabilityManifestHash) &&
    isNonEmptyString(value.retrievalPlanHash) &&
    isStringArray(value.checkedResourceIds) &&
    isStringArray(value.gapManifest) &&
    isNonEmptyString(value.executedAt) &&
    (value.engineVersion === undefined ||
      isNonEmptyString(value.engineVersion)) &&
    (value.engineHash === undefined || isNonEmptyString(value.engineHash)) &&
    (value.policyVersion === undefined ||
      isNonEmptyString(value.policyVersion)) &&
    (value.policyHash === undefined || isNonEmptyString(value.policyHash))
  );
}

function isRenderableResolution(value: unknown): value is RenderableResolution {
  if (!isObject(value)) return false;
  const calculation = value.calculation;
  const coverageManifest = value.coverageManifest;
  const researchFinding = value.researchFinding;
  const validCalculation =
    calculation === undefined ||
    (isObject(calculation) &&
      isNonEmptyString(calculation.operation) &&
      isStringArray(calculation.filters) &&
      isNonEmptyString(calculation.caveat) &&
      isNonEmptyString(calculation.planHash));
  const validCoverageManifest =
    coverageManifest === undefined ||
    (isObject(coverageManifest) &&
      isNonEmptyString(coverageManifest.capabilityManifestHash) &&
      isNonEmptyString(coverageManifest.checkedAuthority) &&
      isStringArray(coverageManifest.checkedResourceIds) &&
      isNonEmptyString(coverageManifest.limitation));
  const validResearchFinding =
    researchFinding === undefined ||
    (isObject(researchFinding) &&
      isOneOf(researchFinding.outcome, OUTCOMES) &&
      isNonEmptyString(researchFinding.headline) &&
      isNonEmptyString(researchFinding.evidenceStatus) &&
      Array.isArray(researchFinding.evidence) &&
      researchFinding.evidence.every(isEvidenceItem) &&
      Array.isArray(researchFinding.rows) &&
      researchFinding.rows.every(isDerivedRow));
  const validServiceRoute =
    value.serviceRoute === undefined ||
    (isObject(value.serviceRoute) &&
      isNonEmptyString(value.serviceRoute.id) &&
      isNonEmptyString(value.serviceRoute.purpose) &&
      isNonEmptyString(value.serviceRoute.officialUrl) &&
      isNonEmptyString(value.serviceRoute.verifiedAt) &&
      isStringArray(value.serviceRoute.primarySourceUrls));
  return (
    isOneOf(value.outcome, OUTCOMES) &&
    isNonEmptyString(value.headline) &&
    isNonEmptyString(value.meaning) &&
    isNonEmptyString(value.evidenceStatus) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidenceItem) &&
    Array.isArray(value.rows) &&
    value.rows.every(isDerivedRow) &&
    isStringArray(value.gaps) &&
    isNonEmptyString(value.searchScope) &&
    isNonEmptyString(value.recommendedAction) &&
    (value.narrationLanguage === undefined ||
      isOneOf(value.narrationLanguage, ["en", "hi"] as const)) &&
    validCalculation &&
    (value.executionReceipt === undefined ||
      isExecutionReceipt(value.executionReceipt)) &&
    validCoverageManifest &&
    validResearchFinding &&
    validServiceRoute &&
    (value.formalResponseReason === undefined ||
      isNonEmptyString(value.formalResponseReason)) &&
    isNonEmptyString(value.traceId)
  );
}

const isNeedPresentation = (value: unknown): boolean => {
  if (!isObject(value)) return false;
  return (
    isOneOf(value.language, ["en", "hi"] as const) &&
    [
      "canonicalNeed",
      "measure",
      "geography",
      "period",
      "breakdown",
      "informationHolder",
    ].every((key) => isNonEmptyString(value[key])) &&
    isStringArray(value.unresolvedClarifications)
  );
};

const isNeed = (value: unknown): value is InformationNeed =>
  isObject(value) &&
  [
    "id",
    "originalText",
    "canonicalNeed",
    "measure",
    "geography",
    "period",
    "breakdown",
    "informationHolder",
  ].every((key) => isNonEmptyString(value[key])) &&
  isStringArray(value.unresolvedClarifications) &&
  isOneOf(value.informationHolderStatus, ["verified", "unverified"] as const) &&
  isOneOf(value.resolutionPreference, [
    "published",
    "formal",
    "unsure",
  ] as const) &&
  isOneOf(value.scenario, SCENARIOS) &&
  (value.draftingIntent === undefined ||
    typeof value.draftingIntent === "boolean") &&
  (value.recordSubject === undefined ||
    isOneOf(value.recordSubject, ["own", "another", "unspecified"] as const)) &&
  (value.presentation === undefined || isNeedPresentation(value.presentation));

export const validSavedState = (value: unknown): value is SavedState => {
  if (
    !isObject(value) ||
    !["start", "select", "confirm", "search", "result"].includes(
      value.phase as string,
    )
  )
    return false;
  if (
    typeof value.text !== "string" ||
    (value.language !== "en" && value.language !== "hi")
  )
    return false;
  if (
    value.needs !== undefined &&
    (!Array.isArray(value.needs) || !value.needs.every(isNeed))
  )
    return false;
  if (value.need !== undefined && !isNeed(value.need)) return false;
  if (value.result !== undefined && !isRenderableResolution(value.result))
    return false;
  if (
    value.challengedEvidenceId !== undefined &&
    !isNonEmptyString(value.challengedEvidenceId)
  )
    return false;
  if (
    value.challengedNeedSignature !== undefined &&
    !isNonEmptyString(value.challengedNeedSignature)
  )
    return false;
  if (value.phase === "select")
    return Array.isArray(value.needs) && value.needs.length > 0;
  if (value.phase === "confirm" || value.phase === "search")
    return isNeed(value.need);
  if (value.phase === "result")
    return isNeed(value.need) && isRenderableResolution(value.result);
  return true;
};

function isFilingProfile(value: unknown): value is FictionalFilingProfile {
  return (
    isObject(value) &&
    isNonEmptyString(value.fullName) &&
    isNonEmptyString(value.email) &&
    isNonEmptyString(value.address) &&
    isNonEmptyString(value.state) &&
    isNonEmptyString(value.pinCode)
  );
}

function isValidatedFilingPackage(
  value: unknown,
): value is ValidatedFilingPackage {
  if (!isObject(value) || value.valid !== true) return false;
  const draft = value.draft;
  const holder = value.holder;
  const route = value.route;
  const confirmedNeed = value.confirmedNeed;
  const validation = value.validation;
  const authority = isObject(route) ? route.authority : undefined;
  const profile = isObject(route) ? route.profile : undefined;
  const profileText = isObject(profile) ? profile.text : undefined;
  const profileIdentity = isObject(profile) ? profile.identity : undefined;
  const unverifiedConstraints = isObject(profile)
    ? profile.unverifiedConstraints
    : undefined;
  return (
    isObject(draft) &&
    isNonEmptyString(draft.text) &&
    isNonEmptyString(draft.needId) &&
    isNonEmptyString(draft.holderId) &&
    isNonEmptyString(draft.routeId) &&
    isObject(confirmedNeed) &&
    isNonEmptyString(confirmedNeed.id) &&
    isNonEmptyString(confirmedNeed.canonicalNeed) &&
    isObject(holder) &&
    isNonEmptyString(holder.id) &&
    isNonEmptyString(holder.canonicalName) &&
    isObject(route) &&
    isNonEmptyString(route.id) &&
    isNonEmptyString(route.officialUrl) &&
    typeof route.guidedCoverage === "boolean" &&
    isObject(authority) &&
    isNonEmptyString(authority.id) &&
    isNonEmptyString(authority.canonicalName) &&
    isObject(authority.portalNames) &&
    Object.values(authority.portalNames).every(isNonEmptyString) &&
    isObject(profile) &&
    isNonEmptyString(profile.id) &&
    isNonEmptyString(profile.version) &&
    isNonEmptyString(profile.verifiedAt) &&
    isObject(profileText) &&
    typeof profileText.maxChars === "number" &&
    Number.isFinite(profileText.maxChars) &&
    profileText.maxChars > 0 &&
    isOneOf(profileText.overflowStrategy, [
      "attachment_pdf",
      "reject",
    ] as const) &&
    isObject(profileIdentity) &&
    isStringArray(profileIdentity.fieldsRequired) &&
    isStringArray(profileIdentity.fieldsProhibited) &&
    (unverifiedConstraints === undefined ||
      isStringArray(unverifiedConstraints)) &&
    isNonEmptyString(profile.sourceUrl) &&
    profile.submission === "demo" &&
    isObject(validation) &&
    typeof validation.valid === "boolean" &&
    typeof validation.characterCount === "number" &&
    Number.isFinite(validation.characterCount) &&
    isStringArray(validation.errors)
  );
}

function isAcknowledgement(value: unknown): value is DemoAcknowledgement {
  if (!isObject(value) || !isObject(value.fee)) return false;
  return (
    isNonEmptyString(value.registrationNumber) &&
    isNonEmptyString(value.disclosure) &&
    isNonEmptyString(value.holder) &&
    isNonEmptyString(value.route) &&
    isNonEmptyString(value.submittedDraft) &&
    typeof value.fee.amountInr === "number" &&
    value.fee.method === "demo_upi" &&
    isNonEmptyString(value.submittedAt)
  );
}

export const validFilingState = (
  value: unknown,
): value is SessionFilingState => {
  if (
    !isObject(value) ||
    !isOneOf(value.phase, ["draft", "file", "acknowledgement"] as const) ||
    typeof value.draftText !== "string" ||
    (value.language !== "en" &&
      value.language !== "hi" &&
      value.language !== undefined) ||
    !isNeed(value.need) ||
    !isOneOf(value.step, [
      "otp",
      "identity",
      "review",
      "payment",
      "confirmation",
    ] as const) ||
    (!isNonEmptyString(value.otp) && value.otp !== "") ||
    !isFilingProfile(value.profile) ||
    typeof value.reviewed !== "boolean" ||
    typeof value.paymentConfirmed !== "boolean"
  )
    return false;
  if (value.package !== undefined && !isValidatedFilingPackage(value.package))
    return false;
  if (value.phase === "file" && !isValidatedFilingPackage(value.package))
    return false;
  if (value.phase === "acknowledgement")
    return (
      value.step === "confirmation" &&
      isValidatedFilingPackage(value.package) &&
      isAcknowledgement(value.acknowledgement)
    );
  return value.step !== "confirmation" && value.acknowledgement === undefined;
};

export const COPY = {
  en: {
    independent: "Independent prototype — not a government service.",
    headline: "Find out before you file an RTI",
    supporting: ASK_SCREEN_COPY.en.supporting,
    label: "What public information are you looking for?",
    privacy:
      "Do not enter passwords, OTPs, Aadhaar, PAN, EPIC, or account numbers.",
    submit: ASK_SCREEN_COPY.en.submit,
    details: "Prototype details",
    examples: "Try one of these",
    confirm: "Is this what you're asking for?",
    search: "Search published sources",
    edit: "Edit",
    restart: "Start over",
    result: RESULT_STAGE_COPY.en.resultStage,
    researchNotice: RESULT_STAGE_COPY.en.researchNotice,
    searching: "Checking published government records",
    searchingDetail: "No government system is being accessed.",
    back: "Back to confirmed need",
    askStage: "Step 1 of 3 · Ask",
    multipleStage: "Ask · Multiple needs",
    confirmStage: "Step 2 of 3 · Check",
    searchStage: "Step 3 of 3 · Searching",
    resultStage: RESULT_STAGE_COPY.en.resultStage,
    selectTitle: "Choose one Information Need to continue",
    selectIntro:
      "We kept your original wording and separated the needs so each one can be checked clearly.",
    oneNeed:
      "Only one need is active at a time. You can start another Preflight later.",
    measure: "What you're asking for",
    geography: "For",
    period: "Period",
    breakdown: "Breakdown by",
    holder: "Likely department to ask",
    preference: "What kind of answer do you need?",
    prefPublished: "Reliable information from a published government source",
    prefFormal: "A new written response from a public authority",
    prefUnsure: "I'm not sure — help me decide",
    clarification: "Material clarification",
    unsure: "I’m not sure",
    calculation: "Calculation",
    matching: "matching rows",
    unresolved: "What remains unresolved",
    scope: "Search based on the prototype Evidence Snapshot · View scope",
    evidence: "Supporting evidence",
    officialRoute: "Official service route",
    syntheticFixture: "Synthetic fixture",
    verifiedWord: "verified",
    officialSource: "Official source",
    pinnedCsv: "Open pinned CSV",
    tableCaption: "States and Union Territories matching the NCRB conditions",
    stateColumn: "State/UT",
    stolenColumn: "Stolen 2021 → 2023",
    changeColumn: "Change",
    recoveryColumn: "Recovery 2021 → 2023",
    inspectEvidence: "Inspect evidence details",
    inspectRow: (geography: string) =>
      `Inspect ${geography} operands and source cells`,
    viewPlan: "View the registered calculation plan",
    saveBrief: "Download Evidence Brief (PDF)",
    downloadTechnicalBrief: "Download technical JSON",
    briefSaved: "Evidence Brief PDF downloaded.",
    briefShared: "Evidence Brief PDF shared.",
    technicalBriefSaved: "Technical Evidence Brief JSON downloaded.",
    briefCancelled: "Sharing was cancelled. The result remains available here.",
    briefFailed:
      "We couldn’t save this Evidence Brief. The result remains available here.",
    sourceData: "Real official public data",
    publisher: "Publisher",
    applicablePeriod: "Applicable period",
    locatedValues: "Located values",
    openSource: "Open official source",
    prepare: "Prepare an RTI Draft",
    prepareAnyway: "Prepare an RTI Draft anyway",
    citizenOverride: "Still need an official response? Prepare an RTI Draft",
    openRoute: "Open official service route",
    clarifyHolder: "Clarify the likely department first",
    footer:
      "Your research is anonymous. Nothing is filed unless you enter the separate filing demo.",
    language: "हिन्दी",
    draftStage: RESULT_STAGE_COPY.en.draftStage,
    draftTitle: RESULT_STAGE_COPY.en.draftTitle,
    draftIntro: RESULT_STAGE_COPY.en.draftIntro,
    to: "Information Holder",
    request: "Request",
    route: "Official Filing Route",
    verified: "Last checked",
    characters: "characters",
    continueFiling: "Continue to filing demo",
    saveDraft: "Save this draft",
    savedDraft: "Saved Filing Draft",
    returnResult: "Return to result",
    guidedUnavailable:
      "Guided filing isn't available for this authority in the prototype. You can copy this draft and file it yourself through the authority's own RTI channel.",
    divergenceTitle: "This edit may add another Information Need",
    divergenceBody:
      "Choose how to keep control of the draft. Nothing will be truncated or silently rewritten.",
    keepWritten: "Keep as written",
    separateNeed: "Separate into another Saved Preflight",
    undoChanges: "Undo changes",
    fileStage: RESULT_STAGE_COPY.en.fileStage,
    fileTitle: RESULT_STAGE_COPY.en.fileTitle,
    fileIntro: RESULT_STAGE_COPY.en.fileIntro,
    stepOtp: "1. Verify",
    stepIdentity: "2. Your details",
    stepReview: "3. Review",
    stepPayment: "4. Pay fee",
    otpPrompt: "Hackathon prototype: use OTP 123456. No SMS was sent.",
    verifyOtp: "Verify demo OTP",
    identityPrompt: "These details are fictional and stay in session state.",
    continue: "Continue",
    reviewPrompt: "Review the complete Filing Package before payment.",
    confirmPackage: "I confirm this complete Filing Package",
    paymentPrompt: "Demo Payment: ₹10 · Demo UPI",
    noRealPayment: "No real payment will be made.",
    confirmDemo: "Complete simulated filing",
    acknowledgementStage: "Done",
    acknowledgementTitle: RESULT_STAGE_COPY.en.acknowledgementTitle,
    fictionalRegistration: "Fictional registration",
    noGovernment:
      "No request, payment, or personal information was sent to a government system.",
    downloadPackage: "Download demo Filing Package",
    packageSaved: "Demo Filing Package PDF downloaded.",
    packageFailed:
      "We couldn’t save this Filing Package PDF. The acknowledgement remains available here.",
    startAnother: "Ask something else",
    correction: "This isn’t what I asked",
    challenge: "Report a citation problem",
    challengePending:
      "You reported a citation problem. The result stays visible below, but it is downgraded to partially resolved until this source is revalidated. You can still prepare an RTI Draft.",
    challengeDialogTitle: "Report a citation problem?",
    challengeDialogBody: (sourceTitle: string) =>
      `You are reporting that “${sourceTitle}” may not support this result.`,
    challengeDialogConsequence:
      "After you confirm, the original result and evidence will stay visible, but its status will be downgraded pending revalidation.",
    confirmChallenge: "Report problem and downgrade",
    cancel: "Cancel",
    draftLabel: "Filing Draft",
    routeNotVerified: "Route information not verified in this prototype",
    routeVerification:
      "Validated against route information last checked on this date; external acceptance is not guaranteed.",
    unverified: "Unverified",
    draftHelp:
      "Edit this freely — we won't rewrite your words. It asks for records rather than reasons, which is what the RTI Act entitles you to.",
    divergenceSaved:
      "The draft remains saved for editing, but filing stays blocked until the additional need is removed or separated.",
    editDraft: "Edit Filing Draft",
    demoOtp: "Demo OTP",
    name: "Name",
    email: "Email",
    address: "Address",
    state: "State",
    pin: "PIN",
    routeLine: "Route",
    fictionalApplicant: "Applicant",
    mockFee: "Fee",
    componentSummary:
      "Working: route validation. Simulated: OTP, identity, payment, filing, and acknowledgement.",
    paymentCredentials:
      "No UPI ID, card, CVV, bank, or payment credential is collected.",
    paymentCheck: "I understand this is a simulated payment step.",
    fictionalTime: "Fictional submission time",
    submittedDraft: "Submitted draft snapshot",
    draftAria: "Filing Draft",
    stepperAria: "Simulated filing steps",
    prepareFailure: "We couldn’t prepare this Filing Draft right now.",
    revalidationError:
      "This Filing Draft needs revalidation before filing. Undo the added need or separate it into another Saved Preflight.",
    divergenceSeparate:
      "The edited text is kept here and marked for a separate Saved Preflight.",
    savedPreflights: "Saved Preflights",
    resume: "Resume",
    originalNeed: "Original confirmed Information Need",
    separatedDraft: "Separated draft to interpret",
    cpcbCut:
      "Air-quality results are withheld until two compatible official sources agree. We'd rather show you nothing than show you a number we can't stand behind.",
    askReassurance: ASK_SCREEN_COPY.en.reassurance,
    confirmIntro:
      "We rewrote your question so it can be checked against official records. Correct anything that's wrong — this is exactly what we'll search for.",
    responseProcess:
      "In a real filing, the official route provides the applicable response process.",
    realWorldNext:
      "In a real filing, the government portal would provide its own acknowledgement and the applicable response timeline.",
    provenance: (count: number, date: string) =>
      `Checked against ${count} official values · last verified ${date}`,
    customOption: "Other / custom — type your own",
    customHelp: "Choose a common value or type your own.",
    customAccepted: "Custom value accepted.",
    invalidNeed:
      "Complete each Information Need field before checking. You can type a custom geography or period.",
    disclosure: "Disclosure",
    closeDetails: "Close prototype details",
    verifiedRouteProfile: "Verified Filing Route profile",
    epfoRouteDetails: "EPFO Official Service Route",
    cpcbScenario: "CPCB conflict scenario",
    routeMetadataNote:
      "Purpose and verification date are metadata; the primary route is the link above.",
    resumeTitle: "Resume previous Preflight",
    resumeBody: "Your saved prototype journey is ready to continue.",
    startFresh: "Start fresh",
    askAria: "Ask for public information",
    placeholder:
      "For example: How much did my municipality spend on road repairs in 2024-25?",
    interpreting: "Interpreting your need",
    aiThinking: {
      interpretation: {
        eyebrow: "Assisted interpretation",
        title: "Making your question checkable",
        detail:
          "We’re reading your wording and mapping it to one clear Information Need.",
        stages: [
          "Reading your wording",
          "Separating the Information Need",
          "Preparing a confirmation card",
        ],
      },
      resolution: {
        eyebrow: "Evidence check in progress",
        title: "Checking the evidence",
        detail:
          "We’re checking only the registered Evidence Snapshot and preparing a grounded result.",
        stages: [
          "Confirming the selected need",
          "Checking registered sources",
          "Preparing a grounded result",
        ],
      },
      draft: {
        eyebrow: "Draft preparation in progress",
        title: "Preparing your Filing Draft",
        detail:
          "We’re keeping your confirmed scope intact while shaping an editable records request.",
        stages: [
          "Reading the confirmed need",
          "Keeping your scope intact",
          "Preparing an editable draft",
        ],
      },
      note: "These work areas describe this step; they are not a live progress report.",
      cancel: "Back and edit",
    },
    unknownClarification:
      "Answer using the fields above, or retain this one detail as unknown.",
    rowDetail: (row: string, values: string) =>
      `Inspect ${row} operands and source cells: ${values}`,
    changeLabel: "change",
    recoveryLabel: "Recovery",
    crore: "crore",
    plan: "Plan",
    engine: "Engine",
    policy: "Policy",
    demoUpi: "Demo UPI",
    noPersonalRecord: "Route metadata; no personal record was retrieved",
    immutableReferences: (count: number) =>
      `${count} immutable references with content hashes`,
    progressNeed: "Confirmed Information Need",
    progressNcrb: "Checked NCRB Table 20A.1 in the prototype Evidence Snapshot",
    progressNcrbDone: "Applied deterministic filters and validated grounding",
    progressCapabilities: "Checked registered Evidence Snapshot capabilities",
    progressResult: "Prepared the supported result state",
    demoSubmissionFailure:
      "The Filing Package must be valid and explicitly confirmed before Demo Submission.",
    recheckChallenge:
      "Change and reconfirm the Information Need before rechecking this challenged source.",
    recoveryNotice:
      "Your previous prototype session could not be restored. Start a new Preflight.",
    independentDetails:
      "This is an independent research assistant—not an official RTI response.",
    routeProfileVersion: (version: string, date: string) =>
      `Northern Railway route profile v${version}, verified ${date}.`,
    routeMetadataDetails: (purpose: string, date: string) =>
      `${purpose}; verified ${date}. This is route metadata, not a retrieved personal record.`,
    unknownRetained:
      "Kept as unknown; this limitation stays visible in the result and Filing Draft.",
    cpcbDecision: (date: string) =>
      `Decision recorded ${date}; no conflict evidence is registered.`,
  },
  hi: {
    independent: "स्वतंत्र प्रोटोटाइप — कोई सरकारी सेवा नहीं।",
    headline: "RTI दाखिल करने से पहले पता करें",
    supporting: ASK_SCREEN_COPY.hi.supporting,
    label: "आप कौन-सी सार्वजनिक जानकारी ढूँढ रहे हैं?",
    privacy: "पासवर्ड, OTP, आधार, PAN, EPIC या खाता नंबर दर्ज न करें।",
    submit: ASK_SCREEN_COPY.hi.submit,
    details: "प्रोटोटाइप विवरण",
    examples: "इनमें से कोई आज़माएँ",
    confirm: "क्या आप यही पूछना चाहते हैं?",
    search: "प्रकाशित स्रोत खोजें",
    edit: "बदलें",
    restart: "फिर से शुरू करें",
    result: RESULT_STAGE_COPY.hi.resultStage,
    researchNotice: RESULT_STAGE_COPY.hi.researchNotice,
    searching: "प्रकाशित सरकारी रिकॉर्ड देख रहे हैं",
    searchingDetail: "किसी सरकारी सिस्टम को नहीं देखा जा रहा है।",
    back: "पुष्टि की गई ज़रूरत पर लौटें",
    askStage: "चरण 1/3 · पूछें",
    multipleStage: "पूछें · कई ज़रूरतें",
    confirmStage: "चरण 2/3 · जाँचें",
    searchStage: "चरण 3/3 · खोज रहे हैं",
    resultStage: RESULT_STAGE_COPY.hi.resultStage,
    selectTitle: "जारी रखने के लिए एक सूचना-ज़रूरत चुनें",
    selectIntro:
      "हमने आपके मूल शब्द रखे हैं और ज़रूरतों को अलग किया है ताकि हर ज़रूरत को स्पष्ट रूप से जाँचा जा सके।",
    oneNeed:
      "एक समय में केवल एक ज़रूरत सक्रिय है। बाद में एक और जाँच शुरू कर सकते हैं।",
    measure: "आप क्या माँग रहे हैं",
    geography: "किसके लिए / कहाँ",
    period: "अवधि",
    breakdown: "किस आधार पर",
    holder: "किस विभाग से पूछें",
    preference: "आपको किस तरह का उत्तर चाहिए?",
    prefPublished: "प्रकाशित सरकारी स्रोत से विश्वसनीय जानकारी",
    prefFormal: "किसी लोक प्राधिकरण से नया लिखित उत्तर",
    prefUnsure: "मुझे नहीं पता — तय करने में मदद करें",
    clarification: "महत्वपूर्ण स्पष्टीकरण",
    unsure: "मैं निश्चित नहीं हूँ",
    calculation: "गणना",
    matching: "मिलती पंक्तियाँ",
    unresolved: "क्या अभी अनसुलझा है",
    scope: "प्रोटोटाइप प्रमाण स्नैपशॉट पर आधारित खोज · दायरा देखें",
    evidence: "सहायक प्रमाण",
    officialRoute: "आधिकारिक सेवा मार्ग",
    syntheticFixture: "सिंथेटिक फ़िक्स्चर",
    verifiedWord: "सत्यापित",
    officialSource: "आधिकारिक स्रोत खोलें",
    pinnedCsv: "पिन किया गया CSV खोलें",
    tableCaption: "NCRB शर्तों से मेल खाने वाले राज्य और केंद्र शासित प्रदेश",
    stateColumn: "राज्य/केंद्र शासित प्रदेश",
    stolenColumn: "चोरी 2021 → 2023",
    changeColumn: "बदलाव",
    recoveryColumn: "बरामदगी 2021 → 2023",
    inspectEvidence: "पंक्ति के प्रमाण देखें",
    inspectRow: (geography: string) => `${geography} के मान और स्रोत सेल देखें`,
    viewPlan: "पंजीकृत गणना योजना देखें",
    saveBrief: "प्रमाण सारांश (PDF) डाउनलोड करें",
    downloadTechnicalBrief: "तकनीकी JSON डाउनलोड करें",
    briefSaved: "प्रमाण सारांश PDF डाउनलोड हो गया।",
    briefShared: "प्रमाण सारांश PDF साझा हो गया।",
    technicalBriefSaved: "तकनीकी प्रमाण सारांश JSON डाउनलोड हो गया।",
    briefCancelled: "साझा करना रद्द किया गया। नतीजा यहाँ उपलब्ध है।",
    briefFailed: "प्रमाण सारांश सहेजा नहीं जा सका। नतीजा यहाँ उपलब्ध है।",
    sourceData: "वास्तविक आधिकारिक सार्वजनिक डेटा",
    publisher: "प्रकाशक",
    applicablePeriod: "लागू अवधि",
    locatedValues: "स्थित मान",
    openSource: "आधिकारिक स्रोत खोलें",
    prepare: "RTI ड्राफ्ट तैयार करें",
    prepareAnyway: "फिर भी RTI ड्राफ्ट तैयार करें",
    citizenOverride: "फिर भी आधिकारिक उत्तर चाहिए? RTI ड्राफ्ट तैयार करें",
    openRoute: "आधिकारिक सेवा मार्ग खोलें",
    clarifyHolder: "पहले संभावित विभाग स्पष्ट करें",
    footer:
      "आपका शोध गुमनाम है। अलग फाइलिंग डेमो में जाने तक कुछ दाखिल नहीं होता।",
    language: "English",
    draftStage: RESULT_STAGE_COPY.hi.draftStage,
    draftTitle: RESULT_STAGE_COPY.hi.draftTitle,
    draftIntro: RESULT_STAGE_COPY.hi.draftIntro,
    to: "सूचना-धारक",
    request: "अनुरोध",
    route: "आधिकारिक फाइलिंग मार्ग",
    verified: "अंतिम जाँच",
    characters: "अक्षर",
    continueFiling: "फाइलिंग डेमो पर जाएँ",
    saveDraft: "ड्राफ्ट सहेजें",
    savedDraft: "सहेजा गया आवेदन ड्राफ्ट",
    returnResult: "नतीजे पर लौटें",
    guidedUnavailable:
      "इस प्राधिकरण के लिए निर्देशित फाइलिंग इस प्रोटोटाइप में उपलब्ध नहीं है। आप इस ड्राफ्ट की नकल करके स्वयं उस प्राधिकरण के RTI माध्यम से दाखिल कर सकते हैं।",
    divergenceTitle: "यह बदलाव दूसरी सूचना-ज़रूरत जोड़ सकता है",
    divergenceBody:
      "ड्राफ्ट पर नियंत्रण रखने का तरीका चुनें। कुछ भी छोटा या चुपचाप बदला नहीं जाएगा।",
    keepWritten: "जैसा लिखा है वैसा रखें",
    separateNeed: "दूसरी सहेजी गई जाँच में अलग करें",
    undoChanges: "बदलाव वापस लें",
    fileStage: RESULT_STAGE_COPY.hi.fileStage,
    fileTitle: RESULT_STAGE_COPY.hi.fileTitle,
    fileIntro: RESULT_STAGE_COPY.hi.fileIntro,
    stepOtp: "1. सत्यापन",
    stepIdentity: "2. आपका विवरण",
    stepReview: "3. समीक्षा",
    stepPayment: "4. शुल्क",
    otpPrompt: "हैकाथॉन प्रोटोटाइप: OTP 123456 डालें। कोई SMS नहीं भेजा गया।",
    verifyOtp: "डेमो OTP सत्यापित करें",
    identityPrompt: "ये विवरण काल्पनिक हैं और सत्र की स्थिति में रहते हैं।",
    continue: "जारी रखें",
    reviewPrompt: "भुगतान से पहले पूरे फाइलिंग पैकेज की समीक्षा करें।",
    confirmPackage: "मैं इस पूरे आवेदन पैकेज की पुष्टि करता/करती हूँ",
    paymentPrompt: "डेमो भुगतान: ₹10 · डेमो UPI",
    noRealPayment: "कोई वास्तविक भुगतान नहीं होगा।",
    confirmDemo: "डेमो सबमिशन की पुष्टि करें",
    acknowledgementStage: "पूरा हुआ",
    acknowledgementTitle: RESULT_STAGE_COPY.hi.acknowledgementTitle,
    fictionalRegistration: "काल्पनिक पंजीकरण",
    noGovernment:
      "किसी सरकारी सिस्टम को अनुरोध, भुगतान या व्यक्तिगत जानकारी नहीं भेजी गई।",
    downloadPackage: "डेमो फाइलिंग पैकेज डाउनलोड करें",
    packageSaved: "डेमो फाइलिंग पैकेज PDF डाउनलोड हो गया।",
    packageFailed:
      "डेमो फाइलिंग पैकेज PDF सहेजा नहीं जा सका। पावती यहाँ उपलब्ध है।",
    startAnother: "कुछ और पूछें",
    correction: "यह वह नहीं है जो मैंने पूछा था",
    challenge: "उद्धरण की समस्या रिपोर्ट करें",
    challengePending:
      "इस उद्धरण की समस्या रिपोर्ट की गई है। मूल नतीजा दिखता रहेगा, लेकिन इस स्रोत के दोबारा सत्यापन तक इसकी स्थिति आंशिक रूप से हल की गई होगी। आप फिर भी RTI ड्राफ्ट तैयार कर सकते हैं।",
    challengeDialogTitle: "उद्धरण की समस्या रिपोर्ट करें?",
    challengeDialogBody: (sourceTitle: string) =>
      `आप रिपोर्ट कर रहे हैं कि “${sourceTitle}” इस नतीजे का समर्थन नहीं कर सकता।`,
    challengeDialogConsequence:
      "पुष्टि करने के बाद मूल नतीजा और प्रमाण दिखते रहेंगे, लेकिन दोबारा सत्यापन तक इसका स्तर घटेगा।",
    confirmChallenge: "समस्या रिपोर्ट करके स्तर घटाएँ",
    cancel: "रद्द करें",
    draftLabel: "फाइलिंग ड्राफ्ट",
    routeNotVerified: "इस प्रोटोटाइप में मार्ग की जानकारी सत्यापित नहीं है",
    routeVerification:
      "इस तारीख को अंतिम बार जाँची गई मार्ग जानकारी के आधार पर सत्यापित; बाहरी स्वीकृति की गारंटी नहीं है।",
    unverified: "असत्यापित",
    draftHelp:
      "इसे बेझिझक बदलें — हम आपके शब्द नहीं बदलेंगे। यह कारण नहीं, रिकॉर्ड माँगता है, जिसका आपको RTI अधिनियम के तहत अधिकार है।",
    divergenceSaved:
      "ड्राफ्ट संपादन के लिए सहेजा गया है, लेकिन अतिरिक्त ज़रूरत हटाने या अलग करने तक फाइलिंग रोकी गई है।",
    editDraft: "फाइलिंग ड्राफ्ट बदलें",
    demoOtp: "डेमो OTP",
    name: "नाम",
    email: "ईमेल",
    address: "पता",
    state: "राज्य",
    pin: "PIN",
    routeLine: "मार्ग",
    fictionalApplicant: "आवेदक",
    mockFee: "शुल्क",
    componentSummary:
      "कार्यशील: मार्ग सत्यापन। अनुकरण: OTP, पहचान, भुगतान, फाइलिंग और पावती।",
    paymentCredentials:
      "कोई UPI ID, कार्ड, CVV, बैंक या भुगतान क्रेडेंशियल नहीं लिया जाता।",
    paymentCheck: "मैं समझता/समझती हूँ कि यह अनुकरण किया गया भुगतान चरण है।",
    fictionalTime: "काल्पनिक सबमिशन समय",
    submittedDraft: "जमा किए गए ड्राफ्ट का स्नैपशॉट",
    draftAria: "फाइलिंग ड्राफ्ट",
    stepperAria: "अनुकरण किए गए फाइलिंग चरण",
    prepareFailure: "अभी फाइलिंग ड्राफ्ट तैयार नहीं हो सका।",
    revalidationError:
      "फाइलिंग से पहले इस फाइलिंग ड्राफ्ट का फिर से सत्यापन ज़रूरी है। अतिरिक्त ज़रूरत हटाएँ या उसे दूसरी सहेजी गई जाँच में अलग करें।",
    divergenceSeparate:
      "बदला हुआ पाठ यहाँ रखा गया है और अलग सहेजी गई जाँच के लिए चिह्नित है।",
    savedPreflights: "सहेजी गई जाँचें",
    resume: "फिर शुरू करें",
    originalNeed: "मूल पुष्ट की गई सूचना-ज़रूरत",
    separatedDraft: "अलग किए गए ड्राफ्ट को समझें",
    cpcbCut:
      "जब तक दो संगत आधिकारिक स्रोत सहमत नहीं होते, वायु-गुणवत्ता के नतीजे नहीं दिखाए जाते। ऐसा आँकड़ा दिखाने से बेहतर है कुछ न दिखाना जिस पर हम भरोसा न कर सकें।",
    askReassurance: ASK_SCREEN_COPY.hi.reassurance,
    confirmIntro:
      "हमने आपके प्रश्न को इस तरह लिखा है कि उसे आधिकारिक रिकॉर्ड से जाँचा जा सके। कुछ ग़लत हो तो सुधार लें — हम बिलकुल यही खोजेंगे।",
    responseProcess:
      "असली फाइलिंग में आधिकारिक मार्ग लागू प्रतिक्रिया प्रक्रिया बताएगा।",
    realWorldNext:
      "असली फाइलिंग में सरकारी पोर्टल अपनी पावती और लागू प्रतिक्रिया समय-सीमा बताएगा।",
    provenance: (count: number, date: string) =>
      `${count} आधिकारिक मानों से मिलान किया गया · अंतिम सत्यापन ${date}`,
    customOption: "अन्य / अपनी जानकारी लिखें",
    customHelp: "कोई सामान्य विकल्प चुनें या अपनी जानकारी लिखें।",
    customAccepted: "अपनी जानकारी स्वीकार की गई है।",
    invalidNeed:
      "जाँचने से पहले सूचना-ज़रूरत के सभी फ़ील्ड भरें। आप अपनी जगह या अवधि लिख सकते हैं।",
    disclosure: "प्रकटीकरण",
    closeDetails: "प्रोटोटाइप विवरण बंद करें",
    verifiedRouteProfile: "सत्यापित फाइलिंग मार्ग प्रोफ़ाइल",
    epfoRouteDetails: "EPFO आधिकारिक सेवा मार्ग",
    cpcbScenario: "CPCB विरोधाभास परिदृश्य",
    routeMetadataNote:
      "उद्देश्य और सत्यापन की तारीख मेटाडेटा हैं; मुख्य मार्ग ऊपर दिया गया लिंक है।",
    resumeTitle: "पिछली जाँच फिर शुरू करें",
    resumeBody: "आपकी सहेजी गई प्रोटोटाइप यात्रा जारी रखने के लिए तैयार है।",
    startFresh: "नई शुरुआत करें",
    askAria: "सार्वजनिक जानकारी पूछें",
    placeholder:
      "उदाहरण: मेरी नगरपालिका ने 2024-25 में सड़क की मरम्मत पर कितना खर्च किया?",
    interpreting: "आपकी ज़रूरत समझी जा रही है",
    aiThinking: {
      interpretation: {
        eyebrow: "सहायता से समझ रहे हैं",
        title: "आपके सवाल को जाँचने योग्य बना रहे हैं",
        detail:
          "हम आपके शब्द पढ़कर उन्हें एक स्पष्ट सूचना-ज़रूरत में बदल रहे हैं।",
        stages: [
          "आपके शब्द पढ़ रहे हैं",
          "सूचना-ज़रूरत अलग कर रहे हैं",
          "पुष्टि कार्ड तैयार कर रहे हैं",
        ],
      },
      resolution: {
        eyebrow: "प्रमाण की जाँच जारी है",
        title: "प्रमाण की जाँच कर रहे हैं",
        detail:
          "हम केवल पंजीकृत प्रमाण स्नैपशॉट जाँचकर प्रमाण-आधारित नतीजा तैयार कर रहे हैं।",
        stages: [
          "चुनी गई ज़रूरत की पुष्टि कर रहे हैं",
          "पंजीकृत स्रोत जाँच रहे हैं",
          "प्रमाण-आधारित नतीजा तैयार कर रहे हैं",
        ],
      },
      draft: {
        eyebrow: "ड्राफ्ट तैयार किया जा रहा है",
        title: "आपका फाइलिंग ड्राफ्ट तैयार कर रहे हैं",
        detail:
          "हम आपकी पुष्ट दायरे को बनाए रखते हुए रिकॉर्ड माँगने वाला बदलाव योग्य ड्राफ्ट बना रहे हैं।",
        stages: [
          "पुष्ट ज़रूरत पढ़ रहे हैं",
          "आपका दायरा बनाए रख रहे हैं",
          "बदलाव योग्य ड्राफ्ट तैयार कर रहे हैं",
        ],
      },
      note: "ये चरण इस काम के हिस्से बताते हैं; यह लाइव प्रगति रिपोर्ट नहीं है।",
      cancel: "वापस जाकर बदलें",
    },
    unknownClarification:
      "ऊपर दिए फ़ील्ड से उत्तर दें या इस विवरण को अज्ञात रहने दें।",
    rowDetail: (row: string, values: string) =>
      `${row} के मान और स्रोत सेल देखें: ${values}`,
    changeLabel: "बदलाव",
    recoveryLabel: "बरामदगी",
    crore: "करोड़",
    plan: "योजना",
    engine: "इंजन",
    policy: "नीति",
    demoUpi: "डेमो UPI",
    noPersonalRecord: "मार्ग मेटाडेटा; कोई व्यक्तिगत रिकॉर्ड प्राप्त नहीं हुआ",
    immutableReferences: (count: number) =>
      `${count} अपरिवर्तनीय संदर्भ, जिनमें सामग्री हैश हैं`,
    progressNeed: "पुष्ट की गई सूचना-ज़रूरत",
    progressNcrb: "प्रोटोटाइप प्रमाण स्नैपशॉट में NCRB तालिका 20A.1 जाँची",
    progressNcrbDone: "तय नियमों से फ़िल्टर लगाए और प्रमाण का सत्यापन किया",
    progressCapabilities: "पंजीकृत प्रमाण स्नैपशॉट की क्षमताएँ जाँचीं",
    progressResult: "समर्थित नतीजे की स्थिति तैयार की",
    demoSubmissionFailure:
      "डेमो सबमिशन से पहले फाइलिंग पैकेज मान्य और स्पष्ट रूप से पुष्ट होना चाहिए।",
    recheckChallenge:
      "इस चुनौती दिए गए स्रोत को फिर से जाँचने से पहले सूचना-ज़रूरत बदलकर उसकी पुष्टि करें।",
    recoveryNotice:
      "आपका पिछला प्रोटोटाइप सत्र वापस नहीं लाया जा सका। नई जाँच शुरू करें।",
    independentDetails: "यह स्वतंत्र शोध सहायक है — आधिकारिक RTI उत्तर नहीं।",
    routeProfileVersion: (version: string, date: string) =>
      `Northern Railway मार्ग प्रोफ़ाइल v${version}, ${date} को सत्यापित।`,
    routeMetadataDetails: (purpose: string, date: string) =>
      `${localizeText(purpose, "hi")}; ${date} को सत्यापित। यह मार्ग मेटाडेटा है, प्राप्त व्यक्तिगत रिकॉर्ड नहीं।`,
    unknownRetained:
      "अज्ञात के रूप में रखा गया; यह सीमा नतीजे और फाइलिंग ड्राफ्ट में दिखाई देती रहेगी।",
    cpcbDecision: (date: string) =>
      `निर्णय ${date} को दर्ज किया गया; कोई विरोधाभास प्रमाण पंजीकृत नहीं है।`,
  },
} as const;

type AppCopy = (typeof COPY)[keyof typeof COPY];

function AiThinkingScreen({
  task,
  copy,
  onCancel,
}: {
  task: AiThinkingTask;
  copy: AppCopy;
  onCancel: () => void;
}) {
  const content = copy.aiThinking[task];

  return (
    <section
      className={`content-column ai-thinking-state ai-thinking-${task}`}
      aria-labelledby="ai-thinking-title"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="ai-thinking-plane">
        <div className="ai-thinking-heading">
          <div className="ai-thinking-signal" aria-hidden="true">
            <Icon name="pending" />
          </div>
          <div>
            <p className="eyebrow">{content.eyebrow}</p>
            <h1 id="ai-thinking-title">{content.title}</h1>
            <p className="lede">{content.detail}</p>
          </div>
        </div>

        <div className="ai-workbench" aria-hidden="true">
          <div className="ai-workbench-ruler">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="ai-paper ai-paper-back">
            <span />
            <span />
            <span />
          </div>
          <div className="ai-paper ai-paper-middle">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="ai-paper ai-paper-front">
            <strong />
            <span />
            <span />
            <span />
          </div>
          <div className="ai-scan-beam" />
          <div className="ai-scan-stamp">
            <Icon name="pending" />
          </div>
        </div>

        <ol className="ai-stage-list">
          {content.stages.map((stage) => (
            <li className="ai-stage" key={stage}>
              <span className="ai-stage-indicator" aria-hidden="true">
                <span />
              </span>
              <span>{stage}</span>
            </li>
          ))}
        </ol>
        <p className="ai-thinking-note">
          <Icon name="info" /> {copy.aiThinking.note}
        </p>
        <button className="secondary-button ai-cancel" onClick={onCancel}>
          {copy.aiThinking.cancel}
        </button>
      </div>
    </section>
  );
}

const outcomeLabel: Record<string, string> = {
  DERIVED_FINDING: "Calculated from official figures",
  SOURCE_RESOLVED: "Source-Resolved",
  NO_RELIABLE_FINDING: "No answer found in the records we checked",
  OUTSIDE_SNAPSHOT_COVERAGE: "Not verified from available sources",
  OFFICIAL_SERVICE_ROUTE: "Official Service Route",
  PARTIALLY_RESOLVED: "Partially Resolved",
  EVIDENCE_CONFLICT: "Evidence Conflict",
  FORMAL_RESPONSE_REQUIRED: "Formal Response Required",
};
const outcomeLabelHi: Record<string, string> = {
  DERIVED_FINDING: "आधिकारिक आँकड़ों से गणना की गई",
  SOURCE_RESOLVED: "स्रोत से हल",
  NO_RELIABLE_FINDING: "जिन रिकॉर्ड को हमने देखा उनमें उत्तर नहीं मिला",
  OUTSIDE_SNAPSHOT_COVERAGE: "उपलब्ध स्रोतों से पुष्टि नहीं हुई",
  OFFICIAL_SERVICE_ROUTE: "आधिकारिक सेवा मार्ग",
  PARTIALLY_RESOLVED: "आंशिक रूप से हल",
  EVIDENCE_CONFLICT: "प्रमाण में विरोध",
  FORMAL_RESPONSE_REQUIRED: "औपचारिक उत्तर ज़रूरी",
};

export function persist(state: SavedState) {
  if (!isResearchPhase(state.phase)) return;
  try {
    window.localStorage.setItem(
      RESEARCH_KEY,
      JSON.stringify({
        version: 2,
        state,
      } satisfies PersistedEnvelope<SavedState>),
    );
  } catch {
    /* optional enhancement */
  }
}

export function readPersistedState(): SavedState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RESEARCH_KEY) ?? "null",
    ) as unknown;
    if (
      !isObject(parsed) ||
      parsed.version !== 2 ||
      !validSavedState(parsed.state)
    )
      throw new Error("invalid");
    return parsed.state;
  } catch {
    clearResearchStorage();
    return undefined;
  }
}

export function readSessionFilingState(): SessionFilingState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(FILING_KEY) ?? "null",
    ) as unknown;
    if (
      !isObject(parsed) ||
      parsed.version !== 2 ||
      !validFilingState(parsed.state)
    )
      throw new Error("invalid");
    return parsed.state;
  } catch {
    clearFilingStorage();
    return undefined;
  }
}

export function loadSessionFilingState(): {
  state: SessionFilingState | undefined;
  recoveryNeeded: boolean;
} {
  let existed = false;
  try {
    existed =
      typeof window !== "undefined" &&
      Boolean(window.sessionStorage.getItem(FILING_KEY));
  } catch {
    /* optional storage */
  }
  const state = readSessionFilingState();
  return { state, recoveryNeeded: existed && !state };
}

function clearResearchStorage() {
  try {
    [RESEARCH_KEY, LEGACY_RESEARCH_KEY].forEach((key) =>
      window.localStorage.removeItem(key),
    );
  } catch {
    /* optional storage */
  }
}

function clearFilingStorage() {
  try {
    [FILING_KEY, LEGACY_FILING_KEY].forEach((key) =>
      window.sessionStorage.removeItem(key),
    );
  } catch {
    /* optional storage */
  }
}

function clearPrototypeStorage() {
  clearResearchStorage();
  clearFilingStorage();
}

export function filingNeedSignature(need: ConfirmedFilingNeed): string {
  return JSON.stringify({
    id: need.id,
    canonicalNeed: need.canonicalNeed,
    measure: need.measure,
    geography: need.geography,
    period: need.period,
    breakdown: need.breakdown,
    informationHolder: need.informationHolder,
    informationHolderStatus: need.informationHolderStatus,
    resolutionPreference: need.resolutionPreference,
    unresolvedClarifications: need.unresolvedClarifications,
  });
}

function isSavedPreflight(value: unknown): value is SavedPreflight {
  if (
    !isObject(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.label) ||
    typeof value.text !== "string" ||
    (value.language !== "en" && value.language !== "hi")
  )
    return false;
  if (
    value.phase !== undefined &&
    !isOneOf(value.phase, ["start", "confirm", "result", "draft"] as const)
  )
    return false;
  if (value.need !== undefined && !isNeed(value.need)) return false;
  if (value.result !== undefined && !isRenderableResolution(value.result))
    return false;
  if (value.draftText !== undefined && typeof value.draftText !== "string")
    return false;
  if (
    value.draftOriginalText !== undefined &&
    typeof value.draftOriginalText !== "string"
  )
    return false;
  if (
    value.filingPackage !== undefined &&
    !isValidatedFilingPackage(value.filingPackage)
  )
    return false;
  if (
    value.phase === "result" &&
    (!isNeed(value.need) || !isRenderableResolution(value.result))
  )
    return false;
  if (value.phase === "confirm" && !isNeed(value.need)) return false;
  if (
    value.phase === "draft" &&
    (!isNeed(value.need) || typeof value.draftText !== "string")
  )
    return false;
  return true;
}

function readSavedPreflights(): SavedPreflight[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SAVED_PREFLIGHTS_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSavedPreflight) : [];
  } catch {
    return [];
  }
}

/** Restore journey data without changing the language the citizen selected. */
export function restoreSavedPreflightForLanguage(
  saved: SavedPreflight,
  language: Language,
): SavedPreflight {
  const draftText = saved.draftText;
  const draftOriginalText =
    saved.draftOriginalText === undefined ? draftText : saved.draftOriginalText;
  const filingPackage =
    saved.filingPackage && draftText !== undefined
      ? {
          ...saved.filingPackage,
          draft: { ...saved.filingPackage.draft, text: draftText },
          validation: validateDraft(
            draftText,
            saved.filingPackage.route.profile,
          ),
        }
      : saved.filingPackage;
  return {
    ...saved,
    language,
    ...(draftText === undefined ? {} : { draftText }),
    ...(draftOriginalText === undefined ? {} : { draftOriginalText }),
    ...(filingPackage === undefined ? {} : { filingPackage }),
  };
}

function needSignature(need: InformationNeed | undefined): string {
  if (!need) return "";
  return JSON.stringify({
    originalText: need.originalText,
    canonicalNeed: need.canonicalNeed,
    measure: need.measure,
    geography: need.geography,
    period: need.period,
    breakdown: need.breakdown,
    informationHolder: need.informationHolder,
    resolutionPreference: need.resolutionPreference,
  });
}

/**
 * Pure guard for late draft responses. A response is stale when the request
 * generation changed (language switch, need edit, navigation, or reset), the
 * confirmed need changed, or the citizen already started editing the draft.
 */
export function shouldDiscardDraftResponse(input: {
  capturedGeneration: number;
  currentGeneration: number;
  capturedSignature: string;
  currentSignature: string;
  draftEdited: boolean;
}): boolean {
  return (
    input.capturedGeneration !== input.currentGeneration ||
    input.capturedSignature !== input.currentSignature ||
    input.draftEdited
  );
}

/**
 * Pure generation guard shared by resolution and interpretation. Any
 * navigation, reset, or language change that increments the corresponding
 * request generation invalidates an in-flight response.
 */
export function isStaleRequest(
  capturedGeneration: number,
  currentGeneration: number,
): boolean {
  return capturedGeneration !== currentGeneration;
}

/**
 * Editing the Ask text while an interpretation is in flight supersedes that
 * request: the citizen changed their mind, so the stale response for the
 * previous question must never populate the current one.
 */
export function shouldSupersedeInterpretation(input: {
  value: string;
  currentText: string;
  isInterpreting: boolean;
}): boolean {
  return input.value !== input.currentText && input.isInterpreting;
}

export type LanguageSwitchDecision =
  "request-draft" | "resolve" | "restore-result" | "none";

/**
 * Pure decision for what a language switch must do. Resolution is strictly
 * scoped to the Result/Search phases: a retained `verified_model` narration
 * re-runs resolution for a different selected language (even while `search`,
 * which a previous switch may have set), or restores the retained result when
 * the narration already matches. Draft regenerates only while the draft is
 * untouched. Every other phase (start/select/confirm/edited-draft/file/
 * acknowledgement) only swaps UI chrome — never navigation or a request.
 */
export function languageSwitchDecision(input: {
  phase: Phase;
  narration: NarrationState | undefined;
  narrationLanguage: Language | undefined;
  nextLanguage: Language;
  hasNeed: boolean;
  draftUntouched: boolean;
}): LanguageSwitchDecision {
  const {
    phase,
    narration,
    narrationLanguage,
    nextLanguage,
    hasNeed,
    draftUntouched,
  } = input;

  if (phase === "draft") {
    return hasNeed && draftUntouched ? "request-draft" : "none";
  }

  if (phase === "result" || phase === "search") {
    if (narration === "verified_model") {
      if (narrationLanguage !== nextLanguage) return "resolve";
      if (phase === "search") return "restore-result";
    }
  }

  return "none";
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

const COMMON_GEOGRAPHIES = [
  "All States/UTs",
  "New Delhi Railway Station",
  "A selected city or municipality",
  "A selected district",
  "A selected State/UT",
  "My EPFO account",
  "Another person's EPFO account",
  "EPFO account subject to confirmation",
  "Not yet specified",
];
const COMMON_PERIODS = [
  "2021 versus 2023",
  "Financial year 2024–25",
  "Current claim",
  "A selected calendar year",
  "A selected financial year",
  "Not specified",
  "Not yet specified",
];

function StructuredNeedInput({
  id,
  label,
  value,
  displayValue = value,
  options,
  displayOptions = options,
  customOption,
  customHelp,
  customAccepted,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  displayValue?: string;
  options: readonly string[];
  displayOptions?: readonly string[];
  customOption: string;
  customHelp: string;
  customAccepted: string;
  onChange: (value: string) => void;
}) {
  const isCustom = value.length > 0 && !options.includes(value);
  const isInvalid = value.trim().length === 0 || value === customOption;
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        list={`${id}-options`}
        value={displayValue}
        onChange={(event) =>
          onChange(
            event.target.value === customOption ? "" : event.target.value,
          )
        }
        aria-invalid={isInvalid}
      />
      <datalist id={`${id}-options`}>
        {displayOptions.map((option) => (
          <option value={option} key={option} />
        ))}
        <option value={customOption} />
      </datalist>
      <small className="field-help">
        {isCustom ? `${customHelp} ${customAccepted}` : customHelp}
      </small>
    </label>
  );
}

function ExternalLink({
  href,
  children,
  className,
  language,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  language?: Language;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="visually-hidden">
        {language === "hi" ? " (नए टैब में खुलेगा)" : " (opens in a new tab)"}
      </span>
    </a>
  );
}

function Details({
  onClose,
  copy,
  language,
}: {
  onClose: () => void;
  language: Language;
  copy: {
    cpcbCut: string;
    disclosure: string;
    closeDetails: string;
    verifiedRouteProfile: string;
    epfoRouteDetails: string;
    cpcbScenario: string;
    routeMetadataNote: string;
    details: string;
    officialSource: string;
    independentDetails: string;
    routeProfileVersion: (version: string, date: string) => string;
    routeMetadataDetails: (purpose: string, date: string) => string;
    cpcbDecision: (date: string) => string;
  };
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusDialog = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusDialog);
      previouslyFocused?.focus();
    };
  }, []);

  const keepFocusInDialog = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable.at(-1);
    if (
      event.shiftKey
        ? document.activeElement === first
        : document.activeElement === last
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog supporting-plane"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
        ref={dialogRef}
        onKeyDown={keepFocusInDialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{copy.disclosure}</p>
            <h2 id="details-title">{copy.details}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={copy.closeDetails}
          >
            ×
          </button>
        </div>
        <p>{copy.independentDetails}</p>
        <dl className="details-list">
          {DISCLOSURE_LEDGER.map((entry) => {
            const localizedEntry = localizeDisclosureEntry(entry, language);
            return (
              <div key={entry.id}>
                <dt>{localizedEntry.label}</dt>
                <dd>{localizedEntry.disclosure}</dd>
              </div>
            );
          })}
        </dl>
        <div className="route-provenance">
          <h3>{copy.verifiedRouteProfile}</h3>
          <p>
            {copy.routeProfileVersion(
              NORTHERN_RAILWAY_ROUTE.profile.version,
              NORTHERN_RAILWAY_ROUTE.profile.verifiedAt,
            )}
          </p>
          <ul>
            {NORTHERN_RAILWAY_ROUTE.profile.constraintSources?.map(
              (constraint) => (
                <li key={constraint.id}>
                  {localizeText(constraint.label, language)}{" "}
                  {constraint.sourceUrls.map((url) => (
                    <ExternalLink href={url} key={url} language={language}>
                      {copy.officialSource}
                    </ExternalLink>
                  ))}
                </li>
              ),
            )}
          </ul>
        </div>
        <div className="route-provenance">
          <h3>{copy.epfoRouteDetails}</h3>
          <p>
            {copy.routeMetadataDetails(
              EPFO_CLAIM_STATUS_ROUTE.purpose,
              EPFO_CLAIM_STATUS_ROUTE.verificationDate,
            )}
          </p>
          <p className="supporting-copy">{copy.routeMetadataNote}</p>
        </div>
        <div className="route-provenance">
          <h3>{copy.cpcbScenario}</h3>
          <p>{copy.cpcbCut}</p>
          <p>{copy.cpcbDecision(CPCB_CONFLICT_DECISION.decidedAt)}</p>
        </div>
      </section>
    </div>
  );
}

function CitationChallengeDialog({
  sourceTitle,
  onCancel,
  onConfirm,
  copy,
}: {
  sourceTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
  copy: {
    challengeDialogTitle: string;
    challengeDialogBody: (sourceTitle: string) => string;
    challengeDialogConsequence: string;
    cancel: string;
    confirmChallenge: string;
  };
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusDialog = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusDialog);
      previouslyFocused?.focus();
    };
  }, []);

  const keepFocusInDialog = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable.at(-1);
    if (
      event.shiftKey
        ? document.activeElement === first
        : document.activeElement === last
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="dialog supporting-plane"
        role="dialog"
        aria-modal="true"
        aria-labelledby="challenge-title"
        ref={dialogRef}
        onKeyDown={keepFocusInDialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{copy.challengeDialogTitle}</p>
            <h2 id="challenge-title">{sourceTitle}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onCancel}
            aria-label={copy.cancel}
          >
            ×
          </button>
        </div>
        <p>{copy.challengeDialogBody(sourceTitle)}</p>
        <p className="challenge-consequence">
          {copy.challengeDialogConsequence}
        </p>
        <div className="button-row">
          <button className="secondary-button" onClick={onCancel}>
            {copy.cancel}
          </button>
          <button className="action-button" onClick={onConfirm}>
            {copy.confirmChallenge}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function PreflightApp() {
  const filingModule = useMemo(() => createFilingModule(), []);
  const traceRecorder = useMemo(() => createTraceRecorder(), []);
  const journeyTraceId = useMemo(() => generateTraceId(), []);
  const [language, setLanguage] = useState<Language>("en");
  const [phase, setPhase] = useState<Phase>("start");
  const [text, setText] = useState("");
  const [needs, setNeeds] = useState<InformationNeed[]>([]);
  const [need, setNeed] = useState<InformationNeed | undefined>();
  const [result, setResult] = useState<RenderableResolution | undefined>();
  const [error, setError] = useState("");
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [challengedEvidenceId, setChallengedEvidenceId] = useState("");
  const [challengedNeedSignature, setChallengedNeedSignature] = useState("");
  const [challengeCandidateId, setChallengeCandidateId] = useState("");
  const [filingPackage, setFilingPackage] = useState<
    ValidatedFilingPackage | undefined
  >();
  const [draftText, setDraftText] = useState("");
  const [draftOriginalText, setDraftOriginalText] = useState("");
  const [draftError, setDraftError] = useState("");
  const [divergenceChoice, setDivergenceChoice] = useState("");
  const [filingStep, setFilingStep] = useState<DemoStep>("otp");
  const [otp, setOtp] = useState("");
  const [profile, setProfile] = useState<FictionalFilingProfile>(
    filingModule.demoProfile,
  );
  const [reviewed, setReviewed] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [filingError, setFilingError] = useState("");
  const [acknowledgement, setAcknowledgement] = useState<
    DemoAcknowledgement | undefined
  >();
  const [briefFeedback, setBriefFeedback] = useState("");
  const [savedPreflights, setSavedPreflights] = useState<SavedPreflight[]>([]);
  const [activeAiTask, setActiveAiTask] = useState<AiThinkingTask | null>(null);
  const [aiReturnPhase, setAiReturnPhase] = useState<Phase | null>(null);
  const draftRequestGeneration = useRef(0);
  const resolveRequestGeneration = useRef(0);
  const interpretRequestGeneration = useRef(0);
  const separatedDraftCounter = useRef(0);
  const [savedPreflightsLoaded, setSavedPreflightsLoaded] = useState(false);
  const [resumeState, setResumeState] = useState<SavedState | undefined>();
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const copy = COPY[language];
  const displayNeed = need ? localizeNeed(need, language) : undefined;
  const displayResult = result
    ? localizeResolution(result, language)
    : undefined;
  const displayProfile = localizeFilingProfile(profile, language);
  const displayAcknowledgement = acknowledgement
    ? {
        ...acknowledgement,
        holder: localizeText(acknowledgement.holder, language),
        submittedDraft: acknowledgement.submittedDraft,
      }
    : undefined;

  function invalidateFilingConfirmations() {
    setReviewed(false);
    setPaymentConfirmed(false);
    setAcknowledgement(undefined);
    setFilingError("");
    setFilingStep("otp");
  }

  function invalidatePreparedFiling() {
    draftRequestGeneration.current += 1;
    setActiveAiTask(null);
    setAiReturnPhase(null);
    invalidateFilingConfirmations();
    setFilingPackage(undefined);
    setDraftText("");
    setDraftOriginalText("");
    setDraftError("");
    setDivergenceChoice("");
    setFilingStep("otp");
    setOtp("");
    setProfile(filingModule.demoProfile);
    clearFilingStorage();
  }

  function changeLanguage(nextLanguage: Language) {
    if (nextLanguage === language) return;
    draftRequestGeneration.current += 1;
    resolveRequestGeneration.current += 1;
    interpretRequestGeneration.current += 1;
    setIsInterpreting(false);
    setActiveAiTask(null);
    setAiReturnPhase(null);
    const feedbackKeys = [
      "briefSaved",
      "briefShared",
      "technicalBriefSaved",
      "briefCancelled",
      "briefFailed",
      "packageSaved",
      "packageFailed",
    ] as const;
    const feedbackKey = feedbackKeys.find((key) => briefFeedback === copy[key]);
    if (feedbackKey) setBriefFeedback(COPY[nextLanguage][feedbackKey]);
    setLanguage(nextLanguage);
    const decision = languageSwitchDecision({
      phase,
      narration: result?.narration,
      narrationLanguage: result?.narrationLanguage,
      nextLanguage,
      hasNeed: Boolean(need),
      draftUntouched: draftText !== "" && draftText === draftOriginalText,
    });
    if (decision === "request-draft") requestDraft(nextLanguage);
    else if (decision === "resolve") void resolve(nextLanguage);
    else if (decision === "restore-result") setPhase("result");
  }

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!activeAiTask && phase !== "search") return;
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [activeAiTask, phase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSavedPreflights(readSavedPreflights());
      setSavedPreflightsLoaded(true);
      const hadSavedState = Boolean(window.localStorage.getItem(RESEARCH_KEY));
      const saved = readPersistedState();
      if (!saved) {
        setRecoveryNotice(hadSavedState);
        return;
      }
      setResumeState(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isResearchPhase(phase)) return;
    persist({
      phase,
      text,
      needs,
      need,
      result,
      language,
      challengedEvidenceId: challengedEvidenceId || undefined,
      challengedNeedSignature: challengedNeedSignature || undefined,
    });
  }, [
    phase,
    text,
    needs,
    need,
    result,
    language,
    challengedEvidenceId,
    challengedNeedSignature,
  ]);

  useEffect(() => {
    if (!savedPreflightsLoaded) return;
    try {
      window.localStorage.setItem(
        SAVED_PREFLIGHTS_KEY,
        JSON.stringify(savedPreflights),
      );
    } catch {
      /* optional saved-preflight persistence */
    }
  }, [savedPreflights, savedPreflightsLoaded]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const { state: saved, recoveryNeeded } = loadSessionFilingState();
      if (recoveryNeeded) setRecoveryNotice(true);
      if (!saved) return;
      setNeeds([saved.need]);
      setNeed(saved.need);
      setDraftText(saved.draftText);
      setDraftOriginalText(saved.draftText);
      setFilingPackage(saved.package);
      setFilingStep(saved.step);
      setOtp(saved.otp);
      setProfile(saved.profile);
      setReviewed(saved.reviewed);
      setPaymentConfirmed(saved.paymentConfirmed);
      setAcknowledgement(saved.acknowledgement);
      setLanguage(saved.language ?? "en");
      setPhase(saved.phase);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "draft" && phase !== "file" && phase !== "acknowledgement")
      return;
    if (!need) return;
    try {
      window.sessionStorage.setItem(
        FILING_KEY,
        JSON.stringify({
          version: 2,
          state: {
            phase,
            need,
            draftText,
            package: filingPackage,
            step: filingStep,
            otp,
            profile,
            reviewed,
            paymentConfirmed,
            acknowledgement,
            language,
          } satisfies SessionFilingState,
        } satisfies PersistedEnvelope<SessionFilingState>),
      );
    } catch {
      /* optional session persistence */
    }
  }, [
    phase,
    draftText,
    filingPackage,
    filingStep,
    otp,
    profile,
    reviewed,
    paymentConfirmed,
    acknowledgement,
    language,
    need,
  ]);

  const updateNeed = (field: keyof InformationNeed, value: string) => {
    if (!need) return;
    draftRequestGeneration.current += 1;
    const canonicalValue = [
      "measure",
      "geography",
      "period",
      "breakdown",
      "informationHolder",
    ].includes(field)
      ? canonicalizeNeedValue(value, language)
      : value;
    const next = { ...need, [field]: canonicalValue } as InformationNeed;
    if (
      next.presentation &&
      [
        "canonicalNeed",
        "measure",
        "geography",
        "period",
        "breakdown",
        "informationHolder",
      ].includes(field)
    ) {
      next.presentation = undefined;
    }
    if (
      next.scenario === "unsupported" &&
      next.informationHolder !== "To be confirmed" &&
      next.informationHolder !== "Unknown" &&
      next.geography !== "Not yet specified" &&
      next.period !== "Not yet specified"
    )
      next.unresolvedClarifications = [];
    if (draftText && filingNeedSignature(need) !== filingNeedSignature(next)) {
      invalidatePreparedFiling();
    }
    if (result) {
      setResult(undefined);
      if (!filingPackage) {
        setDraftText("");
        setDraftOriginalText("");
      }
    }
    setNeed(next);
  };
  const pendingClarifications =
    need?.unresolvedClarifications.filter(
      (item) => !isUnknownClarification(item),
    ) ?? [];
  const retainedUnknownClarifications =
    need?.unresolvedClarifications.filter(isUnknownClarification) ?? [];
  function resumePrevious() {
    if (!resumeState) return;
    setPhase(resumeState.phase);
    setText(resumeState.text);
    setNeeds(resumeState.needs ?? (resumeState.need ? [resumeState.need] : []));
    setNeed(resumeState.need);
    setResult(resumeState.result);
    setChallengedEvidenceId(resumeState.challengedEvidenceId ?? "");
    setChallengedNeedSignature(resumeState.challengedNeedSignature ?? "");
    setChallengeCandidateId("");
    setResumeState(undefined);
  }

  function requestDraft(targetLanguage: Language) {
    if (!need) return;
    setAiReturnPhase(phase);
    setActiveAiTask("draft");
    invalidateFilingConfirmations();
    const guidedCoverage = isNorthernRailwayGuidedNeed(need);
    const generation = ++draftRequestGeneration.current;
    const requestSignature = filingNeedSignature(need);
    void fetch("/api/draft", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rti-trace-id": journeyTraceId,
      },
      body: JSON.stringify({
        need,
        language: targetLanguage,
        ...(guidedCoverage ? { route: { id: NORTHERN_RAILWAY_ROUTE.id } } : {}),
        maxChars: guidedCoverage
          ? NORTHERN_RAILWAY_ROUTE.profile.text.maxChars
          : 3_000,
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          draft?: { text?: string };
          filingPackage?: ValidatedFilingPackage;
          guidedCoverage?: boolean;
          message?: string;
        };
        if (!response.ok || typeof payload.draft?.text !== "string")
          throw new Error(
            payload.message ?? COPY[targetLanguage].prepareFailure,
          );
        if (
          !need ||
          shouldDiscardDraftResponse({
            capturedGeneration: generation,
            currentGeneration: draftRequestGeneration.current,
            capturedSignature: requestSignature,
            currentSignature: filingNeedSignature(need),
            draftEdited: Boolean(draftText && draftText !== draftOriginalText),
          })
        )
          return;
        if (payload.guidedCoverage && payload.filingPackage) {
          traceRecorder.record("route.validated", journeyTraceId, {
            component: "filing-route",
            version: payload.filingPackage.route.profile.version,
            status: "working",
            code: payload.filingPackage.route.id,
          });
        }
        setFilingPackage(payload.filingPackage);
        setDraftText(payload.draft.text);
        setDraftOriginalText(payload.draft.text);
        setFilingError("");
        setActiveAiTask(null);
        setAiReturnPhase(null);
        setPhase("draft");
      })
      .catch(() => {
        if (generation !== draftRequestGeneration.current) return;
        setActiveAiTask(null);
        setAiReturnPhase(null);
        setDraftError(COPY[targetLanguage].prepareFailure);
        setPhase("draft");
      });
  }

  function cancelAiWork() {
    if (!activeAiTask) return;
    if (activeAiTask === "interpretation") {
      interpretRequestGeneration.current += 1;
      setIsInterpreting(false);
      setPhase("start");
    } else if (activeAiTask === "resolution") {
      resolveRequestGeneration.current += 1;
      setPhase("confirm");
    } else {
      draftRequestGeneration.current += 1;
      setDraftError("");
      setPhase(aiReturnPhase === "result" ? "result" : "confirm");
    }
    setActiveAiTask(null);
    setAiReturnPhase(null);
  }

  function openDraft() {
    if (!need) return;
    if (holderNeedsClarification) {
      setPhase("confirm");
      return;
    }
    setDraftError("");
    setDivergenceChoice("");
    if (
      filingPackage?.draft.needId === need.id &&
      filingNeedSignature(filingPackage.confirmedNeed) ===
        filingNeedSignature(need)
    ) {
      setPhase("draft");
      return;
    }
    if (draftText && draftText !== draftOriginalText) {
      // The first citizen edit makes the stored draft authoritative.
      setPhase("draft");
      return;
    }
    requestDraft(language);
  }

  function confirmNeed() {
    if (!need) return;
    if (informationNeedEditErrors(need).length > 0) {
      setError(copy.invalidNeed);
      return;
    }
    const explicitDrafting = Boolean(
      need.draftingIntent ?? hasExplicitDraftingIntent(need.originalText),
    );
    if (
      holderNeedsClarification &&
      shouldPreferDraftingRoute({ ...need, draftingIntent: explicitDrafting })
    ) {
      setError("");
      setPhase("confirm");
      return;
    }
    if (
      shouldPreferDraftingRoute({ ...need, draftingIntent: explicitDrafting })
    ) {
      openDraft();
      return;
    }
    void resolve();
  }

  function editConfirmedNeed() {
    setError("");
    setResult(undefined);
    invalidatePreparedFiling();
    resolveRequestGeneration.current += 1;
    setPhase("confirm");
  }

  function draftValidation() {
    if (!filingPackage) return undefined;
    return validateDraft(draftText, filingPackage.route.profile);
  }

  function continueToFiling() {
    const validation = draftValidation();
    if (!filingPackage || !validation) {
      setDraftError(copy.guidedUnavailable);
      return;
    }
    if (!validation.valid) {
      setDraftError(
        validation.errors
          .map((message) => localizeMessage(message, language))
          .join(" "),
      );
      return;
    }
    if (need && detectDraftDivergence(need, draftText).diverged) {
      setDraftError(copy.revalidationError);
      return;
    }
    const updatedPackage = {
      ...filingPackage,
      draft: { ...filingPackage.draft, text: draftText },
      validation,
    } satisfies ValidatedFilingPackage;
    invalidateFilingConfirmations();
    setFilingPackage(updatedPackage);
    setFilingError("");
    setFilingStep("otp");
    setPhase("file");
  }

  function handleDraftChange(value: string) {
    if (value !== draftText) {
      invalidateFilingConfirmations();
      draftRequestGeneration.current += 1;
    }
    setDraftText(value);
    setDraftError("");
    setDivergenceChoice("");
  }

  function separateDraftIntoNewPreflight() {
    separatedDraftCounter.current += 1;
    const original: SavedPreflight = {
      id: `${need?.id ?? "preflight"}-original`,
      label: copy.originalNeed,
      text,
      phase: "draft",
      need,
      result,
      draftText,
      draftOriginalText,
      filingPackage,
      language,
    };
    const separated: SavedPreflight = {
      id: `${need?.id ?? "preflight"}-separated-${separatedDraftCounter.current}`,
      label: copy.separatedDraft,
      text: draftText,
      language,
    };
    setSavedPreflights((current) => [
      ...current.filter((item) => item.id !== original.id),
      original,
      separated,
    ]);
    setText(draftText);
    setNeeds([]);
    setNeed(undefined);
    setResult(undefined);
    invalidatePreparedFiling();
    setPhase("start");
    setDivergenceChoice("separate");
  }

  function resumeSavedPreflight(saved: SavedPreflight) {
    const restored = restoreSavedPreflightForLanguage(saved, language);
    if (filingPackage) invalidatePreparedFiling();
    setText(restored.text);
    setNeeds(restored.need ? [restored.need] : []);
    setNeed(restored.need);
    setResult(restored.result);
    setFilingPackage(restored.filingPackage);
    setDraftText(restored.draftText ?? "");
    setDraftOriginalText(
      restored.draftOriginalText ?? restored.draftText ?? "",
    );
    setPhase(restored.phase ?? (restored.result ? "result" : "start"));
  }

  function saveCurrentDraft() {
    if (!need || !filingPackage || draftDiverged || draftIsInvalid) return;
    const saved: SavedPreflight = {
      id: `${need.id}-saved-${Date.now()}`,
      label: copy.savedDraft,
      text,
      phase: "draft",
      need,
      result,
      draftText,
      draftOriginalText,
      filingPackage: {
        ...filingPackage,
        draft: { ...filingPackage.draft, text: draftText },
        validation: draftValidation()!,
      },
      language,
    };
    setSavedPreflights((current) => [...current, saved]);
  }

  function challengeEvidence(evidenceId: string) {
    if (!need) return;
    setChallengeCandidateId(evidenceId);
  }

  function confirmCitationChallenge() {
    if (!need || !challengeCandidateId) return;
    setChallengedEvidenceId(challengeCandidateId);
    setChallengedNeedSignature(needSignature(need));
    setChallengeCandidateId("");
    traceRecorder.record(
      "evidence.rejected",
      result?.traceId ?? journeyTraceId,
      {
        component: "grounding-gate",
        version: "grounding-gate-v1",
        status: "downgraded",
        code: "citizen-challenge",
      },
    );
  }

  function finishDemoSubmission() {
    if (!filingPackage || !reviewed || !paymentConfirmed) return;
    const traceId = result?.traceId ?? journeyTraceId;
    filingModule
      .demoSubmit({
        package: filingPackage,
        confirmation: {
          otp,
          profile,
          reviewed,
          payment: { method: "demo_upi", amountInr: 10 },
        },
      })
      .then((completed) => {
        traceRecorder.record("filing.acknowledged", traceId, {
          component: "demo-adapter",
          version: "demo-adapter-v1",
          status: "simulated",
          code: "demo-submission-complete",
        });
        setAcknowledgement(completed);
        setFilingStep("confirmation");
        setPhase("acknowledgement");
      })
      .catch(() => {
        traceRecorder.record("filing.acknowledged", traceId, {
          component: "demo-adapter",
          version: "demo-adapter-v1",
          status: "rejected",
          code: "demo-submission-rejected",
        });
        setFilingError(copy.demoSubmissionFailure);
      });
  }

  async function downloadPackage() {
    if (!filingPackage || !acknowledgement || !need) return;
    setBriefFeedback("");
    try {
      const { createFilingPackagePdf, FILING_PACKAGE_PDF_FILENAME } =
        await import("../filing/package-pdf");
      const blob = await createFilingPackagePdf(
        {
          package: filingPackage,
          profile,
          fee: { amountInr: 10, method: "demo_upi" },
          acknowledgement,
        },
        language,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = FILING_PACKAGE_PDF_FILENAME;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBriefFeedback(copy.packageSaved);
    } catch {
      setBriefFeedback(copy.packageFailed);
    }
  }

  async function saveOrShareEvidenceBrief() {
    if (!need || !result) return;
    setBriefFeedback("");
    try {
      const exportResult = localizeResolution(
        resultForCitationReview(result, citationReview),
        language,
      );
      const input = {
        need: localizeNeed(need, language),
        result: exportResult,
        searchDate:
          result.executionReceipt?.executedAt.slice(0, 10) ??
          new Date().toISOString().slice(0, 10),
        language,
      };
      const { createEvidenceBriefPdf, evidenceBriefPdfFilename } =
        await import("../evidence/brief-pdf");
      const blob = await createEvidenceBriefPdf(input);
      const file = new File(
        [blob],
        evidenceBriefPdfFilename(input.searchDate),
        {
          type: "application/pdf",
        },
      );
      if (
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        try {
          await navigator.share({
            title:
              language === "hi"
                ? "RTI प्रमाण सारांश"
                : "RTI Tathya Evidence Brief",
            text:
              language === "hi"
                ? "स्वतंत्र शोध सहायक — आधिकारिक RTI उत्तर नहीं।"
                : "Independent research assistant—not an official RTI response.",
            files: [file],
          });
          setBriefFeedback(copy.briefShared);
          return;
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "AbortError") {
            setBriefFeedback(copy.briefCancelled);
            return;
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = evidenceBriefPdfFilename(input.searchDate);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBriefFeedback(copy.briefSaved);
    } catch {
      setBriefFeedback(copy.briefFailed);
    }
  }

  async function downloadTechnicalEvidenceBrief() {
    if (!need || !result) return;
    setBriefFeedback("");
    try {
      const exportResult = localizeResolution(
        resultForCitationReview(result, citationReview),
        language,
      );
      const { serializeEvidenceBrief } = await import("../evidence/brief");
      const serialized = serializeEvidenceBrief({
        need: localizeNeed(need, language),
        result: exportResult,
        searchDate:
          result.executionReceipt?.executedAt.slice(0, 10) ??
          new Date().toISOString().slice(0, 10),
        language,
      });
      const blob = new Blob([serialized], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "rti-tathya-evidence-brief.json";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBriefFeedback(copy.technicalBriefSaved);
    } catch {
      setBriefFeedback(copy.briefFailed);
    }
  }

  /**
   * Editing the Ask text supersedes any in-flight interpretation so a stale
   * response for the previous question can never populate the next question.
   */
  function updateAskText(value: string) {
    if (
      shouldSupersedeInterpretation({
        value,
        currentText: text,
        isInterpreting,
      })
    ) {
      interpretRequestGeneration.current += 1;
      setIsInterpreting(false);
      setActiveAiTask(null);
      setAiReturnPhase(null);
    }
    setText(value);
  }

  async function interpret() {
    if (!text.trim() || isInterpreting) return;
    setError("");
    const generation = ++interpretRequestGeneration.current;
    setIsInterpreting(true);
    setAiReturnPhase("start");
    setActiveAiTask("interpretation");
    traceRecorder.record("interpretation.started", journeyTraceId, {
      component: "interpretation-route",
      version: "interpretation-route-v1",
      status: "started",
    });
    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rti-trace-id": journeyTraceId,
        },
        body: JSON.stringify({ text, language }),
      });
      const payload = (await response.json()) as NeedInterpretation & {
        message?: string;
      };
      if (!response.ok || !payload.needs?.length)
        throw new Error(
          payload.message ??
            "We couldn’t interpret your request just now. Nothing was submitted.",
        );
      if (isStaleRequest(generation, interpretRequestGeneration.current))
        return;
      traceRecorder.record("interpretation.completed", payload.traceId, {
        component: "interpretation-route",
        version: "interpretation-route-v1",
        status: "ok",
        counts: { needs: payload.needs.length },
      });
      setNeeds(payload.needs);
      setNeed(payload.needs[0]);
      setActiveAiTask(null);
      setAiReturnPhase(null);
      setPhase(payload.needs.length > 1 ? "select" : "confirm");
    } catch (caught) {
      if (isStaleRequest(generation, interpretRequestGeneration.current))
        return;
      traceRecorder.record("interpretation.completed", journeyTraceId, {
        component: "interpretation-route",
        version: "interpretation-route-v1",
        status: "error",
        code: "interpretation-unavailable",
      });
      setError(
        localizeMessage(
          caught instanceof Error
            ? caught.message
            : "We couldn’t interpret your request just now. Nothing was submitted.",
          language,
        ),
      );
      setActiveAiTask(null);
      setAiReturnPhase(null);
    } finally {
      if (generation === interpretRequestGeneration.current) {
        setIsInterpreting(false);
        setActiveAiTask(null);
        setAiReturnPhase(null);
      }
    }
  }
  async function resolve(overrideLanguage?: Language) {
    if (!need) return;
    const targetLanguage = overrideLanguage ?? language;
    if (
      challengedEvidenceId &&
      challengedNeedSignature === needSignature(need)
    ) {
      setError(
        localizeMessage(
          "Change and reconfirm the Information Need before rechecking this challenged source.",
          targetLanguage,
        ),
      );
      setPhase("confirm");
      return;
    }
    setError("");
    setPhase("search");
    setAiReturnPhase("confirm");
    setActiveAiTask("resolution");
    const generation = ++resolveRequestGeneration.current;
    traceRecorder.record("resolution.started", journeyTraceId, {
      component: "resolution-route",
      version: "resolution-route-v1",
      status: "started",
    });
    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rti-trace-id": journeyTraceId,
        },
        body: JSON.stringify({ need, language: targetLanguage }),
      });
      const payload = (await response.json()) as RenderableResolution & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ??
            "We couldn’t check the prototype snapshot just now.",
        );
      if (isStaleRequest(generation, resolveRequestGeneration.current)) return;
      traceRecorder.record("resolution.completed", payload.traceId, {
        component: "resolution-route",
        version:
          payload.calculationMetadata?.engineVersion ?? "resolution-route-v1",
        hash:
          payload.calculationMetadata?.engineHash ??
          payload.executionReceipt?.snapshotHash,
        status: "ok",
        code: payload.outcome,
        counts: {
          evidence: payload.evidence.length,
          rows: payload.rows.length,
        },
      });
      setResult(payload);
      setChallengedEvidenceId("");
      setChallengedNeedSignature("");
      setChallengeCandidateId("");
      setActiveAiTask(null);
      setAiReturnPhase(null);
      setPhase("result");
    } catch (caught) {
      if (isStaleRequest(generation, resolveRequestGeneration.current)) return;
      traceRecorder.record("resolution.completed", journeyTraceId, {
        component: "resolution-route",
        version: "resolution-route-v1",
        status: "error",
        code: "resolution-unavailable",
      });
      setError(
        localizeMessage(
          caught instanceof Error
            ? caught.message
            : "We couldn’t check the prototype snapshot just now.",
          targetLanguage,
        ),
      );
      setActiveAiTask(null);
      setAiReturnPhase(null);
      setPhase("confirm");
    }
  }
  function reset() {
    draftRequestGeneration.current += 1;
    resolveRequestGeneration.current += 1;
    interpretRequestGeneration.current += 1;
    setIsInterpreting(false);
    setActiveAiTask(null);
    setAiReturnPhase(null);
    setPhase("start");
    setText("");
    setNeeds([]);
    setNeed(undefined);
    setResult(undefined);
    setChallengedEvidenceId("");
    setChallengedNeedSignature("");
    setChallengeCandidateId("");
    setFilingPackage(undefined);
    setDraftText("");
    setDraftOriginalText("");
    setDraftError("");
    setDivergenceChoice("");
    setFilingStep("otp");
    setOtp("");
    setProfile(filingModule.demoProfile);
    setReviewed(false);
    setPaymentConfirmed(false);
    setFilingError("");
    setAcknowledgement(undefined);
    setBriefFeedback("");
    setSavedPreflights([]);
    setError("");
    try {
      clearPrototypeStorage();
      window.localStorage.removeItem(SAVED_PREFLIGHTS_KEY);
    } catch {
      /* no-op */
    }
    setResumeState(undefined);
  }

  function returnFromDraft() {
    draftRequestGeneration.current += 1;
    setPhase(draftReturnPhase(Boolean(result)));
  }

  /** Navigate back to Ask while invalidating any in-flight draft or resolution request. */
  function returnToAsk() {
    draftRequestGeneration.current += 1;
    resolveRequestGeneration.current += 1;
    interpretRequestGeneration.current += 1;
    setIsInterpreting(false);
    setActiveAiTask(null);
    setAiReturnPhase(null);
    setPhase("start");
  }
  const citationReview: CitationReviewState = challengeCandidateId
    ? { status: "awaiting-confirmation", evidenceId: challengeCandidateId }
    : challengedEvidenceId
      ? { status: "downgraded", evidenceId: challengedEvidenceId }
      : { status: "idle" };
  const displayOutcome = resultOutcomeAfterCitationReview(
    result?.outcome,
    citationReview,
  );
  const challengedSourceTitle = result?.evidence.find(
    (item) => item.id === challengeCandidateId,
  )?.sourceTitle;
  const draftDiverged = Boolean(
    need && detectDraftDivergence(need, draftText).diverged,
  );
  const draftIsInvalid = draftValidation()?.valid === false;
  const prefersDraftingRoute = Boolean(
    need &&
    shouldPreferDraftingRoute({
      ...need,
      draftingIntent:
        need.draftingIntent ?? hasExplicitDraftingIntent(need.originalText),
    }),
  );
  const holderNeedsClarification = Boolean(
    need &&
    need.informationHolderStatus !== "verified" &&
    (need.informationHolder === "Unknown" ||
      need.informationHolder === "To be confirmed"),
  );
  const statusClass = useMemo(
    () => displayOutcome?.toLocaleLowerCase().replaceAll("_", "-") ?? "",
    [displayOutcome],
  );
  const resultLabel = displayOutcome
    ? language === "hi"
      ? outcomeLabelHi[displayOutcome]
      : outcomeLabel[displayOutcome]
    : "";

  return (
    <main className="app-shell">
      <header className="topbar">
        <p className="topbar-identity">
          <Icon name="info" /> {copy.independent}
        </p>
        <button className="text-button" onClick={() => setDetailsOpen(true)}>
          {copy.details} <Icon name="external" />
        </button>
        {phase !== "start" && (
          <button className="text-button global-restart" onClick={reset}>
            {copy.restart}
          </button>
        )}
      </header>
      <div className="brand-row">
        <div className="wordmark">
          <Image
            className="wordmark-logo"
            src="/rti-tathya-logo.png"
            alt="RTI Tathya logo"
            width={1254}
            height={1254}
            priority
          />
          <span className="wordmark-name">RTI Tathya</span>
        </div>
        <button
          className={`language-toggle language-toggle-${language}`}
          onClick={() => changeLanguage(language === "en" ? "hi" : "en")}
          aria-label={`Switch language to ${copy.language}`}
        >
          {copy.language}
        </button>
      </div>

      {activeAiTask && (
        <AiThinkingScreen
          task={activeAiTask}
          copy={copy}
          onCancel={cancelAiWork}
        />
      )}
      {phase === "start" && !activeAiTask && (
        <section className="start-layout" aria-labelledby="start-title">
          <div className="intro">
            <p className="eyebrow">{copy.askStage}</p>
            <h1 id="start-title">{copy.headline}</h1>
            <p className="lede">{copy.supporting}</p>
          </div>
          {recoveryNotice && (
            <p className="error-message" role="status">
              {copy.recoveryNotice}
            </p>
          )}
          {resumeState && (
            <aside className="resume-panel" aria-label={copy.resumeTitle}>
              <strong>{copy.resumeTitle}</strong>
              <p>{copy.resumeBody}</p>
              <div className="button-row">
                <button className="action-button" onClick={resumePrevious}>
                  {copy.resume}
                </button>
                <button className="secondary-button" onClick={reset}>
                  {copy.startFresh}
                </button>
              </div>
            </aside>
          )}
          <section
            className="active-plane ask-plane"
            aria-label={copy.askAria}
            aria-busy={isInterpreting}
          >
            <label htmlFor="need-input">{copy.label}</label>
            <textarea
              id="need-input"
              value={text}
              onChange={(event) => updateAskText(event.target.value)}
              rows={5}
              placeholder={copy.placeholder}
            />
            <p className="privacy-note">
              <Icon name="info" /> {copy.privacy}
            </p>
            {error && (
              <p className="error-message" role="alert">
                <Icon name="warning" />
                {error}
              </p>
            )}
            <button
              className="action-button"
              disabled={!text.trim() || isInterpreting}
              onClick={interpret}
              aria-label={isInterpreting ? copy.interpreting : copy.submit}
            >
              {copy.submit}
            </button>
            <p className="supporting-copy ask-reassurance">
              {copy.askReassurance}
            </p>
          </section>
          <details className="examples supporting-plane" open>
            <summary>
              <span>{copy.examples}</span>
              <span className="disclosure-affordance" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="scenario-list">
              {SCENARIO_PROMPTS.map((scenario) => (
                <button
                  key={scenario.id}
                  className="scenario"
                  aria-label={
                    language === "hi" ? scenario.hiLabel : scenario.label
                  }
                  onClick={() =>
                    updateAskText(
                      language === "hi" ? scenario.hiPrompt : scenario.prompt,
                    )
                  }
                >
                  <span>
                    {language === "hi" ? scenario.hiPrompt : scenario.prompt}
                  </span>
                  <Icon name="external" />
                </button>
              ))}
            </div>
          </details>
          {savedPreflights.length > 0 && (
            <section
              className="saved-preflights supporting-plane"
              aria-labelledby="saved-preflights-title"
            >
              <h2 id="saved-preflights-title">{copy.savedPreflights}</h2>
              {savedPreflights.map((saved) => (
                <div className="saved-preflight" key={saved.id}>
                  <span>{saved.label}</span>
                  <button
                    className="text-button"
                    onClick={() => resumeSavedPreflight(saved)}
                  >
                    {copy.resume}
                  </button>
                </div>
              ))}
            </section>
          )}
        </section>
      )}

      {phase === "select" && !activeAiTask && (
        <section className="content-column" aria-labelledby="select-title">
          <p className="eyebrow">{copy.multipleStage}</p>
          <h1 id="select-title">{copy.selectTitle}</h1>
          <p className="lede">{copy.selectIntro}</p>
          <div className="need-options active-plane">
            {needs.map((candidate) => {
              const displayCandidate = localizeNeed(candidate, language);
              return (
                <button
                  key={candidate.id}
                  className="need-option"
                  onClick={() => {
                    setNeed(candidate);
                    setPhase("confirm");
                  }}
                >
                  <span>{displayCandidate.canonicalNeed}</span>
                  <small>{candidate.originalText}</small>
                </button>
              );
            })}
            <p className="supporting-copy">{copy.oneNeed}</p>
          </div>
        </section>
      )}

      {phase === "confirm" && !activeAiTask && need && (
        <section className="content-column" aria-labelledby="confirm-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.confirmStage}</p>
              <h1 id="confirm-title">{copy.confirm}</h1>
            </div>
            <button className="text-button" onClick={returnToAsk}>
              {copy.edit}
            </button>
          </div>
          <p className="lede">{copy.confirmIntro}</p>
          <div className="active-plane need-card">
            <p className="card-kicker">{need.originalText}</p>
            <Field
              label={copy.measure}
              value={displayNeed?.measure ?? need.measure}
              onChange={(value) => updateNeed("measure", value)}
            />
            <div className="field-grid">
              <StructuredNeedInput
                id="need-geography"
                label={copy.geography}
                value={need.geography}
                options={COMMON_GEOGRAPHIES}
                displayValue={displayNeed?.geography ?? need.geography}
                displayOptions={COMMON_GEOGRAPHIES.map((option) =>
                  localizeText(option, language),
                )}
                customOption={copy.customOption}
                customHelp={copy.customHelp}
                customAccepted={copy.customAccepted}
                onChange={(value) => updateNeed("geography", value)}
              />
              <StructuredNeedInput
                id="need-period"
                label={copy.period}
                value={need.period}
                options={COMMON_PERIODS}
                displayValue={displayNeed?.period ?? need.period}
                displayOptions={COMMON_PERIODS.map((option) =>
                  localizeText(option, language),
                )}
                customOption={copy.customOption}
                customHelp={copy.customHelp}
                customAccepted={copy.customAccepted}
                onChange={(value) => updateNeed("period", value)}
              />
            </div>
            <Field
              label={copy.breakdown}
              value={displayNeed?.breakdown ?? need.breakdown}
              onChange={(value) => updateNeed("breakdown", value)}
            />
            <Field
              label={copy.holder}
              value={displayNeed?.informationHolder ?? need.informationHolder}
              onChange={(value) => updateNeed("informationHolder", value)}
            />
            <label className="field">
              <span>{copy.preference}</span>
              <select
                value={need.resolutionPreference}
                onChange={(event) =>
                  updateNeed(
                    "resolutionPreference",
                    event.target.value as ResolutionPreference,
                  )
                }
              >
                <option value="published">{copy.prefPublished}</option>
                <option value="formal">{copy.prefFormal}</option>
                <option value="unsure">{copy.prefUnsure}</option>
              </select>
            </label>
            {pendingClarifications.map((clarification) => (
              <div className="clarification status-partial" key={clarification}>
                <strong>{copy.clarification}</strong>
                <p>{clarificationDisplay(need, clarification, language)}</p>
                <p className="supporting-copy">{copy.unknownClarification}</p>
                <button
                  className="quiet-button"
                  onClick={() =>
                    setNeed({
                      ...need,
                      informationHolder:
                        need.informationHolder === "To be confirmed"
                          ? "Unknown"
                          : need.informationHolder,
                      unresolvedClarifications:
                        need.unresolvedClarifications.map((item) =>
                          item === clarification ? `Unknown: ${item}` : item,
                        ),
                    })
                  }
                >
                  {copy.unsure}
                </button>
              </div>
            ))}
            {retainedUnknownClarifications.map((clarification) => (
              <div className="clarification status-partial" key={clarification}>
                <strong>{copy.clarification}</strong>
                <p>{clarificationDisplay(need, clarification, language)}</p>
                <p className="supporting-copy">{copy.unknownRetained}</p>
              </div>
            ))}
            {error && (
              <p className="error-message" role="alert">
                <span aria-hidden="true">!</span>
                {error}
              </p>
            )}
            {informationNeedEditErrors(need).length > 0 && !error && (
              <p className="error-message" role="alert">
                <span aria-hidden="true">!</span>
                {copy.invalidNeed}
              </p>
            )}
            <div className="button-row">
              <button
                className="action-button"
                disabled={
                  pendingClarifications.length > 0 ||
                  informationNeedEditErrors(need).length > 0
                }
                onClick={confirmNeed}
              >
                {holderNeedsClarification && prefersDraftingRoute
                  ? copy.clarifyHolder
                  : prefersDraftingRoute
                    ? copy.prepare
                    : copy.search}
              </button>
            </div>
          </div>
        </section>
      )}

      {phase === "search" && !activeAiTask && (
        <AiThinkingScreen
          task="resolution"
          copy={copy}
          onCancel={returnToAsk}
        />
      )}

      {phase === "result" && !activeAiTask && result && (
        <section className="content-column" aria-labelledby="result-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.resultStage}</p>
              <h1 id="result-title">{copy.result}</h1>
            </div>
            <button className="text-button" onClick={editConfirmedNeed}>
              {copy.back}
            </button>
          </div>
          <article className={`result-plane status-${statusClass}`}>
            <div className="status-line">
              <span className="status-icon" aria-hidden="true">
                {displayOutcome === "DERIVED_FINDING"
                  ? "✓"
                  : displayOutcome === "NO_RELIABLE_FINDING"
                    ? "!"
                    : "ⓘ"}
              </span>
              <span>{resultLabel}</span>
            </div>
            <p className="research-notice" role="status">
              <Icon name="info" /> {copy.researchNotice}
            </p>
            <h2>{displayResult?.headline}</h2>
            <p className="result-meaning">{displayResult?.meaning}</p>
            <p className="evidence-status">{displayResult?.evidenceStatus}</p>
            {retainedUnknownClarifications.length > 0 && (
              <div className="clarification status-partial" role="note">
                <strong>{copy.clarification}</strong>
                {retainedUnknownClarifications.map((clarification) => (
                  <p key={clarification}>
                    {clarificationDisplay(need, clarification, language)}
                  </p>
                ))}
                <p className="supporting-copy">{copy.unknownRetained}</p>
              </div>
            )}
            {challengedEvidenceId && (
              <p className="error-message" role="status">
                <span aria-hidden="true">!</span>
                {copy.challengePending}
              </p>
            )}
            {result.evidence.length > 0 && (
              <div className="evidence-list" aria-label={copy.evidence}>
                <h3>{copy.evidence}</h3>
                {displayResult?.evidence.map((item) => (
                  <article className="evidence-card" key={item.id}>
                    <p className="evidence-type">
                      {item.sourceType === "official_dataset"
                        ? copy.sourceData
                        : item.sourceType === "official_service_route"
                          ? copy.officialRoute
                          : copy.syntheticFixture}
                    </p>
                    <h3>{item.sourceTitle}</h3>
                    {item.syntheticDisclosure && (
                      <p className="synthetic-watermark" role="note">
                        {item.syntheticDisclosure}
                      </p>
                    )}
                    <p>{item.extract}</p>
                    <dl>
                      <div>
                        <dt>{copy.publisher}</dt>
                        <dd>{item.publisher}</dd>
                      </div>
                      <div>
                        <dt>{copy.applicablePeriod}</dt>
                        <dd>{item.applicablePeriod}</dd>
                      </div>
                      <div>
                        <dt>{copy.locatedValues}</dt>
                        <dd>
                          {item.grounding.length > 0
                            ? copy.immutableReferences(item.grounding.length)
                            : copy.noPersonalRecord}
                        </dd>
                      </div>
                    </dl>
                    {item.url ? (
                      <ExternalLink href={item.url} language={language}>
                        {item.sourceType === "official_service_route"
                          ? copy.openRoute
                          : copy.openSource}
                      </ExternalLink>
                    ) : (
                      <p className="supporting-copy">
                        {item.syntheticDisclosure}
                      </p>
                    )}
                    {item.sourceType === "official_service_route" &&
                      displayResult?.serviceRoute && (
                        <div className="route-metadata">
                          <p>
                            {displayResult.serviceRoute.purpose} ·{" "}
                            {copy.verifiedWord}{" "}
                            {displayResult.serviceRoute.verifiedAt}
                          </p>
                          <p className="supporting-copy">
                            {copy.routeMetadataNote}
                          </p>
                        </div>
                      )}
                    {!challengedEvidenceId &&
                      item.sourceType !== "official_service_route" &&
                      item.sourceType !== "rti_response_fixture" && (
                        <button
                          className="quiet-button challenge-button"
                          onClick={() => challengeEvidence(item.id)}
                        >
                          {copy.challenge}
                        </button>
                      )}
                    {(item.alternateUrl || item.grounding.length > 0) && (
                      <details className="evidence-inspection">
                        <summary>{copy.inspectEvidence}</summary>
                        <dl>
                          <div>
                            <dt>{copy.locatedValues}</dt>
                            <dd>
                              {item.grounding.length > 0
                                ? copy.immutableReferences(
                                    item.grounding.length,
                                  )
                                : copy.noPersonalRecord}
                            </dd>
                          </div>
                        </dl>
                        {item.alternateUrl && (
                          <ExternalLink
                            href={item.alternateUrl}
                            language={language}
                          >
                            {copy.pinnedCsv}
                          </ExternalLink>
                        )}
                      </details>
                    )}
                  </article>
                ))}
              </div>
            )}
            {result.rows.length > 0 && (
              <>
                <div className="calculation-strip">
                  <strong>{copy.calculation}</strong>
                  <span>{displayResult?.calculation?.operation}</span>
                  <span>
                    {result.rows.length} {copy.matching}
                  </span>
                </div>
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">{copy.tableCaption}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{copy.stateColumn}</th>
                        <th scope="col">{copy.stolenColumn}</th>
                        <th scope="col">{copy.changeColumn}</th>
                        <th scope="col">{copy.recoveryColumn}</th>
                        <th scope="col">{copy.changeColumn}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row) => (
                        <tr
                          key={row.geography}
                          data-testid={`result-row-${row.geography}`}
                        >
                          <th scope="row">{row.geography}</th>
                          <td data-label={copy.stolenColumn}>
                            ₹{row.stolen2021} → ₹{row.stolen2023} {copy.crore}
                          </td>
                          <td
                            data-label={copy.changeColumn}
                            className="numeric"
                          >
                            {row.stolenDelta}
                          </td>
                          <td data-label={copy.recoveryColumn}>
                            {row.recovery2021}% → {row.recovery2023}%
                          </td>
                          <td
                            data-label={copy.changeColumn}
                            className="numeric"
                          >
                            {row.recoveryDelta}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div
                  className="row-inspection-list"
                  aria-label={copy.inspectEvidence}
                >
                  {result.rows.map((row) => (
                    <details
                      key={`inspect-${row.geography}`}
                      className="row-inspection"
                    >
                      <summary>{copy.inspectRow(row.geography)}</summary>
                      <p>
                        {row.stolen2021} → {row.stolen2023} {copy.crore};{" "}
                        {copy.changeLabel} {row.stolenDelta}.{" "}
                        {copy.recoveryLabel} {row.recovery2021}% →{" "}
                        {row.recovery2023}%; {copy.changeLabel}{" "}
                        {row.recoveryDelta}.
                      </p>
                      <ul>
                        {row.lineage.map((reference, index) => (
                          <li key={`${row.geography}-${index}`}>
                            <code>
                              {reference.locator.kind === "cell"
                                ? `${reference.locator.rowKey} · ${reference.locator.colKey}`
                                : reference.locator.pointer}
                            </code>
                            : {reference.locatedContent}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
                <details className="calculation-details">
                  <summary>{copy.viewPlan}</summary>
                  <p>{displayResult?.calculation?.operation}</p>
                  <ul>
                    {displayResult?.calculation?.filters.map((filter) => (
                      <li key={filter}>{filter}</li>
                    ))}
                  </ul>
                  {result.calculationMetadata && (
                    <p className="audit-hashes">
                      {copy.plan}{" "}
                      {result.calculationMetadata.planHash.slice(0, 12)} ·
                      {copy.engine} {result.calculationMetadata.engineVersion} ·{" "}
                      {copy.policy} {result.calculationMetadata.policyVersion}
                    </p>
                  )}
                </details>
                <p className="caveat">{displayResult?.calculation?.caveat}</p>
              </>
            )}
            {result.gaps.length > 0 && (
              <div className="gap-block">
                <strong>{copy.unresolved}</strong>
                {displayResult?.gaps.map((gap) => (
                  <p key={gap}>{gap}</p>
                ))}
              </div>
            )}
            <details className="scope" open={result.gaps.length > 0}>
              <summary>{copy.scope}</summary>
              <p>{displayResult?.searchScope}</p>
            </details>
            {need &&
              need.scenario === "ncrb-property" &&
              result.executionReceipt && (
                <p className="supporting-copy">
                  {copy.provenance(
                    result.rows.length * 5,
                    new Date(
                      result.executionReceipt.executedAt,
                    ).toLocaleDateString(
                      language === "hi" ? "hi-IN" : "en-IN",
                      { day: "numeric", month: "short", year: "numeric" },
                    ),
                  )}
                </p>
              )}
            <div className="result-actions">
              <button
                className="action-button"
                onClick={saveOrShareEvidenceBrief}
              >
                {copy.saveBrief}
              </button>
              <button
                className="secondary-button"
                onClick={downloadTechnicalEvidenceBrief}
              >
                {copy.downloadTechnicalBrief}
              </button>
              {holderNeedsClarification ? (
                <button className="action-button" onClick={editConfirmedNeed}>
                  {copy.clarifyHolder}
                </button>
              ) : result.outcome !== "OFFICIAL_SERVICE_ROUTE" ? (
                <button className="action-button" onClick={openDraft}>
                  {result.outcome === "DERIVED_FINDING" ||
                  result.outcome === "SOURCE_RESOLVED"
                    ? copy.citizenOverride
                    : copy.prepare}
                </button>
              ) : (
                <button className="secondary-button" onClick={openDraft}>
                  {copy.prepare}
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() => {
                  editConfirmedNeed();
                }}
              >
                {copy.correction}
              </button>
            </div>
            {briefFeedback && (
              <p className="download-feedback" role="status" aria-live="polite">
                <span
                  className="status-icon inline-status-icon"
                  aria-hidden="true"
                >
                  {briefFeedback === copy.briefFailed ||
                  briefFeedback === copy.briefCancelled
                    ? "ⓘ"
                    : "✓"}
                </span>{" "}
                {briefFeedback}
              </p>
            )}
          </article>
        </section>
      )}

      {phase === "draft" && !activeAiTask && need && (
        <section className="content-column" aria-labelledby="draft-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.draftStage}</p>
              <h1 id="draft-title">{copy.draftTitle}</h1>
            </div>
            <button className="text-button" onClick={returnFromDraft}>
              {result ? copy.returnResult : copy.back}
            </button>
          </div>
          <p className="stage-boundary">{copy.draftIntro}</p>
          <section
            className="active-plane draft-plane"
            aria-label={copy.draftAria}
          >
            <dl className="draft-summary">
              <div>
                <dt>{copy.to}</dt>
                <dd>
                  {localizeText(
                    filingPackage?.holder.canonicalName ??
                      need.informationHolder,
                    language,
                  )}
                </dd>
              </div>
              <div>
                <dt>{copy.request}</dt>
                <dd>{displayNeed?.canonicalNeed ?? need.canonicalNeed}</dd>
              </div>
              <div>
                <dt>{copy.route}</dt>
                <dd>
                  {filingPackage ? (
                    <ExternalLink
                      href={filingPackage.route.officialUrl}
                      language={language}
                    >
                      {localizeText(
                        filingPackage.route.authority.portalNames[
                          filingPackage.route.id
                        ],
                        language,
                      )}
                    </ExternalLink>
                  ) : (
                    copy.routeNotVerified
                  )}
                </dd>
              </div>
              {filingPackage && (
                <div>
                  <dt>{copy.verified}</dt>
                  <dd>
                    {filingPackage.route.profile.verifiedAt}.{" "}
                    {copy.routeVerification}
                    {filingPackage.route.profile.unverifiedConstraints && (
                      <span className="unverified-note">
                        <span
                          className="status-icon inline-status-icon"
                          aria-hidden="true"
                        >
                          ⓘ
                        </span>{" "}
                        {copy.unverified}:{" "}
                        {filingPackage.route.profile.unverifiedConstraints
                          .map((constraint) =>
                            localizeText(constraint, language),
                          )
                          .join("; ")}
                        .
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
            <label className="field draft-editor" htmlFor="filing-draft">
              <span>{copy.draftLabel}</span>
              <textarea
                id="filing-draft"
                value={draftText}
                onChange={(event) => handleDraftChange(event.target.value)}
                rows={14}
                aria-describedby="draft-count draft-help"
              />
            </label>
            {filingPackage && (
              <p id="draft-count" className="draft-count">
                {draftValidation()?.characterCount ?? 0}/
                {filingPackage.route.profile.text.maxChars} {copy.characters}
              </p>
            )}
            <p id="draft-help" className="supporting-copy">
              {copy.draftHelp}
            </p>
            {retainedUnknownClarifications.length > 0 && (
              <div className="clarification status-partial" role="note">
                <strong>{copy.clarification}</strong>
                {retainedUnknownClarifications.map((clarification) => (
                  <p key={clarification}>
                    {clarificationDisplay(need, clarification, language)}
                  </p>
                ))}
                <p className="supporting-copy">{copy.unknownRetained}</p>
              </div>
            )}
            <p className="supporting-copy">{copy.responseProcess}</p>
            {draftValidation()?.valid === false && (
              <p className="error-message" role="alert">
                <span aria-hidden="true">!</span>
                {draftValidation()
                  ?.errors.map((message) => localizeMessage(message, language))
                  .join(" ")}
              </p>
            )}
            {draftError && (
              <p className="error-message" role="alert">
                <span aria-hidden="true">!</span>
                {draftError}
              </p>
            )}
            {filingPackage && draftDiverged && (
              <div className="divergence-block status-partial" role="alert">
                <span
                  className="status-icon inline-status-icon"
                  aria-hidden="true"
                >
                  !
                </span>
                <strong>{copy.divergenceTitle}</strong>
                <p>{copy.divergenceBody}</p>
                {divergenceChoice === "separate" && (
                  <p className="supporting-copy">{copy.divergenceSeparate}</p>
                )}
                {divergenceChoice === "keep" && (
                  <p className="supporting-copy">{copy.divergenceSaved}</p>
                )}
                <div className="button-row">
                  <button
                    className="secondary-button"
                    onClick={() => setDivergenceChoice("keep")}
                  >
                    {copy.keepWritten}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={separateDraftIntoNewPreflight}
                  >
                    {copy.separateNeed}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setDraftText(draftOriginalText);
                      setDivergenceChoice("undo");
                    }}
                  >
                    {copy.undoChanges}
                  </button>
                </div>
              </div>
            )}
            {!filingPackage && (
              <p className="coverage-note status-partial">
                <span aria-hidden="true">ⓘ</span> {copy.guidedUnavailable}
              </p>
            )}
            <div className="result-actions">
              <button
                className="action-button"
                onClick={continueToFiling}
                disabled={!filingPackage || draftDiverged || draftIsInvalid}
              >
                {copy.continueFiling}
              </button>
              <button
                className="secondary-button"
                onClick={saveCurrentDraft}
                disabled={!filingPackage || draftDiverged || draftIsInvalid}
              >
                {copy.saveDraft}
              </button>
            </div>
          </section>
        </section>
      )}

      {phase === "file" && !activeAiTask && filingPackage && (
        <section className="content-column" aria-labelledby="file-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.fileStage}</p>
              <h1 id="file-title">{copy.fileTitle}</h1>
            </div>
            <button className="text-button" onClick={() => setPhase("draft")}>
              {copy.editDraft}
            </button>
          </div>
          <p className="stage-boundary">{copy.fileIntro}</p>
          <div className="stepper" aria-label={copy.stepperAria}>
            {["otp", "identity", "review", "payment"].map((step, index) => (
              <span
                className={filingStep === step ? "step active" : "step"}
                key={step}
              >
                {index + 1}.{" "}
                {step === "otp"
                  ? copy.stepOtp.replace("1. ", "")
                  : step === "identity"
                    ? copy.stepIdentity.replace("2. ", "")
                    : step === "review"
                      ? copy.stepReview.replace("3. ", "")
                      : copy.stepPayment.replace("4. ", "")}
              </span>
            ))}
          </div>
          <section className="active-plane filing-plane">
            {filingStep === "otp" && (
              <div>
                <h2>{copy.stepOtp}</h2>
                <p className="supporting-copy">{copy.otpPrompt}</p>
                <label className="field" htmlFor="demo-otp">
                  <span>{copy.demoOtp}</span>
                  <input
                    id="demo-otp"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, ""))
                    }
                  />
                </label>
                {filingError && (
                  <p className="error-message" role="alert">
                    <span aria-hidden="true">!</span>
                    {filingError}
                  </p>
                )}
                <button
                  className="action-button"
                  onClick={() => {
                    const validation = validateDemoStep("otp", { otp });
                    if (!validation.valid) {
                      setFilingError(
                        validation.errors
                          .map((message) => localizeMessage(message, language))
                          .join(" "),
                      );
                      return;
                    }
                    setFilingError("");
                    setFilingStep("identity");
                  }}
                >
                  {copy.verifyOtp}
                </button>
              </div>
            )}
            {filingStep === "identity" && (
              <div>
                <h2>{copy.stepIdentity}</h2>
                <p className="supporting-copy">{copy.identityPrompt}</p>
                <dl className="fictional-profile">
                  <div>
                    <dt>{copy.name}</dt>
                    <dd>{displayProfile.fullName}</dd>
                  </div>
                  <div>
                    <dt>{copy.email}</dt>
                    <dd>{displayProfile.email}</dd>
                  </div>
                  <div>
                    <dt>{copy.address}</dt>
                    <dd>{displayProfile.address}</dd>
                  </div>
                  <div>
                    <dt>{copy.state}</dt>
                    <dd>{displayProfile.state}</dd>
                  </div>
                  <div>
                    <dt>{copy.pin}</dt>
                    <dd>{displayProfile.pinCode}</dd>
                  </div>
                </dl>
                <button
                  className="action-button"
                  onClick={() => {
                    const validation = validateDemoStep("identity", {
                      profile,
                    });
                    if (!validation.valid) {
                      setFilingError(
                        validation.errors
                          .map((message) => localizeMessage(message, language))
                          .join(" "),
                      );
                      return;
                    }
                    setFilingError("");
                    setFilingStep("review");
                  }}
                >
                  {copy.continue}
                </button>
              </div>
            )}
            {filingStep === "review" && (
              <div>
                <h2>{copy.stepReview}</h2>
                <p className="supporting-copy">{copy.reviewPrompt}</p>
                <div className="review-summary">
                  <strong>
                    {localizeText(filingPackage.holder.canonicalName, language)}
                  </strong>
                  <p>{filingPackage.draft.text}</p>
                  <p>
                    {copy.routeLine}:{" "}
                    {localizeText(
                      filingPackage.route.authority.portalNames[
                        filingPackage.route.id
                      ],
                      language,
                    )}
                  </p>
                  <p>
                    {copy.fictionalApplicant}: {displayProfile.fullName} ·{" "}
                    {copy.mockFee} ₹10
                  </p>
                  <p>{copy.componentSummary}</p>
                </div>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  <span>{copy.confirmPackage}</span>
                </label>
                {filingError && (
                  <p className="error-message" role="alert">
                    <span aria-hidden="true">!</span>
                    {filingError}
                  </p>
                )}
                <button
                  className="action-button"
                  disabled={!reviewed}
                  onClick={() => {
                    const validation = validateDemoStep("review", {
                      confirmed: reviewed,
                    });
                    if (!validation.valid) {
                      setFilingError(
                        validation.errors
                          .map((message) => localizeMessage(message, language))
                          .join(" "),
                      );
                      return;
                    }
                    setFilingError("");
                    setFilingStep("payment");
                  }}
                >
                  {copy.continue}
                </button>
              </div>
            )}
            {filingStep === "payment" && (
              <div>
                <h2>{copy.stepPayment}</h2>
                <p className="payment-amount">{copy.paymentPrompt}</p>
                <p className="no-payment">
                  <span aria-hidden="true">ⓘ</span> {copy.noRealPayment}
                </p>
                <p className="supporting-copy">{copy.paymentCredentials}</p>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={paymentConfirmed}
                    onChange={(event) =>
                      setPaymentConfirmed(event.target.checked)
                    }
                  />
                  <span>{copy.paymentCheck}</span>
                </label>
                {filingError && (
                  <p className="error-message" role="alert">
                    <span aria-hidden="true">!</span>
                    {filingError}
                  </p>
                )}
                <button
                  className="action-button"
                  disabled={!paymentConfirmed}
                  onClick={finishDemoSubmission}
                >
                  {copy.confirmDemo}
                </button>
              </div>
            )}
          </section>
        </section>
      )}

      {phase === "acknowledgement" &&
        !activeAiTask &&
        acknowledgement &&
        filingPackage &&
        need && (
          <section className="content-column" aria-labelledby="ack-title">
            <p className="eyebrow">{copy.acknowledgementStage}</p>
            <section className="result-plane status-source-resolved acknowledgement-plane">
              <div className="status-line">
                <span className="status-icon" aria-hidden="true">
                  ✓
                </span>
                <span>{copy.acknowledgementTitle}</span>
              </div>
              <h1 id="ack-title">{copy.acknowledgementTitle}</h1>
              <p className="ack-registration">
                {copy.fictionalRegistration}:{" "}
                <strong>{acknowledgement.registrationNumber}</strong>
              </p>
              <p className="supporting-copy">{copy.realWorldNext}</p>
              <p className="error-message" role="status">
                <span aria-hidden="true">ⓘ</span>
                {copy.noGovernment}
              </p>
              <dl className="ack-summary">
                <div>
                  <dt>{copy.to}</dt>
                  <dd>
                    {displayAcknowledgement?.holder ?? acknowledgement.holder}
                  </dd>
                </div>
                <div>
                  <dt>{copy.route}</dt>
                  <dd>
                    {localizeText(
                      filingPackage.route.authority.portalNames[
                        filingPackage.route.id
                      ],
                      language,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{copy.mockFee}</dt>
                  <dd>
                    ₹{acknowledgement.fee.amountInr} · {copy.demoUpi}
                  </dd>
                </div>
                <div>
                  <dt>{copy.fictionalTime}</dt>
                  <dd>
                    {new Date(acknowledgement.submittedAt).toLocaleString(
                      language === "hi" ? "hi-IN" : "en-IN",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}
                  </dd>
                </div>
              </dl>
              <div className="ack-draft">
                <strong>{copy.submittedDraft}</strong>
                <p>
                  {displayAcknowledgement?.submittedDraft ??
                    acknowledgement.submittedDraft}
                </p>
              </div>
              <div className="result-actions">
                <button className="action-button" onClick={downloadPackage}>
                  {copy.downloadPackage}
                </button>
                <button className="secondary-button" onClick={reset}>
                  {copy.startAnother}
                </button>
              </div>
              {briefFeedback && (
                <p
                  className="download-feedback"
                  role="status"
                  aria-live="polite"
                >
                  {briefFeedback}
                </p>
              )}
            </section>
          </section>
        )}

      <footer>
        <span>{copy.footer}</span>
        <button className="text-button" onClick={() => setDetailsOpen(true)}>
          {copy.details}
        </button>
      </footer>
      {detailsOpen && (
        <Details
          copy={copy}
          language={language}
          onClose={() => setDetailsOpen(false)}
        />
      )}
      {challengeCandidateId && challengedSourceTitle && (
        <CitationChallengeDialog
          sourceTitle={challengedSourceTitle}
          copy={copy}
          onCancel={() => setChallengeCandidateId("")}
          onConfirm={confirmCitationChallenge}
        />
      )}
    </main>
  );
}
