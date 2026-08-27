export type RedactionResult = { redacted: string; redactedCount: number };

const patterns: ReadonlyArray<RegExp> = [
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, // Aadhaar-like
  /\b[A-Z]{5}\d{4}[A-Z]\b/gi, // PAN-like
  /\b[A-Z]{3}\d{7}\b/gi, // EPIC-like
  /(?<!\d)(?:\+91[ -]?)?[6-9]\d{9}(?!\d)/g, // mobile
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, // email
  /\b(?:account|a\/c|claim|policy|reference|application|transaction)[\s:#-]*[A-Z0-9/-]{5,}\b/gi,
  /\b(?:otp|pin|cvv|password)[\s:#-]*\d{4,8}\b/gi,
];

export function redactSensitiveIdentifiers(input: string): RedactionResult {
  let redacted = input;
  let redactedCount = 0;
  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, () => {
      redactedCount += 1;
      return "[REDACTED]";
    });
  }
  return { redacted, redactedCount };
}
