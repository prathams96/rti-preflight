"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type {
  InformationNeed,
  Language,
  NeedInterpretation,
  RenderableResolution,
  ResolutionPreference,
} from "../domain/types";
import { CPCB_CONFLICT_DECISION, SCENARIO_PROMPTS } from "../content/scenarios";
import { DISCLOSURE_LEDGER } from "../disclosure/ledger";
import {
  createFilingModule,
  detectDraftDivergence,
  NORTHERN_RAILWAY_HOLDER,
  NORTHERN_RAILWAY_ROUTE,
  validateDemoStep,
  validateDraft,
  type DemoAcknowledgement,
  type DemoStep,
  type FictionalFilingProfile,
  type ValidatedFilingPackage,
} from "../filing";
import { normaliseNeedPhrase } from "../filing/phrase";
import { EPFO_CLAIM_STATUS_ROUTE } from "../service/epfo-route";
import { serializeEvidenceBrief } from "../evidence/brief";
import { createTraceRecorder, generateTraceId } from "../observability";

type Phase =
  | "start"
  | "select"
  | "confirm"
  | "search"
  | "result"
  | "draft"
  | "file"
  | "acknowledgement";
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
  draftText: string;
  package?: ValidatedFilingPackage;
  step: DemoStep;
  otp: string;
  profile: FictionalFilingProfile;
  reviewed: boolean;
  paymentConfirmed: boolean;
  acknowledgement?: DemoAcknowledgement;
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

type IconName = "mark" | "info" | "external" | "check" | "warning" | "pending";

