export function normaliseNeedPhrase(input: string): string {
  const trimmed = input.trim().replace(/[.\s]+$/, "");
  const leadingVerb =
    /^(Identify|Determine|Find|List|Establish|Compare|Calculate|Obtain|Provide)\s+/i;
  const withoutVerb = trimmed.replace(leadingVerb, "");
  const nounPhrase = withoutVerb.replace(/^individual\s+/i, "the ");
  if (nounPhrase === trimmed) return trimmed;
  return nounPhrase.charAt(0).toLowerCase() + nounPhrase.slice(1);
}
