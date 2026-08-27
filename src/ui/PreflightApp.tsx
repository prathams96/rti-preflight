"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  InformationNeed,
  Language,
  NeedInterpretation,
  RenderableResolution,
  ResolutionPreference,
} from "../domain/types";
import { SCENARIO_PROMPTS } from "../content/scenarios";
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

const COPY = {
  en: {
    independent:
      "Independent hackathon prototype—not affiliated with or endorsed by any government authority.",
    headline: "Find out before you file an RTI",
    supporting:
      "Ask for public information in your own words. We’ll check published government sources first and help prepare an RTI when needed.",
    label: "What public information are you looking for?",
    privacy:
      "Do not enter passwords, OTPs, Aadhaar, PAN, EPIC, or account numbers.",
    submit: "Interpret my need",
    details: "Prototype details",
    examples: "See example questions",
    confirm: "Confirm your Information Need",
    search: "Yes, search",
    edit: "Edit",
    restart: "Start over",
    result: "Result",
    searching: "Checking the prototype Evidence Snapshot",
    searchingDetail: "No government system is being accessed.",
    back: "Back to confirmed need",
    askStage: "Evidence Light Table · Ask",
    multipleStage: "Ask · Multiple needs",
    confirmStage: "Confirm · Information Need Card",
    searchStage: "Search · Evidence Snapshot",
    resultStage: "Result · Search complete",
    selectTitle: "Choose one Information Need to continue",
    selectIntro:
      "We kept your original wording and separated the needs so each one can be checked clearly.",
    oneNeed:
      "Only one need is active at a time. You can start another Preflight later.",
    measure: "Information or measure requested",
    geography: "Geography",
    period: "Period",
    breakdown: "Requested breakdown",
    holder: "Likely Information Holder",
    preference: "What would work for you?",
    clarification: "Material clarification",
    unsure: "I’m not sure",
    calculation: "Calculation",
    matching: "matching rows",
    unresolved: "What remains unresolved",
    scope: "Search based on the prototype Evidence Snapshot · View scope",
    evidence: "Supporting evidence",
    sourceData: "Real official public data",
    publisher: "Publisher",
    applicablePeriod: "Applicable period",
    locatedValues: "Located values",
    openSource: "Open official source ↗",
    prepare: "Prepare an RTI",
    prepareAnyway: "Prepare an RTI anyway",
    citizenOverride: "Still need an official response? Prepare an RTI",
    openRoute: "Open official service route",
    footer: "Research is anonymous until you choose to save or file.",
    language: "हिन्दी",
    draftStage: "Draft · Filing Draft",
    draftTitle: "Prepare an editable Filing Draft",
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
      "Guided filing for this authority is not available in this prototype. You can keep the draft and use the verified route information yourself.",
    divergenceTitle: "This edit may add another Information Need",
    divergenceBody:
      "Choose how to keep control of the draft. Nothing will be truncated or silently rewritten.",
    keepWritten: "Keep as written",
    separateNeed: "Separate into another Saved Preflight",
    undoChanges: "Undo changes",
    fileStage: "File · Simulated journey",
    fileTitle: "Complete the Filing Package",
    stepOtp: "1. Demo OTP",
    stepIdentity: "2. Fictional details",
    stepReview: "3. Review",
    stepPayment: "4. Demo Payment",
    otpPrompt: "Hackathon prototype: use OTP 123456. No SMS was sent.",
    verifyOtp: "Verify demo OTP",
    identityPrompt: "These details are fictional and stay in session state.",
    continue: "Continue",
    reviewPrompt: "Review the complete Filing Package before payment.",
    confirmPackage: "I confirm this complete Filing Package",
    paymentPrompt: "Demo Payment: ₹10 · Demo UPI",
    noRealPayment: "No real payment will be made.",
    confirmDemo: "Confirm demo submission",
    acknowledgementStage: "Acknowledgement · Demo Submission",
    acknowledgementTitle: "Demo submission successful",
    fictionalRegistration: "Fictional registration",
    noGovernment:
      "No request, payment, or personal information was sent to a government system.",
    downloadPackage: "Download Filing Package",
    startAnother: "Start another Preflight",
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
      "Citizen edits are preserved exactly. This draft asks for records, not reasons, and does not include identity credentials.",
    divergenceSaved:
      "The draft remains saved for editing, but filing stays blocked until the additional need is removed or separated.",
    editDraft: "Edit Filing Draft",
    demoOtp: "Demo OTP",
    name: "Name",
    email: "Email",
    address: "Address",
    state: "State",
    pin: "PIN",
    noCredentials:
      "Aadhaar, PAN, real government login details, and account identifiers are not requested or accepted.",
    routeLine: "Route",
    fictionalApplicant: "Fictional applicant",
    mockFee: "Mock fee",
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
  },
  hi: {
    independent:
      "स्वतंत्र हैकाथॉन प्रोटोटाइप—किसी सरकारी प्राधिकरण से संबद्ध या समर्थित नहीं।",
    headline: "RTI दाखिल करने से पहले पता करें",
    supporting:
      "सार्वजनिक जानकारी अपने शब्दों में पूछें। हम पहले प्रकाशित सरकारी स्रोत देखेंगे और ज़रूरत होने पर RTI तैयार करने में मदद करेंगे।",
    label: "आप कौन-सी सार्वजनिक जानकारी ढूँढ रहे हैं?",
    privacy: "पासवर्ड, OTP, आधार, PAN, EPIC या खाता नंबर दर्ज न करें।",
    submit: "मेरी ज़रूरत समझें",
    details: "प्रोटोटाइप विवरण",
    examples: "उदाहरण प्रश्न देखें",
    confirm: "अपनी सूचना-ज़रूरत की पुष्टि करें",
    search: "हाँ, खोजें",
    edit: "बदलें",
    restart: "फिर से शुरू करें",
    result: "नतीजा",
    searching: "प्रोटोटाइप Evidence Snapshot देख रहे हैं",
    searchingDetail: "किसी सरकारी सिस्टम को नहीं देखा जा रहा है।",
    back: "पुष्टि की गई ज़रूरत पर लौटें",
    askStage: "Evidence Light Table · पूछें",
    multipleStage: "पूछें · कई ज़रूरतें",
    confirmStage: "पुष्टि · सूचना-ज़रूरत कार्ड",
    searchStage: "खोज · Evidence Snapshot",
    resultStage: "नतीजा · खोज पूरी",
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
    preference: "आपके लिए क्या उपयोगी होगा?",
    clarification: "महत्वपूर्ण स्पष्टीकरण",
    unsure: "मैं निश्चित नहीं हूँ",
    calculation: "गणना",
    matching: "मिलती पंक्तियाँ",
    unresolved: "क्या अभी अनसुलझा है",
    scope: "प्रोटोटाइप Evidence Snapshot पर आधारित खोज · दायरा देखें",
    evidence: "सहायक प्रमाण",
    sourceData: "वास्तविक आधिकारिक सार्वजनिक डेटा",
    publisher: "प्रकाशक",
    applicablePeriod: "लागू अवधि",
    locatedValues: "स्थित मान",
    openSource: "आधिकारिक स्रोत खोलें ↗",
    prepare: "RTI तैयार करें",
    prepareAnyway: "फिर भी RTI तैयार करें",
    citizenOverride: "फिर भी आधिकारिक उत्तर चाहिए? RTI तैयार करें",
    openRoute: "आधिकारिक सेवा मार्ग खोलें",
    footer: "जब तक आप सहेजना या दाखिल करना न चुनें, शोध गुमनाम है।",
    language: "English",
    draftStage: "ड्राफ्ट · Filing Draft",
    draftTitle: "एक संपादन योग्य Filing Draft तैयार करें",
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
      "इस प्राधिकरण के लिए guided filing इस प्रोटोटाइप में उपलब्ध नहीं है। आप ड्राफ्ट रखकर सत्यापित route जानकारी स्वयं उपयोग कर सकते हैं।",
    divergenceTitle: "यह बदलाव दूसरी Information Need जोड़ सकता है",
    divergenceBody:
      "ड्राफ्ट पर नियंत्रण रखने का तरीका चुनें। कुछ भी छोटा या चुपचाप बदला नहीं जाएगा।",
    keepWritten: "जैसा लिखा है वैसा रखें",
    separateNeed: "दूसरे Saved Preflight में अलग करें",
    undoChanges: "बदलाव वापस लें",
    fileStage: "फाइल · सिम्युलेटेड यात्रा",
    fileTitle: "Filing Package पूरा करें",
    stepOtp: "1. Demo OTP",
    stepIdentity: "2. काल्पनिक विवरण",
    stepReview: "3. समीक्षा",
    stepPayment: "4. Demo Payment",
    otpPrompt: "हैकाथॉन प्रोटोटाइप: OTP 123456 डालें। कोई SMS नहीं भेजा गया।",
    verifyOtp: "Demo OTP सत्यापित करें",
    identityPrompt: "ये विवरण काल्पनिक हैं और session state में रहते हैं।",
    continue: "जारी रखें",
    reviewPrompt: "Payment से पहले पूरे Filing Package की समीक्षा करें।",
    confirmPackage: "मैं इस पूरे Filing Package की पुष्टि करता/करती हूँ",
    paymentPrompt: "Demo Payment: ₹10 · Demo UPI",
    noRealPayment: "कोई वास्तविक payment नहीं होगा।",
    confirmDemo: "Demo submission की पुष्टि करें",
    acknowledgementStage: "स्वीकृति · Demo Submission",
    acknowledgementTitle: "Demo submission सफल",
    fictionalRegistration: "काल्पनिक पंजीकरण",
    noGovernment:
      "किसी सरकारी सिस्टम को अनुरोध, payment या व्यक्तिगत जानकारी नहीं भेजी गई।",
    downloadPackage: "Filing Package डाउनलोड करें",
    startAnother: "एक और Preflight शुरू करें",
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
      "नागरिक के बदलाव ठीक वैसे ही रखे जाते हैं। यह ड्राफ्ट कारण नहीं, records माँगता है और identity credentials शामिल नहीं करता।",
    divergenceSaved:
      "ड्राफ्ट editing के लिए सहेजा गया है, लेकिन अतिरिक्त ज़रूरत हटाने या अलग करने तक filing रोकी गई है।",
    editDraft: "Filing Draft बदलें",
    demoOtp: "Demo OTP",
    name: "नाम",
    email: "ईमेल",
    address: "पता",
    state: "राज्य",
    pin: "PIN",
    noCredentials:
      "आधार, PAN, वास्तविक सरकारी login विवरण और account identifiers माँगे या स्वीकार नहीं किए जाते।",
    routeLine: "Route",
    fictionalApplicant: "काल्पनिक applicant",
    mockFee: "Mock fee",
    componentSummary:
      "Working: route validation। Simulated: OTP, identity, payment, filing और acknowledgement।",
    paymentCredentials:
      "कोई UPI ID, card, CVV, bank या payment credential नहीं लिया जाता।",
    paymentCheck: "मैं समझता/समझती हूँ कि यह simulated payment step है।",
    fictionalTime: "काल्पनिक submission time",
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
  },
} as const;

