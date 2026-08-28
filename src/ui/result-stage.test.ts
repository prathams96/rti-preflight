import { describe, expect, it } from "vitest";
import type { Outcome } from "../domain/types";
import {
  RESULT_STAGE_COPY,
  resultForCitationReview,
  resultOutcomeAfterCitationReview,
  type CitationReviewState,
} from "./result-stage";

describe("result-stage semantics", () => {
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
      expect.stringContaining("citation problem"),
    );
    expect(exported.evidenceStatus).toContain("revalidation");
  });

  it("keeps the research, draft, and filing-demo boundaries explicit in both languages", () => {
    expect(RESULT_STAGE_COPY.en.resultStage).toBe("Research result");
    expect(RESULT_STAGE_COPY.hi.resultStage).toBe("शोध नतीजा");
    expect(RESULT_STAGE_COPY.en.researchNotice).toMatch(
      /no RTI has been filed/i,
    );
    expect(RESULT_STAGE_COPY.en.draftIntro).toMatch(
      /not an RTI filing and has not been sent/i,
    );
    expect(RESULT_STAGE_COPY.en.fileIntro).toMatch(
      /simulated filing.*does not file an RTI/i,
    );
    expect(RESULT_STAGE_COPY.hi.researchNotice).toContain("RTI दाखिल");
    expect(RESULT_STAGE_COPY.hi.draftIntro).toContain("RTI फाइलिंग नहीं");
    expect(RESULT_STAGE_COPY.hi.fileIntro).toContain("RTI दाखिल नहीं");
  });

  it("uses a single conservative outside-coverage conclusion", () => {
    expect(RESULT_STAGE_COPY.en.outsideHeadline).toContain(
      "sources available in this prototype",
    );
    expect(RESULT_STAGE_COPY.en.outsideMeaning).toMatch(
      /does not mean the information is unavailable or unpublished/i,
    );
    expect(RESULT_STAGE_COPY.en.outsideEvidenceStatus).toBe(
      "Not verified from available sources",
    );
    expect(RESULT_STAGE_COPY.hi.outsideMeaning).toContain(
      "उपलब्ध या अप्रकाशित",
    );
    expect(RESULT_STAGE_COPY.hi.outsideEvidenceStatus).toContain("पुष्टि");
  });
});