function Icon({ name }: { name: IconName }) {
  const paths = {
    mark: <path d="M4 12h4m4 0h8M12 4v4m0 4v8M5.5 5.5l3 3m5 5 5 5" />,
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
const LEGACY_RESEARCH_KEY = "rti-preflight-draft";
const LEGACY_FILING_KEY = "rti-preflight-filing";
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
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
  ].every((key) => typeof value[key] === "string") &&
  Array.isArray(value.unresolvedClarifications);
const validSavedState = (value: unknown): value is SavedState => {
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
  if (value.phase === "confirm" || value.phase === "search")
    return isNeed(value.need);
  if (value.phase === "result")
    return isNeed(value.need) && isObject(value.result);
  return true;
};
const validFilingState = (value: unknown): value is SessionFilingState =>
  isObject(value) &&
  ["draft", "file", "acknowledgement"].includes(value.phase as string) &&
  typeof value.draftText === "string" &&
  isObject(value.package) &&
  ["otp", "identity", "review", "payment", "confirmation"].includes(
    value.step as string,
  );

const COPY = {
  en: {
    independent: "Independent prototype — not a government service.",
    headline: "Find out before you file an RTI",
    supporting:
      "Ask for public information in your own words. We’ll check published government sources first and help prepare an RTI when needed.",
    label: "What public information are you looking for?",
    privacy:
      "Do not enter passwords, OTPs, Aadhaar, PAN, EPIC, or account numbers.",
    submit: "Check what's already public",
    details: "Prototype details",
    examples: "Try one of these",
    confirm: "Is this what you're asking for?",
    search: "Search published sources",
    edit: "Edit",
    restart: "Start over",
    result: "Result",
    searching: "Checking published government records",
    searchingDetail: "No government system is being accessed.",
    back: "Back to confirmed need",
    askStage: "Step 1 of 3 · Ask",
    multipleStage: "Ask · Multiple needs",
    confirmStage: "Step 2 of 3 · Check",
    searchStage: "Step 3 of 3 · Searching",
    resultStage: "Result",
    selectTitle: "Choose one Information Need to continue",
    selectIntro:
      "We kept your original wording and separated the needs so each one can be checked clearly.",
    oneNeed:
      "Only one need is active at a time. You can start another Preflight later.",
    measure: "Information or measure requested",
    geography: "Geography",
    period: "Period",
    breakdown: "Requested breakdown",
    holder: "Likely to hold this",
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
    inspectEvidence: "Inspect row evidence",
    inspectRow: (geography: string) =>
      `Inspect ${geography} operands and source cells`,
    viewPlan: "View the registered calculation plan",
    saveBrief: "Save/share Evidence Brief",
    briefSaved: "Evidence Brief downloaded.",
    briefShared: "Evidence Brief shared.",
    briefCancelled: "Sharing was cancelled. The result remains available here.",
    briefFailed:
      "We couldn’t save this Evidence Brief. The result remains available here.",
    sourceData: "Real official public data",
    publisher: "Publisher",
    applicablePeriod: "Applicable period",
    locatedValues: "Located values",
    openSource: "Open official source",
    prepare: "Prepare an RTI",
    prepareAnyway: "Prepare an RTI anyway",
    citizenOverride: "Still need an official response? Prepare an RTI",
    openRoute: "Open official service route",
    footer: "Research is anonymous until you choose to save or file.",
    language: "हिन्दी",
    draftStage: "Your RTI request",
    draftTitle: "Your RTI request",
    to: "Information Holder",
    request: "Request",
    route: "Official Filing Route",
    verified: "Last checked",
    characters: "characters",
    continueFiling: "Continue to filing",
    saveDraft: "Save draft",
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
    fileStage: "Filing (demo)",
    fileTitle: "File your RTI (demo)",
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
    confirmDemo: "Confirm demo submission",
    acknowledgementStage: "Done",
    acknowledgementTitle: "That's how filing works",
    fictionalRegistration: "Fictional registration",
    noGovernment:
      "No request, payment, or personal information was sent to a government system.",
    downloadPackage: "Download Filing Package",
    startAnother: "Ask something else",
    correction: "This isn’t what I asked",
    challenge: "This source doesn’t support the claim",
    challengePending:
      "This citation is challenged. The result is downgraded pending revalidation.",
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
    fictionalTime: "Submitted",
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
    askReassurance: "Free · takes about 20 seconds · nothing is filed yet",
    confirmIntro:
      "We rewrote your question so it can be checked against official records. Correct anything that's wrong — this is exactly what we'll search for.",
    statutoryTimeline:
      "Under the RTI Act, the authority must reply within 30 days.",
    realWorldNext:
      "In a real filing you'd now get an acknowledgement number by email, and the authority has 30 days to reply.",
    provenance: (count: number, date: string) =>
      `Checked against ${count} official values · last verified ${date}`,
  },
  hi: {
    independent: "स्वतंत्र प्रोटोटाइप — कोई सरकारी सेवा नहीं।",
    headline: "RTI दाखिल करने से पहले पता करें",
    supporting:
      "सार्वजनिक जानकारी अपने शब्दों में पूछें। हम पहले प्रकाशित सरकारी स्रोत देखेंगे और ज़रूरत होने पर RTI तैयार करने में मदद करेंगे।",
    label: "आप कौन-सी सार्वजनिक जानकारी ढूँढ रहे हैं?",
    privacy: "पासवर्ड, OTP, आधार, PAN, EPIC या खाता नंबर दर्ज न करें।",
    submit: "पहले देखें कि क्या पहले से सार्वजनिक है",
    details: "प्रोटोटाइप विवरण",
    examples: "इनमें से कोई आज़माएँ",
    confirm: "क्या आप यही पूछना चाहते हैं?",
    search: "प्रकाशित स्रोत खोजें",
    edit: "बदलें",
    restart: "फिर से शुरू करें",
    result: "नतीजा",
    searching: "प्रकाशित सरकारी रिकॉर्ड देख रहे हैं",
    searchingDetail: "किसी सरकारी सिस्टम को नहीं देखा जा रहा है।",
    back: "पुष्टि की गई ज़रूरत पर लौटें",
    askStage: "चरण 1/3 · पूछें",
    multipleStage: "पूछें · कई ज़रूरतें",
    confirmStage: "चरण 2/3 · जाँचें",
    searchStage: "चरण 3/3 · खोज रहे हैं",
    resultStage: "नतीजा",
    selectTitle: "जारी रखने के लिए एक सूचना-ज़रूरत चुनें",
    selectIntro:
      "हमने आपके मूल शब्द रखे हैं और ज़रूरतों को अलग किया है ताकि हर ज़रूरत को स्पष्ट रूप से जाँचा जा सके।",
    oneNeed:
      "एक समय में केवल एक ज़रूरत सक्रिय है। बाद में एक और Preflight शुरू कर सकते हैं।",
    measure: "मांगी गई जानकारी या माप",
    geography: "भूगोल",
    period: "अवधि",
    breakdown: "मांगा गया विवरण",
    holder: "संभावित सूचना-धारक",
    preference: "आपको किस तरह का उत्तर चाहिए?",
    prefPublished: "प्रकाशित सरकारी स्रोत से विश्वसनीय जानकारी",
    prefFormal: "किसी लोक प्राधिकरण से नया लिखित उत्तर",
    prefUnsure: "मुझे नहीं पता — तय करने में मदद करें",
    clarification: "महत्वपूर्ण स्पष्टीकरण",
    unsure: "मैं निश्चित नहीं हूँ",
    calculation: "गणना",
    matching: "मिलती पंक्तियाँ",
    unresolved: "क्या अभी अनसुलझा है",
    scope: "प्रोटोटाइप Evidence Snapshot पर आधारित खोज · दायरा देखें",
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
    inspectRow: (geography: string) =>
      `${geography} के operands और स्रोत सेल देखें`,
    viewPlan: "पंजीकृत गणना योजना देखें",
    saveBrief: "Evidence Brief सहेजें/साझा करें",
    briefSaved: "Evidence Brief डाउनलोड हो गया।",
    briefShared: "Evidence Brief साझा हो गया।",
    briefCancelled: "साझा करना रद्द किया गया। नतीजा यहाँ उपलब्ध है।",
    briefFailed: "Evidence Brief सहेजा नहीं जा सका। नतीजा यहाँ उपलब्ध है।",
    sourceData: "वास्तविक आधिकारिक सार्वजनिक डेटा",
    publisher: "प्रकाशक",
    applicablePeriod: "लागू अवधि",
    locatedValues: "स्थित मान",
    openSource: "आधिकारिक स्रोत खोलें",
    prepare: "RTI तैयार करें",
    prepareAnyway: "फिर भी RTI तैयार करें",
    citizenOverride: "फिर भी आधिकारिक उत्तर चाहिए? RTI तैयार करें",
    openRoute: "आधिकारिक सेवा मार्ग खोलें",
    footer: "जब तक आप सहेजना या दाखिल करना न चुनें, शोध गुमनाम है।",
    language: "English",
    draftStage: "आपका RTI अनुरोध",
    draftTitle: "आपका RTI अनुरोध",
    to: "सूचना-धारक",
    request: "अनुरोध",
    route: "आधिकारिक Filing Route",
    verified: "अंतिम जाँच",
    characters: "अक्षर",
    continueFiling: "फाइलिंग पर जाएँ",
    saveDraft: "ड्राफ्ट सहेजें",
    savedDraft: "सहेजा गया Filing Draft",
    returnResult: "नतीजे पर लौटें",
    guidedUnavailable:
      "इस प्राधिकरण के लिए निर्देशित फाइलिंग इस प्रोटोटाइप में उपलब्ध नहीं है। आप इस draft की नकल करके स्वयं उस प्राधिकरण के RTI माध्यम से दाखिल कर सकते हैं।",
    divergenceTitle: "यह बदलाव दूसरी Information Need जोड़ सकता है",
    divergenceBody:
      "ड्राफ्ट पर नियंत्रण रखने का तरीका चुनें। कुछ भी छोटा या चुपचाप बदला नहीं जाएगा।",
    keepWritten: "जैसा लिखा है वैसा रखें",
    separateNeed: "दूसरे Saved Preflight में अलग करें",
    undoChanges: "बदलाव वापस लें",
    fileStage: "फाइलिंग (डेमो)",
    fileTitle: "अपनी RTI दाखिल करें (डेमो)",
    stepOtp: "1. सत्यापन",
    stepIdentity: "2. आपका विवरण",
    stepReview: "3. समीक्षा",
    stepPayment: "4. शुल्क",
    otpPrompt: "हैकाथॉन प्रोटोटाइप: OTP 123456 डालें। कोई SMS नहीं भेजा गया।",
    verifyOtp: "Demo OTP सत्यापित करें",
    identityPrompt: "ये विवरण काल्पनिक हैं और session state में रहते हैं।",
    continue: "जारी रखें",
    reviewPrompt: "Payment से पहले पूरे Filing Package की समीक्षा करें।",
    confirmPackage: "मैं इस पूरे Filing Package की पुष्टि करता/करती हूँ",
    paymentPrompt: "Demo Payment: ₹10 · Demo UPI",
    noRealPayment: "कोई वास्तविक payment नहीं होगा।",
    confirmDemo: "Demo submission की पुष्टि करें",
    acknowledgementStage: "पूरा हुआ",
    acknowledgementTitle: "फाइलिंग ऐसे होती है",
    fictionalRegistration: "काल्पनिक पंजीकरण",
    noGovernment:
      "किसी सरकारी सिस्टम को अनुरोध, payment या व्यक्तिगत जानकारी नहीं भेजी गई।",
    downloadPackage: "Filing Package डाउनलोड करें",
    startAnother: "कुछ और पूछें",
    correction: "यह वह नहीं है जो मैंने पूछा था",
    challenge: "यह स्रोत इस दावे का समर्थन नहीं करता",
    challengePending:
      "इस citation को चुनौती दी गई है। पुनः सत्यापन तक नतीजे को downgrade किया गया है।",
    draftLabel: "Filing Draft",
    routeNotVerified: "इस प्रोटोटाइप में route जानकारी सत्यापित नहीं है",
    routeVerification:
      "इस तारीख को अंतिम बार जाँची गई route जानकारी के आधार पर सत्यापित; बाहरी स्वीकृति की गारंटी नहीं है।",
    unverified: "असत्यापित",
    draftHelp:
      "इसे बेझिझक बदलें — हम आपके शब्द नहीं बदलेंगे। यह कारण नहीं, रिकॉर्ड माँगता है, जिसका आपको RTI अधिनियम के तहत अधिकार है।",
    divergenceSaved:
      "ड्राफ्ट editing के लिए सहेजा गया है, लेकिन अतिरिक्त ज़रूरत हटाने या अलग करने तक filing रोकी गई है।",
    editDraft: "Filing Draft बदलें",
    demoOtp: "Demo OTP",
    name: "नाम",
    email: "ईमेल",
    address: "पता",
    state: "राज्य",
    pin: "PIN",
    routeLine: "Route",
    fictionalApplicant: "आवेदक",
    mockFee: "शुल्क",
    componentSummary:
      "Working: route validation। Simulated: OTP, identity, payment, filing और acknowledgement।",
    paymentCredentials:
      "कोई UPI ID, card, CVV, bank या payment credential नहीं लिया जाता।",
    paymentCheck: "मैं समझता/समझती हूँ कि यह simulated payment step है।",
    fictionalTime: "जमा किया गया",
    submittedDraft: "Submitted draft snapshot",
    draftAria: "Filing Draft",
    stepperAria: "Simulated filing steps",
    prepareFailure: "अभी Filing Draft तैयार नहीं हो सका।",
    revalidationError:
      "Filing से पहले इस Filing Draft का फिर से सत्यापन ज़रूरी है। अतिरिक्त ज़रूरत हटाएँ या उसे दूसरे Saved Preflight में अलग करें।",
    divergenceSeparate:
      "बदला हुआ text यहाँ रखा गया है और अलग Saved Preflight के लिए चिह्नित है।",
    savedPreflights: "Saved Preflights",
    resume: "फिर शुरू करें",
    originalNeed: "मूल पुष्टि की गई Information Need",
    separatedDraft: "अलग किया गया draft समझें",
    cpcbCut:
      "जब तक दो संगत आधिकारिक स्रोत सहमत नहीं होते, वायु-गुणवत्ता के नतीजे नहीं दिखाए जाते। ऐसा आँकड़ा दिखाने से बेहतर है कुछ न दिखाना जिस पर हम भरोसा न कर सकें।",
    askReassurance: "निःशुल्क · लगभग 20 सेकंड · अभी कुछ दाखिल नहीं हो रहा",
    confirmIntro:
      "हमने आपके प्रश्न को इस तरह लिखा है कि उसे आधिकारिक रिकॉर्ड से जाँचा जा सके। कुछ ग़लत हो तो सुधार लें — हम बिलकुल यही खोजेंगे।",
    statutoryTimeline:
      "RTI अधिनियम के तहत प्राधिकरण को 30 दिनों में उत्तर देना होता है।",
    realWorldNext:
      "असली फाइलिंग में अब आपको ईमेल पर पावती संख्या मिलती और प्राधिकरण को 30 दिनों में उत्तर देना होता।",
    provenance: (count: number, date: string) =>
      `${count} आधिकारिक मानों से मिलान किया गया · अंतिम सत्यापन ${date}`,
  },
} as const;

const outcomeLabel: Record<string, string> = {
  DERIVED_FINDING: "Calculated from official figures",
  SOURCE_RESOLVED: "Source-Resolved",
  NO_RELIABLE_FINDING: "No answer found in the records we checked",
  OUTSIDE_SNAPSHOT_COVERAGE: "Outside what we've checked",
  OFFICIAL_SERVICE_ROUTE: "Official Service Route",
  PARTIALLY_RESOLVED: "Partially Resolved",
  EVIDENCE_CONFLICT: "Evidence Conflict",
  FORMAL_RESPONSE_REQUIRED: "Formal Response Required",
};
const outcomeLabelHi: Record<string, string> = {
  DERIVED_FINDING: "आधिकारिक आँकड़ों से गणना की गई",
  SOURCE_RESOLVED: "स्रोत से हल",
  NO_RELIABLE_FINDING: "जिन रिकॉर्ड को हमने देखा उनमें उत्तर नहीं मिला",
  OUTSIDE_SNAPSHOT_COVERAGE: "हमने जो देखा उससे बाहर",
  OFFICIAL_SERVICE_ROUTE: "आधिकारिक सेवा मार्ग",
  PARTIALLY_RESOLVED: "आंशिक रूप से हल",
  EVIDENCE_CONFLICT: "प्रमाण में विरोध",
  FORMAL_RESPONSE_REQUIRED: "औपचारिक उत्तर ज़रूरी",
};

function persist(state: SavedState) {
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

function readPersistedState(): SavedState | undefined {
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
    clearPrototypeStorage();
    return undefined;
  }
}

function readSessionFilingState(): SessionFilingState | undefined {
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
    clearPrototypeStorage();
    return undefined;
  }
}

