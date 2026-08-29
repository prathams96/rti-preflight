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
import { isFilingDemoReady } from "./filing-flow";
import { ResultTable } from "./result-table";

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

type IconName =
  "info" | "external" | "insert" | "check" | "warning" | "pending";

function Icon({ name }: { name: IconName }) {
  const paths = {
    info: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 10.5v5M12 7.5h.01" />
      </>
    ),
    external: <path d="M13 5h6v6m-1-5-8 8M16 15v3H5V7h3" />,
    insert: <path d="M5 12h12m-5-5 5 5-5 5" />,
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
  const legacyFields = [
    "stolen2021",
    "stolen2023",
    "stolenDelta",
    "recovery2021",
    "recovery2023",
    "recoveryDelta",
  ];
  const hasLegacyFields = legacyFields.every((key) =>
    isNonEmptyString(value[key]),
  );
  const hasColumns =
    Array.isArray(value.columns) &&
    value.columns.length > 0 &&
    value.columns.every(
      (column) =>
        isObject(column) &&
        isNonEmptyString(column.key) &&
        isNonEmptyString(column.label) &&
        isNonEmptyString(column.value),
    );
  return (
    isNonEmptyString(value.geography) &&
    (hasLegacyFields || hasColumns) &&
    (value.unit === undefined || value.unit === "INR crore") &&
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

function isResultTable(value: unknown): boolean {
  if (
    !isObject(value) ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.rows)
  )
    return false;
  const validColumns =
    value.columns.length > 0 &&
    value.columns.every(
      (column) =>
        isObject(column) &&
        isNonEmptyString(column.key) &&
        isNonEmptyString(column.label) &&
        isOneOf(column.format, [
          "text",
          "number",
          "currency",
          "percentage",
          "comparison",
          "delta",
        ] as const),
    );
  const columnKeys = new Set(
    value.columns
      .filter(isObject)
      .map((column) => column.key)
      .filter((key): key is string => typeof key === "string"),
  );
  const validRows = value.rows.every((row) => {
    if (!isObject(row) || !isNonEmptyString(row.key)) return false;
    const values = row.values;
    if (!isObject(values)) return false;
    return [...columnKeys].every((key) => {
      const cell = values[key];
      return (
        cell === null || typeof cell === "string" || typeof cell === "number"
      );
    });
  });
  return validColumns && validRows;
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
  const resultTable = value.resultTable;
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
  const validResultTable =
    resultTable === undefined || isResultTable(resultTable);
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
    validResultTable &&
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
    (route.officialUrl === undefined || isNonEmptyString(route.officialUrl)) &&
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
      "Please do not enter passwords, OTPs, Aadhaar, PAN, EPIC or account numbers.",
    submit: ASK_SCREEN_COPY.en.submit,
    details: "Prototype details",
    examples: "Try an example",
    confirm: "Check what we understood",
    search: "Looks right — search",
    edit: "Edit details",
    restart: "Start over",
    result: RESULT_STAGE_COPY.en.resultStage,
    researchNotice: RESULT_STAGE_COPY.en.researchNotice,
    searching: "Checking available government information",
    searchingDetail:
      "This prototype checks a limited set of saved government sources. It is not searching government systems live.",
    back: "Back to results",
    askStage: "Step 1 of 3 · Ask",
    multipleStage: "Ask · Multiple needs",
    confirmStage: "Step 2 of 3 · Check",
    searchStage: "Step 3 of 3 · Searching",
    resultStage: RESULT_STAGE_COPY.en.resultStage,
    selectTitle: "Choose one question to continue",
    selectIntro:
      "We kept your original wording and separated the needs so each one can be checked clearly.",
    oneNeed:
      "Only one need is active at a time. You can start another Preflight later.",
    measure: "Information requested",
    geography: "Area",
    period: "Time period",
    breakdown: "Breakdown by",
    holder: "Likely department to ask",
    preference: "What would work for you?",
    prefPublished: "Information from an official government source is enough",
    prefFormal: "I need a written reply from a government authority",
    prefUnsure: "I’m not sure — help me decide",
    clarification: "One detail to confirm",
    unsure: "I’m not sure",
    calculation: "Calculation",
    matching: "matching rows",
    emptyResult: "No States/UTs matched these conditions.",
    unresolved: "What remains unresolved",
    whatFound: "What we found",
    whatMissing: "What is still missing",
    nextSteps: "What you can do next",
    conflictNext:
      "You can ask the relevant authority to confirm which figure should be used.",
    scope: "What we checked",
    evidence: "Official information checked",
    prototypeWarning: "Prototype example — this is not a real RTI response.",
    officialRoute: "Official service",
    syntheticFixture: "Example source",
    verifiedWord: "verified",
    officialSource: "Official source",
    pinnedCsv: "Open pinned CSV",
    tableCaption: "States and Union Territories matching the NCRB conditions",
    inspectEvidence: "View source details",
    inspectRow: (geography: string) =>
      `View ${geography} figures and source cells`,
    viewPlan: "How this was calculated",
    saveBrief: "Download information summary (PDF)",
    briefSaved: "Information summary PDF downloaded.",
    briefFailed:
      "We couldn’t download this information summary. The result remains available here.",
    sourceData: "Government source",
    source: "Source",
    publisher: "Published by",
    applicablePeriod: "Period covered",
    publishedUpdated: "Published / updated",
    informationUsed: "Information used",
    notSpecified: "Not specified",
    locatedValues: "Source references",
    openSource: "View official source",
    openRoute: "Go to official service",
    viewSource: "View source",
    viewEarlierResponse: "View the earlier response",
    seeWhatChecked: "See what we checked",
    goToOfficialService: "Go to the official EPFO service",
    prepareMissing: "Prepare an RTI for the missing information",
    prepareClarification: "Prepare an RTI asking for clarification",
    compareSources: "Compare the sources",
    prepare: "Prepare an RTI",
    prepareAnyway: "Prepare an RTI anyway",
    citizenOverride: "I still want to prepare an RTI",
    footer:
      "Your research is anonymous. Nothing is filed unless you enter the separate filing demo.",
    language: "हिन्दी",
    draftStage: RESULT_STAGE_COPY.en.draftStage,
    draftTitle: RESULT_STAGE_COPY.en.draftTitle,
    draftIntro: RESULT_STAGE_COPY.en.draftIntro,
    to: "Government authority",
    request: "RTI request",
    route: "RTI channel",
    verified: "Last checked",
    characters: "Character limit",
    continueFiling: "Continue to filing demo",
    saveDraft: "Save draft",
    savedDraft: "Saved RTI draft",
    returnResult: "Back to results",
    routeChecked: "RTI channel checked",
    demoRoute: "Demo route",
    demoRouteDisclosure:
      "The likely authority was inferred from your question. Verify the authority and official RTI portal before filing a real request.",
    divergenceTitle: "This edit may add a second question",
    divergenceBody:
      "Choose how to keep control of the draft. Nothing will be truncated or silently rewritten.",
    keepWritten: "Keep as written",
    separateNeed: "Save as a separate check",
    undoChanges: "Undo changes",
    fileStage: RESULT_STAGE_COPY.en.fileStage,
    fileTitle: RESULT_STAGE_COPY.en.fileTitle,
    fileIntro: RESULT_STAGE_COPY.en.fileIntro,
    stepOtp: "1. OTP",
    stepIdentity: "2. Applicant details",
    stepReview: "3. Review",
    stepPayment: "4. Payment",
    otpTitle: "Demo only",
    applicantTitle: "Applicant details",
    reviewTitle: "Review your RTI",
    paymentTitle: "Demo payment",
    reviewWarning:
      "This is a prototype. Nothing will be submitted to a government website.",
    otpPrompt: "Use OTP 123456 to continue. No SMS has been sent.",
    verifyOtp: "Verify and continue",
    identityPrompt:
      "The details shown here are fictional and are used only for this demo.",
    continue: "Continue",
    reviewPrompt:
      "Check the authority, request and applicant details before continuing.",
    confirmPackage: "I have checked these details",
    paymentPrompt: "₹10 mock RTI fee",
    noRealPayment: "No real payment will be made.",
    confirmDemo: "Complete demo payment",
    acknowledgementStage: "Done",
    acknowledgementTitle: RESULT_STAGE_COPY.en.acknowledgementTitle,
    fictionalRegistration: "Demo reference",
    noGovernment:
      "No RTI, payment or personal information was sent to a government system.",
    downloadPackage: "Download RTI draft",
    packageSaved: "RTI draft PDF downloaded.",
    packageFailed:
      "We couldn’t save this RTI draft PDF. The demo result remains available here.",
    startAnother: "Start another check",
    correction: "Change my question",
    challenge: "Report a source problem",
    challengePending:
      "You reported a problem with this source. The result stays visible, but we’ll show it as partial until the source is checked again. You can still prepare an RTI.",
    challengeDialogTitle: "Report a source problem?",
    challengeDialogBody: (sourceTitle: string) =>
      `You are reporting that “${sourceTitle}” may not support this result.`,
    challengeDialogConsequence:
      "After you confirm, the original result and source information will stay visible, but we’ll mark the result as partial until it is checked again.",
    confirmChallenge: "Report problem and mark result partial",
    cancel: "Cancel",
    draftLabel: "RTI request",
    routeVerification:
      "This route information was last checked on this date; a government website may have changed.",
    unverified: "Unverified",
    draftHelp:
      "Edit this freely — we won’t rewrite your words. The request asks for records, not explanations.",
    divergenceSaved:
      "The draft remains saved for editing, but continuing is paused until the second question is removed or saved separately.",
    editDraft: "Edit RTI draft",
    demoOtp: "OTP",
    name: "Name",
    email: "Email",
    address: "Address",
    state: "State",
    pin: "PIN",
    routeLine: "Route",
    fictionalApplicant: "Applicant details",
    mockFee: "Fee",
    componentSummary:
      "Route information is checked. OTP, applicant details, payment and filing are simulated.",
    genericComponentSummary:
      "Route selection, OTP, applicant details, payment and filing are simulated. Verify the authority and portal before any real filing.",
    paymentCredentials:
      "No UPI ID, card, CVV, bank, or payment credential is collected.",
    paymentCheck: "I understand this is a demo payment step.",
    fictionalTime: "Demo time",
    submittedDraft: "RTI draft in this demo",
    draftAria: "RTI draft",
    stepperAria: "Simulated filing steps",
    prepareFailure: "We couldn’t prepare this RTI draft right now.",
    revalidationError:
      "This RTI draft needs to be checked again before continuing. Remove the added question or save it as a separate check.",
    divergenceSeparate:
      "The edited text is kept here and marked for a separate saved check.",
    savedPreflights: "Saved checks",
    resume: "Resume",
    originalNeed: "Original confirmed question",
    separatedDraft: "Second question to review",
    cpcbCut:
      "Air-quality results are not shown until two compatible official sources agree. We will not show a figure that cannot be confirmed.",
    askReassurance: ASK_SCREEN_COPY.en.reassurance,
    confirmIntro: "Make sure these details are correct before we search.",
    responseProcess:
      "In a real filing, the authority’s own channel sets out the response process.",
    realWorldNext: "You have completed the simulated RTI filing process.",
    provenance: (count: number, date: string) =>
      `Information checked against ${count} official values · last checked ${date}`,
    customOption: "Other / custom — type your own",
    customHelp: "Choose a common value or type your own.",
    customAccepted: "Custom value accepted.",
    invalidNeed:
      "Complete each field before checking. You can type a custom area or time period.",
    disclosure: "Disclosure",
    closeDetails: "Close prototype details",
    verifiedRouteProfile: "Northern Railway route information",
    epfoRouteDetails: "EPFO service information",
    cpcbScenario: "CPCB conflict scenario",
    routeMetadataNote:
      "The purpose and date shown here describe the service information; use the link above for the official service.",
    resumeTitle: "Resume previous check",
    resumeBody: "Your saved prototype journey is ready to continue.",
    startFresh: "Start fresh",
    askAria: "Ask for public information",
    placeholder:
      "For example: How much did my municipality spend on road repairs in 2024-25?",
    interpreting: "Interpreting your need",
    aiThinking: {
      interpretation: {
        eyebrow: "Understanding your question",
        title: "Making your question clear",
        detail:
          "We’re reading your wording and preparing the details for you to check.",
        stages: [
          "Reading your question",
          "Identifying the information requested",
          "Preparing the details for you to check",
        ],
      },
      resolution: {
        eyebrow: "Government information check in progress",
        title: "Checking available government information",
        detail:
          "This prototype checks a limited set of saved government sources. It is not searching government systems live.",
        stages: [
          "Finding the relevant government authority",
          "Checking official data and reports",
          "Checking available RTI responses",
          "Matching the dates and location",
          "Checking the supporting information",
        ],
      },
      draft: {
        eyebrow: "RTI draft preparation in progress",
        title: "Preparing your RTI draft",
        detail:
          "We’re keeping your confirmed details intact while preparing an editable RTI request.",
        stages: [
          "Reading the details you confirmed",
          "Keeping your question intact",
          "Preparing an editable RTI draft",
        ],
      },
      note: "These work areas describe this step; they are not a live progress report.",
      cancel: "Back and edit",
    },
    unknownClarification:
      "Answer using the fields above, or retain this one detail as unknown.",
    rowDetail: (row: string, values: string) =>
      `View ${row} figures and source cells: ${values}`,
    plan: "Calculation plan",
    engine: "Calculation method",
    policy: "Checking rules",
    demoUpi: "Demo payment",
    noPersonalRecord: "No personal record was retrieved",
    immutableReferences: (count: number) =>
      `${count} source references checked`,
    progressNeed: "Question confirmed",
    progressNcrb: "Checked the saved NCRB table",
    progressNcrbDone: "Applied deterministic filters and validated grounding",
    progressCapabilities: "Checked the saved government sources available here",
    progressResult: "Prepared the result",
    demoSubmissionFailure:
      "The RTI details must be valid and confirmed before the filing demo.",
    recheckChallenge:
      "Change and confirm your question before checking this source again.",
    recoveryNotice:
      "Your previous prototype session could not be restored. Start a new Preflight.",
    independentDetails:
      "This is an independent research assistant—not an official RTI response.",
    routeProfileVersion: (version: string, date: string) =>
      `Northern Railway route profile v${version}, verified ${date}.`,
    routeMetadataDetails: (purpose: string, date: string) =>
      `${purpose}; verified ${date}. This is route metadata, not a retrieved personal record.`,
    unknownRetained:
      "Kept as unknown; this limitation stays visible in the result and RTI draft.",
    cpcbDecision: (date: string) =>
      `Decision recorded ${date}; no conflicting sources have been added.`,
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
    confirm: "हमने क्या समझा",
    search: "सही है — जाँचें",
    edit: "बदलें",
    restart: "फिर से शुरू करें",
    result: RESULT_STAGE_COPY.hi.resultStage,
    researchNotice: RESULT_STAGE_COPY.hi.researchNotice,
    searching: "उपलब्ध सरकारी जानकारी जाँच रहे हैं",
    searchingDetail:
      "यह प्रोटोटाइप सीमित संख्या में सहेजे गए सरकारी स्रोतों को जाँचता है। यह सरकारी सिस्टम को लाइव नहीं खोज रहा है।",
    back: "नतीजे पर लौटें",
    askStage: "चरण 1/3 · पूछें",
    multipleStage: "पूछें · कई ज़रूरतें",
    confirmStage: "चरण 2/3 · जाँचें",
    searchStage: "चरण 3/3 · खोज रहे हैं",
    resultStage: RESULT_STAGE_COPY.hi.resultStage,
    selectTitle: "जारी रखने के लिए एक सवाल चुनें",
    selectIntro:
      "हमने आपके मूल शब्द रखे हैं और ज़रूरतों को अलग किया है ताकि हर ज़रूरत को स्पष्ट रूप से जाँचा जा सके।",
    oneNeed:
      "एक समय में केवल एक ज़रूरत सक्रिय है। बाद में एक और जाँच शुरू कर सकते हैं।",
    measure: "माँगी गई जानकारी",
    geography: "क्षेत्र",
    period: "समय अवधि",
    breakdown: "विभाजन",
    holder: "किस विभाग से पूछें",
    preference: "आपके लिए क्या ठीक रहेगा?",
    prefPublished: "आधिकारिक सरकारी स्रोत की जानकारी पर्याप्त है",
    prefFormal: "मुझे सरकारी प्राधिकरण से लिखित उत्तर चाहिए",
    prefUnsure: "मुझे नहीं पता — तय करने में मदद करें",
    clarification: "एक विवरण की पुष्टि करें",
    unsure: "मैं निश्चित नहीं हूँ",
    calculation: "गणना",
    matching: "मिलती पंक्तियाँ",
    emptyResult: "इन शर्तों से कोई राज्य/केंद्र शासित प्रदेश मेल नहीं खाया।",
    unresolved: "क्या अभी अनसुलझा है",
    whatFound: "हमें क्या मिला",
    whatMissing: "क्या अभी बाकी है",
    nextSteps: "आप आगे क्या कर सकते हैं",
    conflictNext:
      "आप संबंधित प्राधिकरण से पूछ सकते हैं कि किस आँकड़े का इस्तेमाल किया जाना चाहिए।",
    scope: "हमने क्या जाँचा",
    evidence: "जाँची गई आधिकारिक जानकारी",
    prototypeWarning: "प्रोटोटाइप उदाहरण — यह वास्तविक RTI उत्तर नहीं है।",
    officialRoute: "आधिकारिक सेवा",
    syntheticFixture: "उदाहरण स्रोत",
    verifiedWord: "सत्यापित",
    officialSource: "आधिकारिक स्रोत खोलें",
    pinnedCsv: "पिन किया गया CSV खोलें",
    tableCaption: "NCRB शर्तों से मेल खाने वाले राज्य और केंद्र शासित प्रदेश",
    inspectEvidence: "स्रोत का विवरण देखें",
    inspectRow: (geography: string) =>
      `${geography} के आँकड़े और स्रोत सेल देखें`,
    viewPlan: "यह कैसे निकाला गया",
    saveBrief: "जानकारी का सारांश (PDF) डाउनलोड करें",
    briefSaved: "जानकारी का सारांश PDF डाउनलोड हो गया।",
    briefFailed: "जानकारी का सारांश डाउनलोड नहीं हो सका। नतीजा यहाँ उपलब्ध है।",
    sourceData: "सरकारी स्रोत",
    source: "स्रोत",
    publisher: "प्रकाशित किया",
    applicablePeriod: "कवर की गई अवधि",
    publishedUpdated: "प्रकाशित / अपडेट किया गया",
    informationUsed: "इस्तेमाल की गई जानकारी",
    notSpecified: "निर्दिष्ट नहीं",
    locatedValues: "स्रोत संदर्भ",
    openSource: "आधिकारिक स्रोत देखें",
    openRoute: "आधिकारिक सेवा पर जाएँ",
    viewSource: "स्रोत देखें",
    viewEarlierResponse: "पहला उत्तर देखें",
    seeWhatChecked: "हमने क्या जाँचा देखें",
    goToOfficialService: "आधिकारिक EPFO सेवा पर जाएँ",
    prepareMissing: "गुम जानकारी के लिए RTI तैयार करें",
    prepareClarification: "स्पष्टीकरण माँगने वाली RTI तैयार करें",
    compareSources: "स्रोतों की तुलना करें",
    prepare: "RTI तैयार करें",
    prepareAnyway: "फिर भी RTI तैयार करें",
    citizenOverride: "मैं फिर भी RTI तैयार करना चाहता/चाहती हूँ",
    footer:
      "आपका शोध गुमनाम है। अलग फाइलिंग डेमो में जाने तक कुछ दाखिल नहीं होता।",
    language: "English",
    draftStage: RESULT_STAGE_COPY.hi.draftStage,
    draftTitle: RESULT_STAGE_COPY.hi.draftTitle,
    draftIntro: RESULT_STAGE_COPY.hi.draftIntro,
    to: "सरकारी प्राधिकरण",
    request: "RTI अनुरोध",
    route: "RTI चैनल",
    verified: "अंतिम जाँच",
    characters: "अक्षर सीमा",
    continueFiling: "फाइलिंग डेमो पर जाएँ",
    saveDraft: "ड्राफ्ट सहेजें",
    savedDraft: "सहेजा गया RTI ड्राफ्ट",
    returnResult: "नतीजे पर लौटें",
    routeChecked: "RTI चैनल जाँचा गया",
    demoRoute: "डेमो मार्ग",
    demoRouteDisclosure:
      "आपके सवाल से संभावित प्राधिकरण का अनुमान लगाया गया है। असली अनुरोध भेजने से पहले प्राधिकरण और आधिकारिक RTI पोर्टल की जाँच करें।",
    divergenceTitle: "यह बदलाव दूसरी सूचना-ज़रूरत जोड़ सकता है",
    divergenceBody:
      "ड्राफ्ट पर नियंत्रण रखने का तरीका चुनें। कुछ भी छोटा या चुपचाप बदला नहीं जाएगा।",
    keepWritten: "जैसा लिखा है वैसा रखें",
    separateNeed: "दूसरी सहेजी गई जाँच में अलग करें",
    undoChanges: "बदलाव वापस लें",
    fileStage: RESULT_STAGE_COPY.hi.fileStage,
    fileTitle: RESULT_STAGE_COPY.hi.fileTitle,
    fileIntro: RESULT_STAGE_COPY.hi.fileIntro,
    stepOtp: "1. OTP",
    stepIdentity: "2. आवेदक का विवरण",
    stepReview: "3. समीक्षा",
    stepPayment: "4. भुगतान",
    otpTitle: "केवल डेमो",
    applicantTitle: "आवेदक का विवरण",
    reviewTitle: "अपनी RTI की समीक्षा करें",
    paymentTitle: "डेमो भुगतान",
    reviewWarning:
      "यह प्रोटोटाइप है। सरकारी वेबसाइट पर कुछ भी जमा नहीं किया जाएगा।",
    otpPrompt: "जारी रखने के लिए OTP 123456 डालें। कोई SMS नहीं भेजा गया है।",
    verifyOtp: "सत्यापित करें और आगे बढ़ें",
    identityPrompt:
      "यहाँ दिखाए गए विवरण काल्पनिक हैं और केवल इस डेमो के लिए हैं।",
    continue: "जारी रखें",
    reviewPrompt:
      "आगे बढ़ने से पहले प्राधिकरण, अनुरोध और आवेदक के विवरण जाँचें।",
    confirmPackage: "मैंने इन विवरणों को जाँच लिया है",
    paymentPrompt: "₹10 का मॉक RTI शुल्क",
    noRealPayment: "कोई वास्तविक भुगतान नहीं होगा।",
    confirmDemo: "डेमो भुगतान पूरा करें",
    acknowledgementStage: "पूरा हुआ",
    acknowledgementTitle: RESULT_STAGE_COPY.hi.acknowledgementTitle,
    fictionalRegistration: "डेमो संदर्भ",
    noGovernment:
      "किसी सरकारी सिस्टम को RTI, भुगतान या व्यक्तिगत जानकारी नहीं भेजी गई।",
    downloadPackage: "RTI ड्राफ्ट डाउनलोड करें",
    packageSaved: "RTI ड्राफ्ट PDF डाउनलोड हो गया।",
    packageFailed:
      "डेमो फाइलिंग पैकेज PDF सहेजा नहीं जा सका। पावती यहाँ उपलब्ध है।",
    startAnother: "एक और जाँच शुरू करें",
    correction: "अपना सवाल बदलें",
    challenge: "स्रोत की समस्या रिपोर्ट करें",
    challengePending:
      "इस उद्धरण की समस्या रिपोर्ट की गई है। मूल नतीजा दिखता रहेगा, लेकिन इस स्रोत के दोबारा सत्यापन तक इसकी स्थिति आंशिक रूप से हल की गई होगी। आप फिर भी RTI ड्राफ्ट तैयार कर सकते हैं।",
    challengeDialogTitle: "स्रोत की समस्या रिपोर्ट करें?",
    challengeDialogBody: (sourceTitle: string) =>
      `आप रिपोर्ट कर रहे हैं कि “${sourceTitle}” इस नतीजे का समर्थन नहीं कर सकता।`,
    challengeDialogConsequence:
      "पुष्टि करने के बाद मूल नतीजा और प्रमाण दिखते रहेंगे, लेकिन दोबारा सत्यापन तक इसका स्तर घटेगा।",
    confirmChallenge: "समस्या रिपोर्ट करके स्तर घटाएँ",
    cancel: "रद्द करें",
    draftLabel: "RTI अनुरोध",
    routeVerification:
      "इस तारीख को अंतिम बार जाँची गई मार्ग जानकारी के आधार पर सत्यापित; बाहरी स्वीकृति की गारंटी नहीं है।",
    unverified: "असत्यापित",
    draftHelp:
      "इसे बेझिझक बदलें — हम आपके शब्द नहीं बदलेंगे। यह कारण नहीं, रिकॉर्ड माँगता है, जिसका आपको RTI अधिनियम के तहत अधिकार है।",
    divergenceSaved:
      "ड्राफ्ट बदलाव के लिए सहेजा गया है, लेकिन दूसरा सवाल हटाने या अलग जाँच के रूप में सहेजने तक आगे बढ़ना रुका है।",
    editDraft: "RTI ड्राफ्ट बदलें",
    demoOtp: "OTP",
    name: "नाम",
    email: "ईमेल",
    address: "पता",
    state: "राज्य",
    pin: "PIN",
    routeLine: "मार्ग",
    fictionalApplicant: "आवेदक का विवरण",
    mockFee: "शुल्क",
    componentSummary:
      "मार्ग की जानकारी जाँची जाती है। OTP, आवेदक का विवरण, भुगतान और फाइलिंग अनुकरण किए गए हैं।",
    genericComponentSummary:
      "मार्ग चयन, OTP, आवेदक का विवरण, भुगतान और फाइलिंग अनुकरण किए गए हैं। वास्तविक फाइलिंग से पहले प्राधिकरण और पोर्टल सत्यापित करें।",
    paymentCredentials:
      "कोई UPI ID, कार्ड, CVV, बैंक या भुगतान क्रेडेंशियल नहीं लिया जाता।",
    paymentCheck: "मैं समझता/समझती हूँ कि यह डेमो भुगतान चरण है।",
    fictionalTime: "डेमो समय",
    submittedDraft: "इस डेमो का RTI ड्राफ्ट",
    draftAria: "RTI ड्राफ्ट",
    stepperAria: "अनुकरण किए गए फाइलिंग चरण",
    prepareFailure: "अभी RTI ड्राफ्ट तैयार नहीं हो सका।",
    revalidationError:
      "आगे बढ़ने से पहले इस RTI ड्राफ्ट को फिर से जाँचना ज़रूरी है। जोड़ा गया सवाल हटाएँ या उसे अलग जाँच के रूप में सहेजें।",
    divergenceSeparate:
      "बदला हुआ पाठ यहाँ रखा गया है और अलग सहेजी गई जाँच के लिए चिह्नित है।",
    savedPreflights: "सहेजी गई जाँचें",
    resume: "फिर शुरू करें",
    originalNeed: "मूल पुष्ट सवाल",
    separatedDraft: "दूसरे सवाल की समीक्षा करें",
    cpcbCut:
      "जब तक दो संगत आधिकारिक स्रोत सहमत नहीं होते, वायु-गुणवत्ता के नतीजे नहीं दिखाए जाते। जिस आँकड़े की पुष्टि न हो, वह नहीं दिखाया जाएगा।",
    askReassurance: ASK_SCREEN_COPY.hi.reassurance,
    confirmIntro: "जाँच शुरू करने से पहले पक्का करें कि ये विवरण सही हैं।",
    responseProcess:
      "असली फाइलिंग में प्राधिकरण का अपना चैनल प्रतिक्रिया प्रक्रिया बताएगा।",
    realWorldNext: "आपने RTI फाइलिंग की अनुकरण प्रक्रिया पूरी कर ली है।",
    provenance: (count: number, date: string) =>
      `${count} आधिकारिक मानों से मिलान किया गया · अंतिम सत्यापन ${date}`,
    customOption: "अन्य / अपनी जानकारी लिखें",
    customHelp: "कोई सामान्य विकल्प चुनें या अपनी जानकारी लिखें।",
    customAccepted: "अपनी जानकारी स्वीकार की गई है।",
    invalidNeed:
      "जाँचने से पहले सूचना-ज़रूरत के सभी फ़ील्ड भरें। आप अपनी जगह या अवधि लिख सकते हैं।",
    disclosure: "प्रकटीकरण",
    closeDetails: "प्रोटोटाइप विवरण बंद करें",
    verifiedRouteProfile: "Northern Railway मार्ग की जानकारी",
    epfoRouteDetails: "EPFO सेवा की जानकारी",
    cpcbScenario: "CPCB विरोधाभास परिदृश्य",
    routeMetadataNote:
      "यहाँ दिया गया उद्देश्य और दिनांक सेवा की जानकारी है; आधिकारिक सेवा के लिए ऊपर दिए लिंक का इस्तेमाल करें।",
    resumeTitle: "पिछली जाँच फिर शुरू करें",
    resumeBody: "आपकी सहेजी गई प्रोटोटाइप यात्रा जारी रखने के लिए तैयार है।",
    startFresh: "नई शुरुआत करें",
    askAria: "सार्वजनिक जानकारी पूछें",
    placeholder:
      "उदाहरण: मेरी नगरपालिका ने 2024-25 में सड़क की मरम्मत पर कितना खर्च किया?",
    interpreting: "आपकी ज़रूरत समझी जा रही है",
    aiThinking: {
      interpretation: {
        eyebrow: "आपका सवाल समझ रहे हैं",
        title: "आपके सवाल को स्पष्ट बना रहे हैं",
        detail: "हम आपके शब्द पढ़कर जाँचने के लिए विवरण तैयार कर रहे हैं।",
        stages: [
          "आपके शब्द पढ़ रहे हैं",
          "माँगी गई जानकारी पहचान रहे हैं",
          "जाँचने के लिए विवरण तैयार कर रहे हैं",
        ],
      },
      resolution: {
        eyebrow: "सरकारी जानकारी की जाँच जारी है",
        title: "उपलब्ध सरकारी जानकारी जाँच रहे हैं",
        detail:
          "यह प्रोटोटाइप सीमित संख्या में सहेजे गए सरकारी स्रोतों को जाँचता है। यह सरकारी सिस्टम को लाइव नहीं खोज रहा है।",
        stages: [
          "संभावित सरकारी प्राधिकरण खोज रहे हैं",
          "आधिकारिक डेटा और रिपोर्ट जाँच रहे हैं",
          "उपलब्ध RTI जवाब जाँच रहे हैं",
          "तारीख और जगह मिला रहे हैं",
          "सहायक जानकारी जाँच रहे हैं",
        ],
      },
      draft: {
        eyebrow: "RTI ड्राफ्ट तैयार किया जा रहा है",
        title: "आपका RTI ड्राफ्ट तैयार कर रहे हैं",
        detail:
          "हम आपके पुष्ट विवरण बनाए रखते हुए बदलाव योग्य RTI अनुरोध तैयार कर रहे हैं।",
        stages: [
          "आपके पुष्ट विवरण पढ़ रहे हैं",
          "आपका सवाल बनाए रख रहे हैं",
          "बदलाव योग्य RTI ड्राफ्ट तैयार कर रहे हैं",
        ],
      },
      note: "ये चरण इस काम के हिस्से बताते हैं; यह लाइव प्रगति रिपोर्ट नहीं है।",
      cancel: "वापस जाकर बदलें",
    },
    unknownClarification:
      "ऊपर दिए फ़ील्ड से उत्तर दें या इस विवरण को अज्ञात रहने दें।",
    rowDetail: (row: string, values: string) =>
      `${row} के मान और स्रोत सेल देखें: ${values}`,
    plan: "गणना योजना",
    engine: "गणना का तरीका",
    policy: "जाँच के नियम",
    demoUpi: "डेमो भुगतान",
    noPersonalRecord: "कोई व्यक्तिगत रिकॉर्ड प्राप्त नहीं हुआ",
    immutableReferences: (count: number) => `${count} स्रोत संदर्भ जाँचे गए`,
    progressNeed: "सवाल की पुष्टि की गई",
    progressNcrb: "सहेजी गई NCRB तालिका जाँची",
    progressNcrbDone: "तय नियमों से फ़िल्टर लगाए और प्रमाण का सत्यापन किया",
    progressCapabilities: "यहाँ उपलब्ध सहेजे गए सरकारी स्रोत जाँचे",
    progressResult: "नतीजा तैयार किया",
    demoSubmissionFailure:
      "फाइलिंग डेमो से पहले RTI का विवरण मान्य और पुष्ट होना चाहिए।",
    recheckChallenge:
      "इस स्रोत को फिर से जाँचने से पहले सवाल बदलकर उसकी पुष्टि करें।",
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
      `निर्णय ${date} को दर्ज किया गया; कोई विरोधी स्रोत नहीं जोड़ा गया है।`,
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
  DERIVED_FINDING: "Calculated from official data",
  SOURCE_RESOLVED: "Available from an official source",
  NO_RELIABLE_FINDING: "Sources checked did not provide a reliable answer",
  OUTSIDE_SNAPSHOT_COVERAGE:
    "Sources checked did not provide a reliable answer",
  OFFICIAL_SERVICE_ROUTE: "Official service available",
  PARTIALLY_RESOLVED: "Part of the information was found",
  EVIDENCE_CONFLICT: "Official sources show different figures",
  FORMAL_RESPONSE_REQUIRED: "Written reply available through RTI",
};
const outcomeLabelHi: Record<string, string> = {
  DERIVED_FINDING: "आधिकारिक आँकड़ों से गणना की गई",
  SOURCE_RESOLVED: "आधिकारिक स्रोत पर उपलब्ध",
  NO_RELIABLE_FINDING: "जाँचे गए स्रोतों से विश्वसनीय उत्तर नहीं मिला",
  OUTSIDE_SNAPSHOT_COVERAGE: "जाँचे गए स्रोतों से विश्वसनीय उत्तर नहीं मिला",
  OFFICIAL_SERVICE_ROUTE: "आधिकारिक सेवा उपलब्ध है",
  PARTIALLY_RESOLVED: "कुछ जानकारी मिली",
  EVIDENCE_CONFLICT: "आधिकारिक स्रोतों में अलग-अलग आँकड़े हैं",
  FORMAL_RESPONSE_REQUIRED: "RTI के ज़रिए लिखित उत्तर माँगा जा सकता है",
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
      <textarea
        className="field-value"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
      />
    </label>
  );
}