const outcomeLabel: Record<string, string> = {
  DERIVED_FINDING: "Derived Finding",
  SOURCE_RESOLVED: "Source-Resolved",
  NO_RELIABLE_FINDING: "No Reliable Finding",
  OUTSIDE_SNAPSHOT_COVERAGE: "Outside Snapshot Coverage",
  OFFICIAL_SERVICE_ROUTE: "Official Service Route",
  PARTIALLY_RESOLVED: "Partially Resolved",
  EVIDENCE_CONFLICT: "Evidence Conflict",
  FORMAL_RESPONSE_REQUIRED: "Formal Response Required",
};
const outcomeLabelHi: Record<string, string> = {
  DERIVED_FINDING: "व्युत्पन्न निष्कर्ष",
  SOURCE_RESOLVED: "स्रोत से हल",
  NO_RELIABLE_FINDING: "विश्वसनीय निष्कर्ष नहीं",
  OUTSIDE_SNAPSHOT_COVERAGE: "Snapshot के दायरे से बाहर",
  OFFICIAL_SERVICE_ROUTE: "आधिकारिक सेवा मार्ग",
  PARTIALLY_RESOLVED: "आंशिक रूप से हल",
  EVIDENCE_CONFLICT: "प्रमाण में विरोध",
  FORMAL_RESPONSE_REQUIRED: "औपचारिक उत्तर ज़रूरी",
};

