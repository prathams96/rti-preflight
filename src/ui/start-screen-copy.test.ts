import { describe, expect, it } from "vitest";
import { ASK_SCREEN_COPY } from "./start-screen-copy";

describe("Ask screen copy", () => {
  it("uses the approved occasional-filer explanation and CTA", () => {
    expect(ASK_SCREEN_COPY.en.supporting).toBe(
      "RTI Tathya checks publicly available government data and previously answered RTIs before you file, helping you find existing answers, spot what’s missing, and draft a fresh request only when needed.",
    );
    expect(ASK_SCREEN_COPY.en.submit).toBe(
      "Check if you need to file an RTI →",
    );
  });

  it("keeps the research-step reassurance explicit in both languages", () => {
    expect(ASK_SCREEN_COPY.en.reassurance).toContain("Free research check");
    expect(ASK_SCREEN_COPY.en.reassurance).toContain("nothing is filed yet");
    expect(ASK_SCREEN_COPY.hi.supporting).toContain("RTI Tathya");
    expect(ASK_SCREEN_COPY.hi.submit).toContain("RTI");
  });
});