function applyCitizenResultCopy(
  result: RenderableResolution,
  language: Language,
): RenderableResolution {
  if (language !== "en") return result;
  const isPreviousRti = result.evidence.some(
    (item) => item.sourceType === "rti_response_fixture",
  );
  const copyByOutcome: Partial<
    Record<
      RenderableResolution["outcome"],
      Pick<RenderableResolution, "headline" | "meaning" | "evidenceStatus">
    >
  > = {
    SOURCE_RESOLVED: isPreviousRti
      ? {
          headline: "We found a similar earlier RTI response",
          meaning:
            "An earlier response may help answer your question before you file a new RTI.",
          evidenceStatus:
            "Prototype example — this is not a real RTI response.",
        }
      : {
          headline: "We found the information you were looking for",
          meaning:
            "It is available from an official government source, so you may not need to file an RTI for this information.",
          evidenceStatus: "Available from an official source",
        },
    DERIVED_FINDING: {
      headline: "We found an answer using official government data",
      meaning:
        "The answer below was calculated from published NCRB figures for 2021 and 2023.",
      evidenceStatus: "Calculated from official data",
    },
    OFFICIAL_SERVICE_ROUTE: {
      headline: "You may not need an RTI for this",
      meaning:
        "EPF claim status can be checked through an official EPFO service. For personal claim status, using the official service is usually quicker than filing an RTI.",
      evidenceStatus: "Official service available",
    },
    PARTIALLY_RESOLVED: {
      headline: "We found part of the information",
      meaning:
        "Official sources answer part of your question, but some information is still missing.",
      evidenceStatus: "Part of the information was found",
    },
    EVIDENCE_CONFLICT: {
      headline: "Official sources show different figures",
      meaning:
        "We found two official sources that report this differently. We therefore cannot confirm one figure as the correct answer.",
      evidenceStatus: "Official sources report different figures",
    },
    NO_RELIABLE_FINDING: {
      headline: "We couldn’t find a reliable public answer",
      meaning:
        "The government sources checked by this prototype do not fully answer your question. An RTI may help you request the information directly from the relevant authority.",
      evidenceStatus: "The sources checked did not provide a reliable answer",
    },
    OUTSIDE_SNAPSHOT_COVERAGE: {
      headline: "We couldn’t find a reliable public answer",
      meaning:
        "The government sources checked by this prototype do not fully answer your question. An RTI may help you request the information directly from the relevant authority.",
      evidenceStatus: "The sources checked did not provide a reliable answer",
    },
    FORMAL_RESPONSE_REQUIRED: {
      headline:
        "You can ask the relevant government authority for a written reply",
      meaning:
        "You chose a written reply, so you can prepare an RTI draft for the relevant authority.",
      evidenceStatus: "A written reply can be requested through RTI",
    },
  };
  const citizenCopy = copyByOutcome[result.outcome];
  return citizenCopy ? { ...result, ...citizenCopy } : result;
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
  const homeNavigationRef = useRef(false);
  const separatedDraftCounter = useRef(0);
  const [savedPreflightsLoaded, setSavedPreflightsLoaded] = useState(false);
  const [resumeState, setResumeState] = useState<SavedState | undefined>();
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const copy = COPY[language];
  const displayNeed = need ? localizeNeed(need, language) : undefined;
  const displayResult = result
    ? applyCitizenResultCopy(localizeResolution(result, language), language)
    : undefined;
  const displayTable = displayResult?.resultTable;
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
      if (homeNavigationRef.current) return;
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
      if (homeNavigationRef.current) return;
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
        if (payload.filingPackage?.route.officialUrl) {
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
      setDraftError(copy.prepareFailure);
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
    if (!filingDemoReady) {
      setDraftError(copy.demoSubmissionFailure);
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

  async function downloadEvidenceBrief() {
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
      setError(localizeMessage(copy.recheckChallenge, targetLanguage));
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
    homeNavigationRef.current = true;
    draftRequestGeneration.current += 1;
    resolveRequestGeneration.current += 1;
    interpretRequestGeneration.current += 1;
    setIsInterpreting(false);
    setActiveAiTask(null);
    setAiReturnPhase(null);
    clearFilingStorage();
    setResumeState(undefined);
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
  const filingDemoReady = isFilingDemoReady({
    need,
    draftText,
    filingPackage,
  });
  const prefersDraftingRoute = Boolean(
    need &&
    shouldPreferDraftingRoute({
      ...need,
      draftingIntent:
        need.draftingIntent ?? hasExplicitDraftingIntent(need.originalText),
    }),
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
        <div className="topbar-actions">
          <button className="text-button" onClick={() => setDetailsOpen(true)}>
            {copy.details} <Icon name="external" />
          </button>
          {phase !== "start" && (
            <button className="text-button global-restart" onClick={reset}>
              {copy.restart}
            </button>
          )}
        </div>
      </header>
      <div className="brand-row">
        <button
          type="button"
          className="wordmark"
          onClick={returnToAsk}
          aria-label="RTI Tathya home"
        >
          <Image
            className="wordmark-logo"
            src="/rti-tathya-logo-transparent.png"
            alt=""
            width={1018}
            height={814}
            sizes="(max-width: 420px) 3.2rem, (max-width: 720px) 3.6rem, 5rem"
          />
        </button>
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
              {SCENARIO_PROMPTS.map((scenario) => {
                const scenarioPrompt =
                  language === "hi" ? scenario.hiPrompt : scenario.prompt;
                const isSelected = text.trim() === scenarioPrompt.trim();
                return (
                  <button
                    key={scenario.id}
                    className={isSelected ? "scenario selected" : "scenario"}
                    aria-label={scenarioPrompt}
                    onClick={() => updateAskText(scenarioPrompt)}
                  >
                    <span>{scenarioPrompt}</span>
                    <Icon name={isSelected ? "check" : "insert"} />
                  </button>
                );
              })}
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
            <div className="button-row confirm-actions">
              <button
                className="action-button"
                disabled={
                  pendingClarifications.length > 0 ||
                  informationNeedEditErrors(need).length > 0
                }
                onClick={confirmNeed}
              >
                {prefersDraftingRoute ? copy.prepare : copy.search}
              </button>
              {pendingClarifications.length > 0 && (
                <button className="secondary-button" onClick={openDraft}>
                  {copy.prepareAnyway}
                </button>
              )}
              <button className="secondary-button" onClick={reset}>
                {copy.restart}
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
            {result.evidence.some(
              (item) => item.sourceType === "rti_response_fixture",
            ) && (
              <p className="synthetic-watermark" role="alert">
                {copy.prototypeWarning}
              </p>
            )}
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
              <div
                className="evidence-list"
                id="source-list"
                aria-label={copy.evidence}
              >
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
                        {copy.prototypeWarning}
                      </p>
                    )}
                    <dl>
                      <div>
                        <dt>{copy.source}</dt>
                        <dd>{item.sourceTitle}</dd>
                      </div>
                      <div>
                        <dt>{copy.publisher}</dt>
                        <dd>{item.publisher}</dd>
                      </div>
                      <div>
                        <dt>{copy.applicablePeriod}</dt>
                        <dd>{item.applicablePeriod}</dd>
                      </div>
                      <div>
                        <dt>{copy.publishedUpdated}</dt>
                        <dd>{item.publicationDate ?? copy.notSpecified}</dd>
                      </div>
                      <div>
                        <dt>{copy.informationUsed}</dt>
                        <dd>{item.extract}</dd>
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
                      <p className="supporting-copy">{copy.prototypeWarning}</p>
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
            {displayTable && displayResult.calculation && (
              <>
                <div className="calculation-strip">
                  <strong className="evidence-stamp">
                    <span className="evidence-count">
                      {displayTable.rows.length}
                    </span>
                    <span>{copy.matching}</span>
                    <Icon name="check" />
                  </strong>
                  <span className="calculation-operation">
                    {displayResult?.calculation?.operation}
                  </span>
                </div>
                <div className="table-wrap">
                  <ResultTable
                    table={displayTable}
                    caption={copy.tableCaption}
                    emptyMessage={copy.emptyResult}
                  />
                </div>
                {result.rows.length > 0 && (
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
                          {row.columns
                            .map((column) => `${column.label}: ${column.value}`)
                            .join("; ")}
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
                )}
                <details
                  className="calculation-details"
                  id="calculation-details"
                >
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
            {displayOutcome === "PARTIALLY_RESOLVED" && (
              <div className="gap-block">
                <strong>{copy.whatFound}</strong>
                <p>{displayResult?.meaning}</p>
              </div>
            )}
            {result.gaps.length > 0 && (
              <div className="gap-block">
                <strong>
                  {displayOutcome === "PARTIALLY_RESOLVED"
                    ? copy.whatMissing
                    : copy.unresolved}
                </strong>
                {displayResult?.gaps.map((gap) => (
                  <p key={gap}>{gap}</p>
                ))}
              </div>
            )}
            {displayOutcome === "EVIDENCE_CONFLICT" && (
              <div className="gap-block">
                <strong>{copy.nextSteps}</strong>
                <p>{copy.conflictNext}</p>
              </div>
            )}
            <details
              className="scope"
              id="what-we-checked"
              open={result.gaps.length > 0}
            >
              <summary>{copy.scope}</summary>
              <p>{displayResult?.searchScope}</p>
            </details>
            {result.executionReceipt && displayTable && (
              <p className="supporting-copy">
                {copy.provenance(
                  result.rows.reduce(
                    (count, row) => count + row.lineage.length,
                    0,
                  ),
                  new Date(result.executionReceipt.executedAt).toLocaleString(
                    language === "hi" ? "hi-IN" : "en-IN",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  ),
                )}
              </p>
            )}
            <div className="result-actions">
              {displayOutcome === "SOURCE_RESOLVED" &&
                (displayResult?.evidence[0]?.url ? (
                  <ExternalLink
                    className="action-button"
                    href={displayResult.evidence[0].url}
                    language={language}
                  >
                    {copy.viewSource}
                  </ExternalLink>
                ) : (
                  <button
                    className="action-button"
                    onClick={() =>
                      document
                        .getElementById("source-list")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    {copy.viewEarlierResponse}
                  </button>
                ))}
              {displayOutcome === "OFFICIAL_SERVICE_ROUTE" &&
                displayResult?.serviceRoute && (
                  <ExternalLink
                    className="action-button"
                    href={displayResult.serviceRoute.officialUrl}
                    language={language}
                  >
                    {copy.goToOfficialService}
                  </ExternalLink>
                )}
              {displayOutcome === "PARTIALLY_RESOLVED" && (
                <button className="action-button" onClick={openDraft}>
                  {copy.prepareMissing}
                </button>
              )}
              {displayOutcome === "FORMAL_RESPONSE_REQUIRED" && (
                <button className="action-button" onClick={openDraft}>
                  {copy.prepare}
                </button>
              )}
              {displayOutcome === "EVIDENCE_CONFLICT" && (
                <button className="action-button" onClick={openDraft}>
                  {copy.prepareClarification}
                </button>
              )}
              {(displayOutcome === "NO_RELIABLE_FINDING" ||
                displayOutcome === "OUTSIDE_SNAPSHOT_COVERAGE") && (
                <button className="action-button" onClick={openDraft}>
                  {copy.prepare}
                </button>
              )}
              {displayOutcome === "SOURCE_RESOLVED" && (
                <button className="secondary-button" onClick={openDraft}>
                  {copy.citizenOverride}
                </button>
              )}
              {displayOutcome === "DERIVED_FINDING" && (
                <button className="secondary-button" onClick={openDraft}>
                  {copy.prepareAnyway}
                </button>
              )}
              {displayOutcome === "OFFICIAL_SERVICE_ROUTE" && (
                <button className="secondary-button" onClick={openDraft}>
                  {copy.citizenOverride}
                </button>
              )}
              {displayOutcome === "EVIDENCE_CONFLICT" && (
                <button
                  className="secondary-button"
                  onClick={() =>
                    document
                      .getElementById("source-list")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  {copy.compareSources}
                </button>
              )}
              {displayOutcome === "NO_RELIABLE_FINDING" && (
                <button
                  className="secondary-button"
                  onClick={() =>
                    document
                      .getElementById("what-we-checked")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  {copy.seeWhatChecked}
                </button>
              )}
              {displayOutcome === "PARTIALLY_RESOLVED" && (
                <button
                  className="secondary-button"
                  onClick={editConfirmedNeed}
                >
                  {copy.correction}
                </button>
              )}
              <button
                className="secondary-button"
                onClick={downloadEvidenceBrief}
              >
                {copy.saveBrief}
              </button>
            </div>
            {briefFeedback && (
              <p className="download-feedback" role="status" aria-live="polite">
                <span
                  className="status-icon inline-status-icon"
                  aria-hidden="true"
                >
                  {briefFeedback === copy.briefFailed ? "ⓘ" : "✓"}
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
                  {filingPackage?.route.officialUrl ? (
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
                    copy.demoRoute
                  )}
                </dd>
              </div>
              {filingPackage && (
                <div>
                  <dt>{copy.verified}</dt>
                  <dd>
                    {filingPackage.route.officialUrl ? (
                      <>
                        {copy.routeChecked}.{" "}
                        {filingPackage.route.profile.verifiedAt}.{" "}
                        {copy.routeVerification}
                      </>
                    ) : (
                      <p className="route-disclosure">
                        <strong>{copy.demoRoute}.</strong>{" "}
                        {copy.demoRouteDisclosure}
                      </p>
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
                {copy.characters}: {draftValidation()?.characterCount ?? 0}/
                {filingPackage.route.profile.text.maxChars}
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
            {filingPackage && (
              <div className="result-actions">
                <button
                  className="action-button"
                  onClick={continueToFiling}
                  disabled={!filingDemoReady}
                >
                  {copy.continueFiling}
                </button>
                <button
                  className="secondary-button"
                  onClick={saveCurrentDraft}
                  disabled={draftDiverged || draftIsInvalid}
                >
                  {copy.saveDraft}
                </button>
              </div>
            )}
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
          <ol className="stepper" aria-label={copy.stepperAria}>
            {["otp", "identity", "review", "payment"].map((step, index) => (
              <li
                className={filingStep === step ? "step active" : "step"}
                key={step}
                aria-current={filingStep === step ? "step" : undefined}
              >
                {index + 1}.{" "}
                {step === "otp"
                  ? copy.stepOtp.replace("1. ", "")
                  : step === "identity"
                    ? copy.stepIdentity.replace("2. ", "")
                    : step === "review"
                      ? copy.stepReview.replace("3. ", "")
                      : copy.stepPayment.replace("4. ", "")}
              </li>
            ))}
          </ol>
          <section className="active-plane filing-plane">
            {filingStep === "otp" && (
              <div>
                <h2>{copy.otpTitle}</h2>
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
                <h2>{copy.applicantTitle}</h2>
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
                <h2>{copy.reviewTitle}</h2>
                <p className="supporting-copy">{copy.reviewPrompt}</p>
                <div className="review-summary">
                  <p className="error-message" role="note">
                    <Icon name="info" /> {copy.reviewWarning}
                  </p>
                  <dl>
                    <div>
                      <dt>{copy.request}</dt>
                      <dd>{filingPackage.draft.text}</dd>
                    </div>
                    <div>
                      <dt>{copy.to}</dt>
                      <dd>
                        {localizeText(
                          filingPackage.holder.canonicalName,
                          language,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.fictionalApplicant}</dt>
                      <dd>
                        {displayProfile.fullName}, {displayProfile.email},{" "}
                        {displayProfile.address}, {displayProfile.state},{" "}
                        {displayProfile.pinCode}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.mockFee}</dt>
                      <dd>₹10</dd>
                    </div>
                  </dl>
                  <p>
                    {filingPackage.route.officialUrl
                      ? copy.componentSummary
                      : copy.genericComponentSummary}
                  </p>
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
                <h2>{copy.paymentTitle}</h2>
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