function persist(state: SavedState) {
  try {
    window.localStorage.setItem("rti-preflight-draft", JSON.stringify(state));
  } catch {
    /* optional enhancement */
  }
}

function readPersistedState(): SavedState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem("rti-preflight-draft") ?? "null",
    ) as SavedState | null;
    return parsed ?? undefined;
  } catch {
    return undefined;
  }
}

function readSessionFilingState(): SessionFilingState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem("rti-preflight-filing") ?? "null",
    ) as SessionFilingState | null;
    return parsed ?? undefined;
  } catch {
    return undefined;
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

function Details({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog supporting-plane"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Disclosure</p>
            <h2 id="details-title">Prototype details</h2>
          </div>
          <button
            className="icon-button"
            ref={closeRef}
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
                    <a href={url} target="_blank" rel="noreferrer" key={url}>
                      Official source ↗
                    </a>
                  ))}
                </li>
              ),
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}

export default function PreflightApp() {
  const filingModule = useMemo(() => createFilingModule(), []);
  const [language, setLanguage] = useState<Language>("en");
  const [phase, setPhase] = useState<Phase>("start");
  const [text, setText] = useState("");
  const [needs, setNeeds] = useState<InformationNeed[]>([]);
  const [need, setNeed] = useState<InformationNeed | undefined>();
  const [result, setResult] = useState<RenderableResolution | undefined>();
  const [error, setError] = useState("");
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
  const [savedPreflights, setSavedPreflights] = useState<SavedPreflight[]>([]);
  const [savedPreflightsLoaded, setSavedPreflightsLoaded] = useState(false);
  const copy = COPY[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSavedPreflights(readSavedPreflights());
      setSavedPreflightsLoaded(true);
      const saved = readPersistedState();
      if (!saved) return;
      setLanguage(saved.language);
      setPhase(saved.phase);
      setText(saved.text);
      setNeeds(saved.needs ?? (saved.need ? [saved.need] : []));
      setNeed(saved.need);
      setResult(saved.result);
      setChallengedEvidenceId(saved.challengedEvidenceId ?? "");
      setChallengedNeedSignature(saved.challengedNeedSignature ?? "");
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
        "rti-preflight-filing",
        JSON.stringify({
          phase,
          draftText,
          package: filingPackage,
          step: filingStep,
          otp,
          profile,
          reviewed,
          paymentConfirmed,
          acknowledgement,
        } satisfies SessionFilingState),
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
    if (need) setNeed({ ...need, [field]: value } as InformationNeed);
  };

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
      `Please provide records concerning ${need.canonicalNeed}.\n\nPlease provide the records in electronic form.`,
    );
    setDraftText(
      `Please provide records concerning ${need.canonicalNeed}.\n\nPlease provide the records in electronic form.`,
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
  }

  function finishDemoSubmission() {
    if (!filingPackage || !reviewed || !paymentConfirmed) return;
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
        setAcknowledgement(completed);
        setFilingStep("confirmation");
        setPhase("acknowledgement");
      })
      .catch(() => {
        setFilingError(
          "The Filing Package must be valid and explicitly confirmed before Demo Submission.",
        );
      });
  }

  function downloadPackage() {
    if (!filingPackage || !acknowledgement || !need) return;
    const artifact = {
      disclosure:
        "Independent research assistant—not an official RTI response.",
      informationNeed: {
        canonicalNeed: need.canonicalNeed,
        measure: need.measure,
        geography: need.geography,
        period: need.period,
        informationHolder: need.informationHolder,
        resolutionPreference: need.resolutionPreference,
      },
      filingPackage: {
        draft: filingPackage.draft,
        holder: filingPackage.holder,
        route: filingPackage.route,
        fictionalProfile: profile,
        fee: { amountInr: 10, method: "demo_upi" },
      },
      acknowledgement,
      components: {
        filing: "simulated",
        payment: "simulated",
        governmentIntegration: "absent",
      },
    };
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(artifact, null, 2),
    )}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = "rti-preflight-filing-package.json";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function interpret() {
    if (!text.trim()) return;
    setError("");
    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      setNeeds(payload.needs);
      setNeed(payload.needs[0]);
      setPhase(payload.needs.length > 1 ? "select" : "confirm");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t interpret your request just now. Nothing was submitted.",
      );
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
    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      setResult(payload);
      setChallengedEvidenceId("");
      setChallengedNeedSignature("");
      setPhase("result");
    } catch (caught) {
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
    setSavedPreflights([]);
    setError("");
    try {
      window.localStorage.removeItem("rti-preflight-draft");
      window.localStorage.removeItem("rti-preflight-saved");
      window.sessionStorage.removeItem("rti-preflight-filing");
    } catch {
      /* no-op */
    }
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
        <div className="wordmark">
          <span className="wordmark-mark" aria-hidden="true">
            ⌁
          </span>
          <span>RTI Preflight</span>
        </div>
        <div className="topbar-actions">
          <button
            className="text-button"
            onClick={() => setLanguage(language === "en" ? "hi" : "en")}
            aria-label={`Switch language to ${copy.language}`}
          >
            {copy.language}
          </button>
          <button className="text-button" onClick={() => setDetailsOpen(true)}>
            {copy.details}
          </button>
        </div>
      </header>
      <p className="independence-label">{copy.independent}</p>

      {phase === "start" && (
        <section className="start-layout" aria-labelledby="start-title">
          <div className="intro">
            <p className="eyebrow">{copy.askStage}</p>
            <h1 id="start-title">{copy.headline}</h1>
            <p className="lede">{copy.supporting}</p>
          </div>
          <section
            className="active-plane ask-plane"
            aria-label="Ask for public information"
          >
            <label htmlFor="need-input">{copy.label}</label>
            <textarea
              id="need-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              placeholder="For example: Which States reported…"
            />
            <p className="privacy-note">
              <span aria-hidden="true">ⓘ</span> {copy.privacy}
            </p>
            {error && (
              <p className="error-message" role="alert">
                <span aria-hidden="true">!</span>
                {error}
              </p>
            )}
            <button
              className="action-button"
              disabled={!text.trim()}
              onClick={interpret}
            >
              {copy.submit}
            </button>
          </section>
          <details className="examples supporting-plane">
            <summary>{copy.examples}</summary>
            <div className="scenario-list">
              {SCENARIO_PROMPTS.map((scenario) => (
                <button
                  key={scenario.id}
                  className="scenario"
                  onClick={() => setText(scenario.prompt)}
                >
                  <span>{scenario.label}</span>
                  <span aria-hidden="true">↗</span>
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
                <option value="published">
                  Reliable information from a published government source
                </option>
                <option value="formal">
                  A new written response from a public authority
                </option>
                <option value="unsure">Not sure—help me decide</option>
              </select>
            </label>
            {need.unresolvedClarifications.length > 0 && (
              <div className="clarification status-partial">
                <strong>{copy.clarification}</strong>
                <p>{need.unresolvedClarifications[0]}</p>
                <button
                  className="quiet-button"
                  onClick={() =>
                    setNeed({ ...need, unresolvedClarifications: [] })
                  }
                >
                  {copy.unsure}
                </button>
              </div>
            )}
            {error && (
              <p className="error-message" role="alert">
                <span aria-hidden="true">!</span>
                {error}
              </p>
            )}
            <div className="button-row">
              <button className="action-button" onClick={resolve}>
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
                    : "i"}
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
              <div className="evidence-list" aria-label="Supporting evidence">
                <h3>{copy.evidence}</h3>
                {result.evidence.map((item) => (
                  <article className="evidence-card" key={item.id}>
                    <p className="evidence-type">
                      {item.sourceType === "official_dataset"
                        ? copy.sourceData
                        : item.sourceType === "official_service_route"
                          ? "Official service route"
                          : "Synthetic fixture"}
                    </p>
                    <h3>{item.sourceTitle}</h3>
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
                          {item.grounding.length} cell references with immutable
                          hashes
                        </dd>
                      </div>
                    </dl>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {copy.openSource}
                    </a>
                    {!challengedEvidenceId && (
                      <button
                        className="quiet-button challenge-button"
                        onClick={() => challengeEvidence(item.id)}
                      >
                        {copy.challenge}
                      </button>
                    )}
                    {item.alternateUrl && (
                      <a
                        className="source-link-secondary"
                        href={item.alternateUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open pinned CSV ↗
                      </a>
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
                    <caption className="sr-only">
                      States and Union Territories matching the NCRB conditions
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">State/UT</th>
                        <th scope="col">Stolen 2021 → 2023</th>
                        <th scope="col">Change</th>
                        <th scope="col">Recovery 2021 → 2023</th>
                        <th scope="col">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row) => (
                        <tr
                          key={row.geography}
                          data-testid={`result-row-${row.geography}`}
                        >
                          <th scope="row">{row.geography}</th>
                          <td data-label="Stolen">
                            ₹{row.stolen2021} → ₹{row.stolen2023} crore
                          </td>
                          <td data-label="Change" className="numeric">
                            {row.stolenDelta}
                          </td>
                          <td data-label="Recovery">
                            {row.recovery2021}% → {row.recovery2023}%
                          </td>
                          <td data-label="Change" className="numeric">
                            {row.recoveryDelta}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div
                  className="row-inspection-list"
                  aria-label="Inspect row evidence"
                >
                  {result.rows.map((row) => (
                    <details
                      key={`inspect-${row.geography}`}
                      className="row-inspection"
                    >
                      <summary>
                        Inspect {row.geography} operands and source cells
                      </summary>
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
                  <summary>View the registered calculation plan</summary>
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
            <div className="result-actions">
              {result.outcome === "OFFICIAL_SERVICE_ROUTE" ? (
                <a
                  className="action-button action-link"
                  href={result.evidence[0]?.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.openRoute} ↗
                </a>
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
                    <a
                      href={filingPackage.route.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {
                        filingPackage.route.authority.portalNames[
                          filingPackage.route.id
                        ]
                      }
                    </a>
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
                          i
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
                <span aria-hidden="true">i</span> {copy.guidedUnavailable}
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
                <p className="supporting-copy">{copy.noCredentials}</p>
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
              <p className="error-message" role="status">
                <span aria-hidden="true">i</span>
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
                  <dd>{acknowledgement.submittedAt}</dd>
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
      {detailsOpen && <Details onClose={() => setDetailsOpen(false)} />}
    </main>
  );
}