function clearPrototypeStorage() {
  try {
    [RESEARCH_KEY, FILING_KEY, LEGACY_RESEARCH_KEY, LEGACY_FILING_KEY].forEach(
      (key) => {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      },
    );
  } catch {
    /* optional storage */
  }
}

function readSavedPreflights(): SavedPreflight[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem("rti-preflight-saved") ?? "[]",
    ) as SavedPreflight[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function Details({
  onClose,
  copy,
}: {
  onClose: () => void;
  copy: { cpcbCut: string };
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
            <p className="eyebrow">Disclosure</p>
            <h2 id="details-title">Prototype details</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close prototype details"
          >
            ×
          </button>
        </div>
        <p>
          This is an independent research assistant—not an official RTI
          response.
        </p>
        <dl className="details-list">
          {DISCLOSURE_LEDGER.map((entry) => (
            <div key={entry.id}>
              <dt>{entry.label}</dt>
              <dd>{entry.disclosure}</dd>
            </div>
          ))}
        </dl>
        <div className="route-provenance">
          <h3>Verified Filing Route profile</h3>
          <p>
            Northern Railway route profile v
            {NORTHERN_RAILWAY_ROUTE.profile.version}, verified{" "}
            {NORTHERN_RAILWAY_ROUTE.profile.verifiedAt}.
          </p>
          <ul>
            {NORTHERN_RAILWAY_ROUTE.profile.constraintSources?.map(
              (constraint) => (
                <li key={constraint.id}>
                  {constraint.label}{" "}
                  {constraint.sourceUrls.map((url) => (
                    <ExternalLink href={url} key={url}>
                      Official source
                    </ExternalLink>
                  ))}
                </li>
              ),
            )}
          </ul>
        </div>
        <div className="route-provenance">
          <h3>EPFO Official Service Route</h3>
          <p>
            {EPFO_CLAIM_STATUS_ROUTE.purpose}; verified{" "}
            {EPFO_CLAIM_STATUS_ROUTE.verificationDate}. This is route metadata,
            not a retrieved personal record.
          </p>
          {EPFO_CLAIM_STATUS_ROUTE.primarySourceUrls.map((url) => (
            <ExternalLink href={url} key={url}>
              Official EPFO source
            </ExternalLink>
          ))}
        </div>
        <div className="route-provenance">
          <h3>CPCB conflict scenario</h3>
          <p>{copy.cpcbCut}</p>
          <p>
            Decision recorded {CPCB_CONFLICT_DECISION.decidedAt}; no conflict
            evidence is registered.
          </p>
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
  const [savedPreflightsLoaded, setSavedPreflightsLoaded] = useState(false);
  const [resumeState, setResumeState] = useState<SavedState | undefined>();
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const copy = COPY[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

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
    if (phase !== "start")
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
        "rti-preflight-saved",
        JSON.stringify(savedPreflights),
      );
    } catch {
      /* optional saved-preflight persistence */
    }
  }, [savedPreflights, savedPreflightsLoaded]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readSessionFilingState();
      if (!saved) return;
      setDraftText(saved.draftText);
      setDraftOriginalText(saved.draftText);
      setFilingPackage(saved.package);
      setFilingStep(saved.step);
      setOtp(saved.otp);
      setProfile(saved.profile);
      setReviewed(saved.reviewed);
      setPaymentConfirmed(saved.paymentConfirmed);
      setAcknowledgement(saved.acknowledgement);
      setPhase(saved.phase);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "draft" && phase !== "file" && phase !== "acknowledgement")
      return;
    try {
      window.sessionStorage.setItem(
        FILING_KEY,
        JSON.stringify({
          version: 2,
          state: {
            phase,
            draftText,
            package: filingPackage,
            step: filingStep,
            otp,
            profile,
            reviewed,
            paymentConfirmed,
            acknowledgement,
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
  ]);

  const updateNeed = (field: keyof InformationNeed, value: string) => {
    if (!need) return;
    const next = { ...need, [field]: value } as InformationNeed;
    if (
      next.scenario === "unsupported" &&
      next.informationHolder !== "To be confirmed" &&
      next.informationHolder !== "Unknown" &&
      next.geography !== "Not yet specified" &&
      next.period !== "Not yet specified"
    )
      next.unresolvedClarifications = [];
    setNeed(next);
  };
  const unresolvedClarifications =
    need?.unresolvedClarifications.filter(
      (item) => !item.startsWith("Unknown:"),
    ) ?? [];
  function resumePrevious() {
    if (!resumeState) return;
    setLanguage(resumeState.language);
    setPhase(resumeState.phase);
    setText(resumeState.text);
    setNeeds(resumeState.needs ?? (resumeState.need ? [resumeState.need] : []));
    setNeed(resumeState.need);
    setResult(resumeState.result);
    setChallengedEvidenceId(resumeState.challengedEvidenceId ?? "");
    setChallengedNeedSignature(resumeState.challengedNeedSignature ?? "");
    setResumeState(undefined);
  }

  function openDraft() {
    if (!need) return;
    setDraftError("");
    setDivergenceChoice("");
    if (
      filingPackage?.draft.needId === need.id &&
      filingPackage.confirmedNeed.canonicalNeed === need.canonicalNeed
    ) {
      setPhase("draft");
      return;
    }
    if (need.scenario === "railway-filing") {
      void filingModule
        .prepare({
          need,
          holder: NORTHERN_RAILWAY_HOLDER,
          route: NORTHERN_RAILWAY_ROUTE,
        })
        .then((prepared) => {
          traceRecorder.record("route.validated", journeyTraceId, {
            component: "filing-route",
            version: prepared.route.profile.version,
            status: "working",
            code: prepared.route.id,
          });
          setFilingPackage(prepared);
          setDraftText(prepared.draft.text);
          setDraftOriginalText(prepared.draft.text);
          setFilingError("");
          setPhase("draft");
        })
        .catch(() => {
          setDraftError(copy.prepareFailure);
        });
      return;
    }
    setFilingPackage(undefined);
    setDraftOriginalText(
      `Please provide records showing ${normaliseNeedPhrase(need.canonicalNeed)}.\n\nPlease provide the records in electronic form.`,
    );
    setDraftText(
      `Please provide records showing ${normaliseNeedPhrase(need.canonicalNeed)}.\n\nPlease provide the records in electronic form.`,
    );
    setPhase("draft");
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
      setDraftError(validation.errors.join(" "));
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
    setFilingPackage(updatedPackage);
    setFilingError("");
    setFilingStep("otp");
    setPhase("file");
  }

  function handleDraftChange(value: string) {
    setDraftText(value);
    setDraftError("");
    setDivergenceChoice("");
  }

  function separateDraftIntoNewPreflight() {
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
      id: `${need?.id ?? "preflight"}-separated-${Date.now()}`,
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
    setFilingPackage(undefined);
    setAcknowledgement(undefined);
    setPhase("start");
    setDivergenceChoice("separate");
  }

  function resumeSavedPreflight(saved: SavedPreflight) {
    setLanguage(saved.language);
    setText(saved.text);
    setNeeds(saved.need ? [saved.need] : []);
    setNeed(saved.need);
    setResult(saved.result);
    setFilingPackage(saved.filingPackage);
    setDraftText(saved.draftText ?? "");
    setDraftOriginalText(saved.draftOriginalText ?? saved.draftText ?? "");
    setPhase(saved.phase ?? (saved.result ? "result" : "start"));
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
    setChallengedEvidenceId(evidenceId);
    setChallengedNeedSignature(needSignature(need));
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
        setFilingError(
          "The Filing Package must be valid and explicitly confirmed before Demo Submission.",
        );
      });
  }

  function downloadPackage() {
    if (!filingPackage || !acknowledgement || !need) return;
    const serialized = filingModule.serializeArtifact({
      package: filingPackage,
      profile,
      fee: { amountInr: 10, method: "demo_upi" },
      acknowledgement,
    });
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(serialized)}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = "rti-preflight-filing-package.json";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function saveOrShareEvidenceBrief() {
    if (!need || !result) return;
    setBriefFeedback("");
    try {
      const serialized = serializeEvidenceBrief({
        need,
        result,
        searchDate:
          result.executionReceipt?.executedAt.slice(0, 10) ??
          new Date().toISOString().slice(0, 10),
      });
      const blob = new Blob([serialized], { type: "application/json" });
      const file = new File([blob], "rti-preflight-evidence-brief.json", {
        type: "application/json",
      });
      if (
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        try {
          await navigator.share({
            title: "RTI Preflight Evidence Brief",
            text: "Independent research assistant—not an official RTI response.",
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
      link.download = "rti-preflight-evidence-brief.json";
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

  async function interpret() {
    if (!text.trim() || isInterpreting) return;
    setError("");
    setIsInterpreting(true);
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
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as NeedInterpretation & {
        message?: string;
      };
      if (!response.ok || !payload.needs?.length)
        throw new Error(
          payload.message ??
            "We couldn’t interpret your request just now. Nothing was submitted.",
        );
      traceRecorder.record("interpretation.completed", payload.traceId, {
        component: "interpretation-route",
        version: "interpretation-route-v1",
        status: "ok",
        counts: { needs: payload.needs.length },
      });
      setNeeds(payload.needs);
      setNeed(payload.needs[0]);
      setPhase(payload.needs.length > 1 ? "select" : "confirm");
    } catch (caught) {
      traceRecorder.record("interpretation.completed", journeyTraceId, {
        component: "interpretation-route",
        version: "interpretation-route-v1",
        status: "error",
        code: "interpretation-unavailable",
      });
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t interpret your request just now. Nothing was submitted.",
      );
    } finally {
      setIsInterpreting(false);
    }
  }
  async function resolve() {
    if (!need) return;
    if (
      challengedEvidenceId &&
      challengedNeedSignature === needSignature(need)
    ) {
      setError(
        "Change and reconfirm the Information Need before rechecking this challenged source.",
      );
      setPhase("confirm");
      return;
    }
    setError("");
    setPhase("search");
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
        body: JSON.stringify({ need }),
      });
      const payload = (await response.json()) as RenderableResolution & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ??
            "We couldn’t check the prototype snapshot just now.",
        );
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
      setPhase("result");
    } catch (caught) {
      traceRecorder.record("resolution.completed", journeyTraceId, {
        component: "resolution-route",
        version: "resolution-route-v1",
        status: "error",
        code: "resolution-unavailable",
      });
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t check the prototype snapshot just now.",
      );
      setPhase("confirm");
    }
  }
  function reset() {
    setPhase("start");
    setText("");
    setNeeds([]);
    setNeed(undefined);
    setResult(undefined);
    setChallengedEvidenceId("");
    setChallengedNeedSignature("");
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
      window.localStorage.removeItem("rti-preflight-saved");
    } catch {
      /* no-op */
    }
    setResumeState(undefined);
  }
  const displayOutcome = challengedEvidenceId
    ? "PARTIALLY_RESOLVED"
    : result?.outcome;
  const draftDiverged = Boolean(
    need && detectDraftDivergence(need, draftText).diverged,
  );
  const draftIsInvalid = draftValidation()?.valid === false;
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
      </header>
      <div className="brand-row">
        <div className="wordmark">
          <span className="wordmark-mark" aria-hidden="true">
            <Icon name="mark" />
          </span>
          <span>RTI Preflight</span>
        </div>
        <button
          className={`language-toggle language-toggle-${language}`}
          onClick={() => setLanguage(language === "en" ? "hi" : "en")}
          aria-label={`Switch language to ${copy.language}`}
        >
          {copy.language}
        </button>
      </div>

      {phase === "start" && (
        <section className="start-layout" aria-labelledby="start-title">
          <div className="intro">
            <p className="eyebrow">{copy.askStage}</p>
            <h1 id="start-title">{copy.headline}</h1>
            <p className="lede">{copy.supporting}</p>
          </div>
          {recoveryNotice && (
            <p className="error-message" role="status">
              Your previous prototype session could not be restored. Start a new
              Preflight.
            </p>
          )}
          {resumeState && (
            <aside
              className="resume-panel"
              aria-label="Resume previous Preflight"
            >
              <strong>Resume previous Preflight</strong>
              <p>Your saved prototype journey is ready to continue.</p>
              <div className="button-row">
                <button className="action-button" onClick={resumePrevious}>
                  Resume
                </button>
                <button className="secondary-button" onClick={reset}>
                  Start fresh
                </button>
              </div>
            </aside>
          )}
          <section
            className="active-plane ask-plane"
            aria-label="Ask for public information"
            aria-busy={isInterpreting}
          >
            <label htmlFor="need-input">{copy.label}</label>
            <textarea
              id="need-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              placeholder="For example: How much did my municipality spend on road repairs in 2024-25?"
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
              aria-label={
                isInterpreting ? "Interpreting your need" : copy.submit
              }
            >
              {copy.submit}
            </button>
            <p className="supporting-copy">{copy.askReassurance}</p>
          </section>
          <details className="examples supporting-plane" open>
            <summary>{copy.examples}</summary>
            <div className="scenario-list">
              {SCENARIO_PROMPTS.map((scenario) => (
                <button
                  key={scenario.id}
                  className="scenario"
                  onClick={() => setText(scenario.prompt)}
                >
                  <span>{scenario.prompt}</span>
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

      {phase === "select" && (
        <section className="content-column" aria-labelledby="select-title">
          <p className="eyebrow">{copy.multipleStage}</p>
          <h1 id="select-title">{copy.selectTitle}</h1>
          <p className="lede">{copy.selectIntro}</p>
          <div className="need-options active-plane">
            {needs.map((candidate) => (
              <button
                key={candidate.id}
                className="need-option"
                onClick={() => {
                  setNeed(candidate);
                  setPhase("confirm");
                }}
              >
                <span>{candidate.canonicalNeed}</span>
                <small>{candidate.originalText}</small>
              </button>
            ))}
            <p className="supporting-copy">{copy.oneNeed}</p>
          </div>
        </section>
      )}

      {phase === "confirm" && need && (
        <section className="content-column" aria-labelledby="confirm-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.confirmStage}</p>
              <h1 id="confirm-title">{copy.confirm}</h1>
            </div>
            <button className="text-button" onClick={() => setPhase("start")}>
              {copy.edit}
            </button>
          </div>
          <p className="lede">{copy.confirmIntro}</p>
          <div className="active-plane need-card">
            <p className="card-kicker">{need.originalText}</p>
            <Field
              label={copy.measure}
              value={need.measure}
              onChange={(value) => updateNeed("measure", value)}
            />
            <div className="field-grid">
              <Field
                label={copy.geography}
                value={need.geography}
                onChange={(value) => updateNeed("geography", value)}
              />
              <Field
                label={copy.period}
                value={need.period}
                onChange={(value) => updateNeed("period", value)}
              />
            </div>
            <Field
              label={copy.breakdown}
              value={need.breakdown}
              onChange={(value) => updateNeed("breakdown", value)}
            />
            <Field
              label={copy.holder}
              value={need.informationHolder}
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
            {unresolvedClarifications.map((clarification) => (
              <div className="clarification status-partial" key={clarification}>
                <strong>{copy.clarification}</strong>
                <p>{clarification}</p>
                <p className="supporting-copy">
                  Answer using the fields above, or retain this one detail as
                  unknown.
                </p>
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
            {error && (
              <p className="error-message" role="alert">
                <span aria-hidden="true">!</span>
                {error}
              </p>
            )}
            <div className="button-row">
              <button
                className="action-button"
                disabled={unresolvedClarifications.length > 0}
                onClick={resolve}
              >
                {copy.search}
              </button>
              <button className="secondary-button" onClick={reset}>
                {copy.restart}
              </button>
            </div>
          </div>
        </section>
      )}

      {phase === "search" && (
        <section className="content-column search-state" aria-live="polite">
          <p className="eyebrow">{copy.searchStage}</p>
          <h1>{copy.searching}</h1>
          <p className="lede">{copy.searchingDetail}</p>
          <div className="progress-list">
            {(need?.scenario === "ncrb-property"
              ? [
                  "Confirmed Information Need",
                  "Checked NCRB Table 20A.1 in the prototype Evidence Snapshot",
                  "Applied deterministic filters and validated grounding",
                ]
              : [
                  "Confirmed Information Need",
                  "Checked registered Evidence Snapshot capabilities",
                  "Prepared the supported result state",
                ]
            ).map((stage, index) => (
              <p className={index < 2 ? "done" : "active"} key={stage}>
                <span aria-hidden="true">{index < 2 ? "✓" : "◌"}</span> {stage}
              </p>
            ))}
          </div>
        </section>
      )}

      {phase === "result" && result && (
        <section className="content-column" aria-labelledby="result-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.resultStage}</p>
              <h1 id="result-title">{copy.result}</h1>
            </div>
            <button className="text-button" onClick={() => setPhase("confirm")}>
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
            <h2>{result.headline}</h2>
            <p className="result-meaning">{result.meaning}</p>
            <p className="evidence-status">{result.evidenceStatus}</p>
            {challengedEvidenceId && (
              <p className="error-message" role="status">
                <span aria-hidden="true">!</span>
                {copy.challengePending}
              </p>
            )}
            {result.evidence.length > 0 && (
              <div className="evidence-list" aria-label={copy.evidence}>
                <h3>{copy.evidence}</h3>
                {result.evidence.map((item) => (
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
                            ? `${item.grounding.length} immutable references with content hashes`
                            : "Route metadata; no personal record was retrieved"}
                        </dd>
                      </div>
                    </dl>
                    {item.url ? (
                      <ExternalLink href={item.url}>
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
                      result.serviceRoute && (
                        <div className="route-metadata">
                          <p>
                            {result.serviceRoute.purpose} · {copy.verifiedWord}{" "}
                            {result.serviceRoute.verifiedAt}
                          </p>
                          <ul>
                            {result.serviceRoute.primarySourceUrls.map(
                              (url) => (
                                <li key={url}>
                                  <ExternalLink href={url}>
                                    {copy.officialSource}
                                  </ExternalLink>
                                </li>
                              ),
                            )}
                          </ul>
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
                    {item.alternateUrl && (
                      <ExternalLink
                        className="source-link-secondary"
                        href={item.alternateUrl}
                      >
                        {copy.pinnedCsv}
                      </ExternalLink>
                    )}
                  </article>
                ))}
              </div>
            )}
            {result.rows.length > 0 && (
              <>
                <div className="calculation-strip">
                  <strong>{copy.calculation}</strong>
                  <span>{result.calculation?.operation}</span>
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
                            ₹{row.stolen2021} → ₹{row.stolen2023} crore
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
                        {row.stolen2021} → {row.stolen2023} crore; change{" "}
                        {row.stolenDelta}. Recovery {row.recovery2021}% →{" "}
                        {row.recovery2023}%; change {row.recoveryDelta}.
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
                  <p>{result.calculation?.operation}</p>
                  <ul>
                    {result.calculation?.filters.map((filter) => (
                      <li key={filter}>{filter}</li>
                    ))}
                  </ul>
                  {result.calculationMetadata && (
                    <p className="audit-hashes">
                      Plan {result.calculationMetadata.planHash.slice(0, 12)} ·
                      Engine {result.calculationMetadata.engineVersion} · Policy{" "}
                      {result.calculationMetadata.policyVersion}
                    </p>
                  )}
                </details>
                <p className="caveat">{result.calculation?.caveat}</p>
              </>
            )}
            {result.gaps.length > 0 && (
              <div className="gap-block">
                <strong>{copy.unresolved}</strong>
                {result.gaps.map((gap) => (
                  <p key={gap}>{gap}</p>
                ))}
              </div>
            )}
            <details className="scope" open={result.gaps.length > 0}>
              <summary>{copy.scope}</summary>
              <p>{result.searchScope}</p>
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
              {result.outcome === "OFFICIAL_SERVICE_ROUTE" ? (
                <ExternalLink
                  className="action-button action-link"
                  href={result.evidence[0]?.url ?? ""}
                >
                  {copy.openRoute}
                </ExternalLink>
              ) : (
                <button className="action-button" onClick={openDraft}>
                  {result.outcome === "DERIVED_FINDING" ||
                  result.outcome === "SOURCE_RESOLVED"
                    ? copy.citizenOverride
                    : copy.prepare}
                </button>
              )}
              {result.outcome === "OFFICIAL_SERVICE_ROUTE" && (
                <button className="secondary-button" onClick={openDraft}>
                  {copy.prepare}
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() => {
                  setError("");
                  setPhase("confirm");
                }}
              >
                {copy.correction}
              </button>
              <button className="secondary-button" onClick={reset}>
                {copy.restart}
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

      {phase === "draft" && need && (
        <section className="content-column" aria-labelledby="draft-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.draftStage}</p>
              <h1 id="draft-title">{copy.draftTitle}</h1>
            </div>
            <button className="text-button" onClick={() => setPhase("result")}>
              {copy.returnResult}
            </button>
          </div>
          <section
            className="active-plane draft-plane"
            aria-label={copy.draftAria}
          >
            <dl className="draft-summary">
              <div>
                <dt>{copy.to}</dt>
                <dd>
                  {filingPackage?.holder.canonicalName ??
                    need.informationHolder}
                </dd>
              </div>
              <div>
                <dt>{copy.request}</dt>
                <dd>{need.canonicalNeed}</dd>
              </div>
              <div>
                <dt>{copy.route}</dt>
                <dd>
                  {filingPackage ? (
                    <ExternalLink href={filingPackage.route.officialUrl}>
                      {
                        filingPackage.route.authority.portalNames[
                          filingPackage.route.id
                        ]
                      }
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
                        {filingPackage.route.profile.unverifiedConstraints.join(
                          "; ",
                        )}
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
            <p className="supporting-copy">{copy.statutoryTimeline}</p>
            {draftValidation()?.valid === false && (
              <p className="error-message" role="alert">
                <span aria-hidden="true">!</span>
                {draftValidation()?.errors.join(" ")}
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

      {phase === "file" && filingPackage && (
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
                      setFilingError(validation.errors.join(" "));
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
                    <dd>{profile.fullName}</dd>
                  </div>
                  <div>
                    <dt>{copy.email}</dt>
                    <dd>{profile.email}</dd>
                  </div>
                  <div>
                    <dt>{copy.address}</dt>
                    <dd>{profile.address}</dd>
                  </div>
                  <div>
                    <dt>{copy.state}</dt>
                    <dd>{profile.state}</dd>
                  </div>
                  <div>
                    <dt>{copy.pin}</dt>
                    <dd>{profile.pinCode}</dd>
                  </div>
                </dl>
                <button
                  className="action-button"
                  onClick={() => {
                    const validation = validateDemoStep("identity", {
                      profile,
                    });
                    if (!validation.valid) {
                      setFilingError(validation.errors.join(" "));
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
                  <strong>{filingPackage.holder.canonicalName}</strong>
                  <p>{filingPackage.draft.text}</p>
                  <p>
                    {copy.routeLine}:{" "}
                    {
                      filingPackage.route.authority.portalNames[
                        filingPackage.route.id
                      ]
                    }
                  </p>
                  <p>
                    {copy.fictionalApplicant}: {profile.fullName} ·{" "}
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
                      setFilingError(validation.errors.join(" "));
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
                  <dd>{acknowledgement.holder}</dd>
                </div>
                <div>
                  <dt>{copy.route}</dt>
                  <dd>
                    {
                      filingPackage.route.authority.portalNames[
                        filingPackage.route.id
                      ]
                    }
                  </dd>
                </div>
                <div>
                  <dt>{copy.mockFee}</dt>
                  <dd>₹{acknowledgement.fee.amountInr} · Demo UPI</dd>
                </div>
                <div>
                  <dt>{copy.fictionalTime}</dt>
                  <dd>
                    {new Date(acknowledgement.submittedAt).toLocaleDateString(
                      language === "hi" ? "hi-IN" : "en-IN",
                      { day: "numeric", month: "long", year: "numeric" },
                    )}
                  </dd>
                </div>
              </dl>
              <div className="ack-draft">
                <strong>{copy.submittedDraft}</strong>
                <p>{acknowledgement.submittedDraft}</p>
              </div>
              <div className="result-actions">
                <button className="action-button" onClick={downloadPackage}>
                  {copy.downloadPackage}
                </button>
                <button className="secondary-button" onClick={reset}>
                  {copy.startAnother}
                </button>
              </div>
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
        <Details copy={copy} onClose={() => setDetailsOpen(false)} />
      )}
    </main>
  );
}
