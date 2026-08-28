import { describe, expect, it } from "vitest";
import {
  matchesLanguage,
  matchesLanguageForFields,
  preservesPresentationField,
} from "./language";

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

describe("field-aware presentation validation", () => {
  it("allows registered authority abbreviations and names to stay Roman in Hindi mode", () => {
    expect(
      preservesPresentationField({
        field: "informationHolder",
        canonical: "Employees' Provident Fund Organisation",
        presentation: "EPFO",
        language: "hi",
      }),
    ).toBe(true);
    expect(
      preservesPresentationField({
        field: "informationHolder",
        canonical: "National Crime Records Bureau",
        presentation: "National Crime Records Bureau",
        language: "hi",
      }),
    ).toBe(true);
    expect(
      preservesPresentationField({
        field: "informationHolder",
        canonical: "Northern Railway",
        presentation: "Northern Railway",
        language: "hi",
      }),
    ).toBe(true);
  });

  it("still rejects English natural-language fields in Hindi mode", () => {
    expect(
      preservesPresentationField({
        field: "canonicalNeed",
        canonical: "Identify the property stolen trend",
        presentation: "This is a complete English explanation",
        language: "hi",
      }),
    ).toBe(false);
    expect(
      preservesPresentationField({
        field: "informationHolder",
        canonical: "A municipal corporation",
        presentation: "A municipal corporation",
        language: "hi",
      }),
    ).toBe(false);
  });

  it("still requires the selected language and preserved meaning for Hindi natural-language fields", () => {
    expect(
      preservesPresentationField({
        field: "canonicalNeed",
        canonical: "My claim status",
        presentation: "मेरे दावे की स्थिति",
        language: "hi",
      }),
    ).toBe(true);
  });
});

describe("registered authority identity preservation", () => {
  it("allows aliases that resolve to the same registered authority", () => {
    expect(
      preservesPresentationField({
        field: "informationHolder",
        canonical: "Employees' Provident Fund Organisation",
        presentation: "EPFO",
        language: "hi",
      }),
    ).toBe(true);
    expect(
      preservesPresentationField({
        field: "informationHolder",
        canonical: "NCRB",
        presentation: "National Crime Records Bureau",
        language: "hi",
      }),
    ).toBe(true);
    expect(
      preservesPresentationField({
        field: "informationHolder",
        canonical: "Northern Railway",
        presentation: "Northern Railway",
        language: "hi",
      }),
    ).toBe(true);
  });

  it("rejects one registered authority masquerading as another", () => {
    expect(
      preservesPresentationField({
        field: "informationHolder",
        canonical: "National Crime Records Bureau",
        presentation: "EPFO",
        language: "hi",
      }),
    ).toBe(false);
  });

  it("still rejects Roman natural-language authority prose that is not registered", () => {
    expect(
      preservesPresentationField({
        field: "informationHolder",
        canonical: "A municipal corporation",
        presentation: "A municipal corporation",
        language: "hi",
      }),
    ).toBe(false);
  });
});
