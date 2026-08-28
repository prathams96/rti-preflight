import type { Outcome, RenderableResolution } from "../domain/types";

/**
 * A citation report is intentionally a separate review step. Until the
 * citizen confirms it, the displayed result remains in its original state.
 */
export type CitationReviewState =
  | { status: "idle" }
  | { status: "awaiting-confirmation"; evidenceId: string }
  | { status: "downgraded"; evidenceId: string };

export function resultOutcomeAfterCitationReview(
  outcome: Outcome | undefined,
  review: CitationReviewState,
): Outcome | undefined {
  return review.status === "downgraded" ? "PARTIALLY_RESOLVED" : outcome;
}

export function draftReturnPhase(hasResult: boolean): "confirm" | "result" {
  return hasResult ? "result" : "confirm";
}

/**
 * Keep exported evidence aligned with what the result stage communicates.
 * The original evidence remains attached so a citizen can inspect the
 * challenged source while the artifact records the pending review state.
 */
export function resultForCitationReview(
  result: RenderableResolution,
  review: CitationReviewState,
): RenderableResolution {
  if (review.status === "idle") return result;

  const reviewNote =
    review.status === "awaiting-confirmation"
      ? "A source problem report is awaiting review; the original result remains visible."
      : "This result is shown as partial until the source is checked again after a source problem report.";

  return {
    ...result,
    ...(review.status === "downgraded"
      ? { outcome: "PARTIALLY_RESOLVED" as const }
      : {}),
    evidenceStatus: `${result.evidenceStatus} ${reviewNote}`,
    gaps: result.gaps.includes(reviewNote)
      ? result.gaps
      : [...result.gaps, reviewNote],
  };
}

export const RESULT_STAGE_COPY = {
  en: {
    resultStage: "What we found",
    researchNotice: "What we found — no RTI has been filed.",
    draftStage: "RTI draft",
    draftTitle: "Your RTI draft",
    draftIntro: "Review and edit the request before continuing.",
    fileStage: "Filing demo",
    fileTitle: "Try the RTI filing demo",
    fileIntro:
      "This is a simulated filing journey. Nothing is sent to a government system.",
    acknowledgementTitle: "Filing demo complete",
    outsideHeadline: "We couldn’t find a reliable public answer",
    outsideMeaning:
      "The government sources checked by this prototype do not fully answer your question. An RTI may help you request the information directly from the relevant authority.",
    outsideEvidenceStatus: "Not confirmed by the sources checked",
    outsideGap:
      "The sources checked by this prototype did not provide a reliable answer for this question.",
    outsideScope:
      "This prototype checks a limited set of saved government sources. It is not searching government systems live.",
  },
  hi: {
    resultStage: "हमें क्या मिला",
    researchNotice: "हमें क्या मिला — कोई RTI दाखिल नहीं की गई है।",
    draftStage: "RTI ड्राफ्ट",
    draftTitle: "आपका RTI ड्राफ्ट",
    draftIntro: "आगे बढ़ने से पहले अनुरोध की समीक्षा करें और उसमें बदलाव करें।",
    fileStage: "फाइलिंग डेमो",
    fileTitle: "RTI फाइलिंग डेमो आज़माएँ",
    fileIntro:
      "यह फाइलिंग की अनुकरण यात्रा है। किसी सरकारी सिस्टम को कुछ नहीं भेजा जाता।",
    acknowledgementTitle: "फाइलिंग डेमो पूरा",
    outsideHeadline: "हमें विश्वसनीय सार्वजनिक उत्तर नहीं मिला",
    outsideMeaning:
      "इस प्रोटोटाइप में जाँचे गए सरकारी स्रोत आपके सवाल का पूरा जवाब नहीं देते। संबंधित प्राधिकरण से सीधे जानकारी माँगने के लिए RTI मदद कर सकती है।",
    outsideEvidenceStatus: "जाँचे गए स्रोतों से पुष्टि नहीं हुई",
    outsideGap:
      "इस प्रोटोटाइप में जाँचे गए स्रोतों से इस सवाल का विश्वसनीय जवाब नहीं मिला।",
    outsideScope:
      "यह प्रोटोटाइप सीमित संख्या में सहेजे गए सरकारी स्रोतों को जाँचता है। यह सरकारी सिस्टम को लाइव नहीं खोज रहा है।",
  },
} as const;
