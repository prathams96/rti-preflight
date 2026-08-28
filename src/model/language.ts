import type { Language } from "../domain/types";

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
  [/claim/i, /दावा|claim/iu],
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

function normalizedNumbers(value: string): string[] {
  return [...value.matchAll(/\d+(?:[,.]\d+)?/g)].map((match) =>
    match[0].replaceAll(",", ""),
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
