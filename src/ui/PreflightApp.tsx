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

type Phase = "start" | "select" | "confirm" | "search" | "result";
type SavedState = {
  phase: Phase;
  text: string;
  needs?: InformationNeed[];
  need?: InformationNeed;
  result?: RenderableResolution;
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
    footer: "Research is anonymous until you choose to save or file.",
    language: "हिन्दी",
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
    footer: "जब तक आप सहेजना या दाखिल करना न चुनें, शोध गुमनाम है।",
    language: "English",
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
      </section>
    </div>
  );
}

export default function PreflightApp() {
  const [language, setLanguage] = useState<Language>("en");
  const [phase, setPhase] = useState<Phase>("start");
  const [text, setText] = useState("");
  const [needs, setNeeds] = useState<InformationNeed[]>([]);
  const [need, setNeed] = useState<InformationNeed | undefined>();
  const [result, setResult] = useState<RenderableResolution | undefined>();
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const copy = COPY[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readPersistedState();
      if (!saved) return;
      setLanguage(saved.language);
      setPhase(saved.phase);
      setText(saved.text);
      setNeeds(saved.needs ?? (saved.need ? [saved.need] : []));
      setNeed(saved.need);
      setResult(saved.result);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "start")
      persist({ phase, text, needs, need, result, language });
  }, [phase, text, needs, need, result, language]);

  const updateNeed = (field: keyof InformationNeed, value: string) => {
    if (need) setNeed({ ...need, [field]: value } as InformationNeed);
  };
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
    setError("");
    try {
      window.localStorage.removeItem("rti-preflight-draft");
    } catch {
      /* no-op */
    }
  }
  const statusClass = useMemo(
    () => result?.outcome.toLocaleLowerCase().replaceAll("_", "-") ?? "",
    [result],
  );
  const resultLabel = result
    ? language === "hi"
      ? outcomeLabelHi[result.outcome]
      : outcomeLabel[result.outcome]
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
                {result.outcome === "DERIVED_FINDING"
                  ? "✓"
                  : result.outcome === "NO_RELIABLE_FINDING"
                    ? "!"
                    : "i"}
              </span>
              <span>{resultLabel}</span>
            </div>
            <h2>{result.headline}</h2>
            <p className="result-meaning">{result.meaning}</p>
            <p className="evidence-status">{result.evidenceStatus}</p>
            {result.evidence.length > 0 && (
              <div className="evidence-list" aria-label="Supporting evidence">
                <h3>{copy.evidence}</h3>
                {result.evidence.map((item) => (
                  <article className="evidence-card" key={item.id}>
                    <p className="evidence-type">
                      {item.sourceType === "official_dataset"
                        ? copy.sourceData
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
              <button
                className="action-button"
                onClick={() => setPhase("confirm")}
              >
                {result.outcome === "DERIVED_FINDING"
                  ? copy.prepareAnyway
                  : copy.prepare}
              </button>
              <button className="secondary-button" onClick={reset}>
                {copy.restart}
              </button>
            </div>
          </article>
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
