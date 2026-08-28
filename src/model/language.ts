import type { Language } from "../domain/types";
import { resolveAuthorityName } from "./authority-registry";

export type PresentationField =
  | "canonicalNeed"
  | "measure"
  | "geography"
  | "period"
  | "breakdown"
  | "informationHolder";

/** Conservative guard against a provider silently ignoring the requested locale. */
export function matchesLanguage(value: string, language: Language): boolean {
  const devanagari = (value.match(/[\u0900-\u097F]/gu) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  if (language === "hi") return devanagari >= 3;
  return devanagari === 0 || devanagari <= Math.max(2, latin * 0.35);
}

export function matchesLanguageForFields(
  values: string[],
  language: Language,
): boolean {
  return matchesLanguage(values.join(" "), language);
}

const CONCEPTS: Array<[RegExp, RegExp]> = [
  [/records?|information/i, /रिकॉर्ड|अभिलेख|सूचना|records?|information/iu],
  [/claim/i, /दाव[ाे]|claim/iu],
  [/status/i, /स्थिति|status/iu],
  [/property/i, /संपत्ति|property/iu],
  [/stolen|theft/i, /चोरी|stolen|theft/iu],
  [/recover/i, /बरामद|recover/iu],
  [/state|UT/i, /राज्य|केंद्र शासित|state|UT/iu],
  [/maintenance/i, /रखरखाव|maintenance/iu],
  [/expenditure|spent/i, /व्यय|खर्च|expenditure|spent/iu],
  [/work orders?/i, /कार्यादेश|work orders?/iu],
  [/contracts?/i, /अनुबंध|contracts?/iu],
  [/contractors?/i, /ठेकेदार|contractors?/iu],
  [/lifts?/i, /लिफ्ट|lifts?/iu],
  [/escalators?/i, /एस्केलेटर|escalators?/iu],
  [/breakdown/i, /विभाजन|breakdown/iu],
  [/current/i, /वर्तमान|current/iu],
  [/financial year/i, /वित्तीय वर्ष|financial year/iu],
  [/New Delhi/i, /नई दिल्ली|New Delhi/iu],
];

const NUMBER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

function normalizedNumbers(value: string): string[] {
  const digits = [...value.matchAll(/\d+(?:[,.]\d+)?/g)].map((match) =>
    match[0].replaceAll(",", ""),
  );
  const words = [
    ...value
      .toLocaleLowerCase()
      .matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g),
  ].map((match) => NUMBER_WORDS[match[1]]);
  return [...digits, ...words];
}

function sameNumbers(a: string, b: string): boolean {
  const left = normalizedNumbers(a).sort();
  const right = normalizedNumbers(b).sort();
  return (
    left.length === right.length &&
    left.every((number, index) => number === right[index])
  );
}

/** Validates that selected-language presentation retains deterministic concepts. */
export function preservesMeaning(
  source: string,
  presentation: string,
  language: Language,
): boolean {
  if (!matchesLanguage(presentation, language)) return false;
  if (
    normalizedNumbers(source).some(
      (number) => !normalizedNumbers(presentation).includes(number),
    )
  )
    return false;
  if (language === "en") {
    const sourceTerms = source.toLocaleLowerCase().match(/[a-z]{4,}/g) ?? [];
    const targetTerms = new Set(
      presentation.toLocaleLowerCase().match(/[a-z]{4,}/g) ?? [],
    );
    return (
      sourceTerms.length === 0 ||
      sourceTerms.some((term) => targetTerms.has(term))
    );
  }
  const applicable = CONCEPTS.filter(([sourcePattern]) =>
    sourcePattern.test(source),
  );
  return (
    applicable.length === 0 ||
    applicable.every(([, targetPattern]) => targetPattern.test(presentation))
  );
}

/**
 * Field-aware presentation validation. Registered authority names and their
 * approved abbreviations may intentionally remain in Roman script even when
 * the surrounding natural-language fields are Hindi; every other field must
 * actually be written in the selected language and preserve the canonical
 * meaning. This keeps an English canonicalNeed from leaking into Hindi mode
 * without rejecting legal abbreviations such as "EPFO" or "NCRB".
 */
export function preservesPresentationField(input: {
  field: PresentationField;
  canonical: string;
  presentation: string;
  language: Language;
}): boolean {
  const { field, canonical, presentation, language } = input;
  if (field === "informationHolder") {
    // Registered authority names and approved abbreviations may remain in
    // Roman script in Hindi mode, but only when the presentation resolves to
    // the *same* registered authority as the canonical value. A registered
    // authority must never masquerade as a different one.
    const canonicalAuthority = resolveAuthorityName(canonical);
    const displayAuthority = resolveAuthorityName(presentation);
    if (canonicalAuthority) {
      if (!displayAuthority || displayAuthority.id !== canonicalAuthority.id)
        return false;
      return sameNumbers(canonical, presentation);
    }
  }
  if (!matchesLanguage(presentation, language)) return false;
  return sameNumbers(canonical, presentation);
}
