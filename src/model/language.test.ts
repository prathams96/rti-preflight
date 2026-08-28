import { describe, expect, it } from "vitest";
import { matchesLanguage, matchesLanguageForFields } from "./language";

describe("provider language validation", () => {
  it("accepts aggregate Hindi prose with Roman proper nouns", () => {
    expect(
      matchesLanguageForFields(
        ["दावे की स्थिति", "EPFO", "RTI रिकॉर्ड की समीक्षा करें"],
        "hi",
      ),
    ).toBe(true);
  });

  it("rejects English-only Hindi output and predominantly Hindi English output", () => {
    expect(matchesLanguage("Please review the records.", "hi")).toBe(false);
    expect(matchesLanguage("कृपया रिकॉर्ड की समीक्षा करें।", "en")).toBe(false);
  });
});
