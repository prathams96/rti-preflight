import { describe, expect, it } from "vitest";
import type { Outcome } from "../domain/types";
import {
  RESULT_STAGE_COPY,
  draftReturnPhase,
  resultForCitationReview,
  resultOutcomeAfterCitationReview,
  type CitationReviewState,
} from "./result-stage";

describe("result-stage semantics", () => {
  it("returns direct drafts to confirmation when no result exists", () => {
    expect(draftReturnPhase(false)).toBe("confirm");
    expect(draftReturnPhase(true)).toBe("result");
  });

  it("does not downgrade a result while a citation report is awaiting confirmation", () => {
    const review: CitationReviewState = {
      status: "awaiting-confirmation",
      evidenceId: "ncrb-table-20a",
    };

    expect(resultOutcomeAfterCitationReview("DERIVED_FINDING", review)).toBe(
      "DERIVED_FINDING",
    );
  });

  it("downgrades only after the citation report is confirmed", () => {
    const review: CitationReviewState = {
      status: "downgraded",
      evidenceId: "ncrb-table-20a",
    };

    expect(resultOutcomeAfterCitationReview("DERIVED_FINDING", review)).toBe(
      "PARTIALLY_RESOLVED",
    );
    expect(
      resultOutcomeAfterCitationReview("SOURCE_RESOLVED" as Outcome, review),
    ).toBe("PARTIALLY_RESOLVED");
  });

  it("makes exported results agree with a confirmed citation downgrade", () => {
    const result = {
      outcome: "DERIVED_FINDING" as const,
      headline: "The original finding remains visible.",
      meaning: "The original meaning remains visible.",
      evidenceStatus: "Derived from official figures.",
      evidence: [],
      rows: [],
      gaps: [],
      searchScope: "Checked the registered snapshot.",
      recommendedAction: "Review the evidence.",
      traceId: "trace-result",
    };

    const exported = resultForCitationReview(result, {
      status: "downgraded",
      evidenceId: "ncrb-table-20a",
    });

    expect(exported.outcome).toBe("PARTIALLY_RESOLVED");
    expect(exported.headline).toBe(result.headline);
    expect(exported.gaps).toContainEqual(
      expect.stringContaining("source problem"),
    );
    expect(exported.evidenceStatus).toContain("source is checked again");
  });

  it("keeps the research, draft, and filing-demo boundaries explicit in both languages", () => {
    expect(RESULT_STAGE_COPY.en.resultStage).toBe("What we found");
    expect(RESULT_STAGE_COPY.hi.resultStage).toBe("हमें क्या मिला");
    expect(RESULT_STAGE_COPY.en.researchNotice).toMatch(
      /no RTI has been filed/i,
    );
    expect(RESULT_STAGE_COPY.en.draftIntro).toBe(
      "Review and edit the request before continuing.",
    );
    expect(RESULT_STAGE_COPY.en.fileIntro).toBe(
      "This is a simulated filing journey. Nothing is sent to a government system.",
    );
    expect(RESULT_STAGE_COPY.hi.researchNotice).toContain("RTI दाखिल");
    expect(RESULT_STAGE_COPY.hi.draftIntro).toBe(
      "आगे बढ़ने से पहले अनुरोध की समीक्षा करें और उसमें बदलाव करें।",
    );
    expect(RESULT_STAGE_COPY.hi.fileIntro).toBe(
      "यह फाइलिंग की अनुकरण यात्रा है। किसी सरकारी सिस्टम को कुछ नहीं भेजा जाता।",
    );
  });

  it("uses a single conservative outside-coverage conclusion", () => {
    expect(RESULT_STAGE_COPY.en.outsideHeadline).toBe(
      "We couldn’t find a reliable public answer",
    );
    expect(RESULT_STAGE_COPY.en.outsideMeaning).toMatch(
      /sources checked by this prototype/i,
    );
    expect(RESULT_STAGE_COPY.en.outsideEvidenceStatus).toBe(
      "Not confirmed by the sources checked",
    );
    expect(RESULT_STAGE_COPY.hi.outsideMeaning).toContain(
      "जाँचे गए सरकारी स्रोत",
    );
    expect(RESULT_STAGE_COPY.hi.outsideEvidenceStatus).toContain("पुष्टि");
  });
});
