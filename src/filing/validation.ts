import type {
  DemoStep,
  DraftValidation,
  FictionalFilingProfile,
  PortalProfile,
  StepValidation,
  ValidatedFilingPackage,
} from "./types";

export function validateDraft(
  text: string,
  profile: PortalProfile,
): DraftValidation {
  const errors: string[] = [];
  const characterCount = [...text].length;
  const overflowBy =
    characterCount > profile.text.maxChars
      ? characterCount - profile.text.maxChars
      : undefined;
  if (overflowBy !== undefined)
    errors.push(
      `This route accepts ${profile.text.maxChars} characters. Remove ${overflowBy} characters to continue.`,
    );
  if (profile.text.newlinesPermitted === false && /\r?\n/.test(text))
    errors.push("Newlines are not permitted by this route profile.");
  return {
    valid: errors.length === 0,
    text,
    characterCount,
    ...(overflowBy === undefined ? {} : { overflowBy }),
    errors,
  };
}

export function validateFilingPackage(
  filingPackage: ValidatedFilingPackage,
): StepValidation {
  const errors: string[] = [];
  if (filingPackage.draft.needId !== filingPackage.confirmedNeed.id)
    errors.push(
      "The Filing Draft is not tied to the confirmed Information Need.",
    );
  if (filingPackage.draft.holderId !== filingPackage.holder.id)
    errors.push("The Filing Draft holder does not match the selected route.");
  if (filingPackage.draft.routeId !== filingPackage.route.id)
    errors.push("The Filing Draft route does not match the validated route.");
  return { valid: errors.length === 0, errors };
}

const STOP_WORDS = new Set(
  "a an and are at by for from how in of on or please provide the to was were which with during this that also disclose following concerning statement relevant ledger showing total amount spent copies applicable work orders contracts including contractor names values electronic held another public authority transfer application as year financial extract form these records contract inform applicant include invoice reference numbers where available".split(
    " ",
  ),
);

type Script = "latin" | "devanagari";

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((word) => word.length > 3 && !STOP_WORDS.has(word)) ?? [],
  );
}

function termsForScript(value: string, script: Script): Set<string> {
  const pattern =
    script === "latin" ? /[A-Za-z][A-Za-z0-9’'-]*/g : /[\u0900-\u097F]+/gu;
  return new Set(value.toLocaleLowerCase().match(pattern) ?? []);
}

function looksLikeReplacement(baseText: string, draftText: string): boolean {
  for (const script of ["latin", "devanagari"] as const) {
    const baseTerms = [...termsForScript(baseText, script)].filter(
      (term) =>
        term.length > 3 && (script === "devanagari" || !STOP_WORDS.has(term)),
    );
    const draftTerms = termsForScript(draftText, script);
    if (baseTerms.length < 3 || draftTerms.size < 3) continue;
    const sharedTerms = baseTerms.filter((term) => draftTerms.has(term));
    if (sharedTerms.length < 2) return true;
  }
  return false;
}

function addsLikelyHindiNeed(base: string, draft: string): boolean {
  const materialHindi = /पेंशन|बकाया|वेतन|सड़क|पानी|स्कूल|अस्पताल|भर्ती/u;
  return materialHindi.test(draft) && !materialHindi.test(base);
}

export function detectDraftDivergence(
  need: { canonicalNeed?: string; originalText?: string },
  draftText: string,
) {
  const baseText = `${need.canonicalNeed ?? ""} ${need.originalText ?? ""}`;
  const base = terms(baseText);
  const draft = terms(draftText);
  const addedTerms = [...draft].filter((term) => !base.has(term));
  const replacedNeed = looksLikeReplacement(
    `${need.canonicalNeed ?? ""} ${need.originalText ?? ""}`,
    draftText,
  );
  const likelyAddedNeed =
    /\b(also|additionally|unrelated|separate)\b/i.test(draftText) ||
    [
      "pension",
      "arrears",
      "salary",
      "leave",
      "grievance",
      "budget",
      "parking",
      "water",
      "school",
      "road",
      "hospital",
      "employment",
      "recruitment",
    ].some(
      (word) =>
        new RegExp(`\\b${word}\\b`, "i").test(draftText) &&
        !new RegExp(`\\b${word}\\b`, "i").test(baseText),
    ) ||
    addsLikelyHindiNeed(baseText, draftText) ||
    replacedNeed;
  return {
    diverged: likelyAddedNeed,
    addedTerms: likelyAddedNeed ? addedTerms : [],
  };
}

function isFictionalProfile(profile: FictionalFilingProfile): boolean {
  const fields = Object.keys(profile).sort();
  return (
    fields.join(",") === "address,email,fullName,pinCode,state" &&
    profile.fullName === "DEMO CITIZEN" &&
    profile.email.endsWith("@example.invalid") &&
    profile.address.includes("Fictional")
  );
}

export function validateDemoStep(
  step: DemoStep,
  input: Record<string, unknown>,
): StepValidation {
  const errors: string[] = [];
  if (step === "otp" && input.otp !== "123456")
    errors.push("Use demo OTP 123456. No SMS was sent.");
  if (
    step === "identity" &&
    (!input.profile ||
      !isFictionalProfile(input.profile as FictionalFilingProfile))
  )
    errors.push("Only the fictional demo profile is accepted.");
  if (
    step === "identity" &&
    input.profile &&
    Object.keys(input.profile as object).some((field) =>
      ["aadhaar", "pan", "epic", "upiId", "cardNumber", "cvv"].includes(field),
    )
  )
    errors.push("Identity fields such as Aadhaar and PAN are not accepted.");
  if (step === "review" && input.confirmed !== true)
    errors.push(
      "Review and explicitly confirm the Filing Package before payment.",
    );
  if (
    step === "payment" &&
    (input.method !== "demo_upi" || input.amountInr !== 10)
  )
    errors.push("Only the simulated ₹10 Demo UPI payment is accepted.");
  if (step === "confirmation" && input.confirmed !== true)
    errors.push("Explicit confirmation is required.");
  return { valid: errors.length === 0, errors };
}
