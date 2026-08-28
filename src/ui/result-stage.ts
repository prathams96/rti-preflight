import type { Outcome } from "../domain/types";

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

export const RESULT_STAGE_COPY = {
  en: {
    resultStage: "Research result",
    researchNotice: "Research result — no RTI has been filed.",
    draftStage: "Draft an RTI",
    draftTitle: "Review your RTI Filing Draft",
    draftIntro:
      "This is an editable Filing Draft. It is not an RTI filing and has not been sent to a government system.",
    fileStage: "Filing demo",
    fileTitle: "Try the RTI filing demo",
    fileIntro:
      "This is a simulated filing journey. Nothing is sent to a government system, and this demo does not file an RTI.",
    acknowledgementTitle: "Filing demo complete",
    outsideHeadline:
      "We couldn’t verify this from the sources available in this prototype.",
    outsideMeaning:
      "This does not mean the information is unavailable or unpublished. We cannot claim an answer because the sources available in this prototype do not cover this request.",
    outsideEvidenceStatus: "Not verified from available sources",
    outsideGap:
      "No registered source in this prototype covers the requested authority or publication.",
    outsideScope:
      "The prototype checked its Capability Manifest and found no registered source for this need.",
  },
  hi: {
    resultStage: "शोध नतीजा",
    researchNotice: "शोध नतीजा — कोई RTI दाखिल नहीं की गई है।",
    draftStage: "RTI ड्राफ्ट तैयार करें",
    draftTitle: "अपने RTI आवेदन ड्राफ्ट की समीक्षा करें",
    draftIntro:
      "यह बदलाव योग्य आवेदन ड्राफ्ट है। यह RTI फाइलिंग नहीं है और किसी सरकारी सिस्टम को नहीं भेजा गया है।",
    fileStage: "फाइलिंग डेमो",
    fileTitle: "RTI फाइलिंग डेमो आज़माएँ",
    fileIntro:
      "यह आवेदन दाखिल करने की अनुकरण यात्रा है। किसी सरकारी सिस्टम को कुछ नहीं भेजा जाता और इस डेमो से RTI दाखिल नहीं होती।",
    acknowledgementTitle: "फाइलिंग डेमो पूरा",
    outsideHeadline:
      "इस प्रोटोटाइप में उपलब्ध स्रोतों से हम इसकी पुष्टि नहीं कर सके।",
    outsideMeaning:
      "इसका मतलब यह नहीं है कि जानकारी उपलब्ध या अप्रकाशित है। हम उत्तर का दावा नहीं कर सकते क्योंकि इस प्रोटोटाइप में उपलब्ध स्रोत इस अनुरोध को कवर नहीं करते।",
    outsideEvidenceStatus: "उपलब्ध स्रोतों से पुष्टि नहीं हुई",
    outsideGap:
      "इस प्रोटोटाइप में मांगे गए प्राधिकरण या प्रकाशन के लिए कोई पंजीकृत स्रोत नहीं है।",
    outsideScope:
      "प्रोटोटाइप के Capability Manifest में इस ज़रूरत के लिए कोई पंजीकृत स्रोत नहीं मिला।",
  },
} as const;
