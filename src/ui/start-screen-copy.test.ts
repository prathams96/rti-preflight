import { describe, expect, it } from "vitest";
import { ASK_SCREEN_COPY } from "./start-screen-copy";

describe("Ask screen copy", () => {
  it("uses the approved occasional-filer explanation and CTA", () => {
    expect(ASK_SCREEN_COPY.en.supporting).toBe(
      "Check whether the information you need is already available from a government source. If it isn’t, we’ll help you prepare an RTI.",
    );
    expect(ASK_SCREEN_COPY.en.submit).toBe("Check before filing an RTI →");
  });

  it("keeps the research-step reassurance explicit in both languages", () => {
    expect(ASK_SCREEN_COPY.en.reassurance).toContain("Free check");
    expect(ASK_SCREEN_COPY.en.reassurance).toContain("nothing will be filed");
    expect(ASK_SCREEN_COPY.hi.supporting).toContain("सरकारी स्रोत");
    expect(ASK_SCREEN_COPY.hi.submit).toContain("RTI");
  });
});
