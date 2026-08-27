import type { InformationNeed, RenderableResolution } from "../domain/types";

export type NarrationSentence = { text: string; groundingIds: string[] };
export type ProposedNarration = {
  headline: string;
  headlineGroundingIds: string[];
  meaning: string;
  meaningGroundingIds: string[];
  sentences: NarrationSentence[];
};
export type GroundingEntry = { id: string; text: string };
export type NarrationVerification = {
  accepted: boolean;
  rejectionCode?: string;
  narration?: ProposedNarration;
};

const prohibited = [
  /ignore (?:all )?(?:previous|above) instructions/i,
  /system prompt|tool call|function call|developer message/i,
  /will (?:provide|release|disclose|approve)|guarantee(?:d)?/i,
  /because .*police|police (?:performance|performed) worse|rank(?:ed|ing)/i,
  /official (?:answer|response)|endorsed by|government[- ]approved/i,
  /(?:submitted|sent|paid|authenticated|verified) (?:to|with) (?:the )?government/i,
  /(?:records|information) (?:do not exist|is unavailable|is not published)|RTI is unnecessary/i,
];
const KNOWN_PUBLIC_ENTITIES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
  "National Crime Records Bureau",
  "Employees' Provident Fund Organisation",
  "Central Pollution Control Board",
  "Northern Railway",
];

function exactShape(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}

export function parseNarration(value: unknown): ProposedNarration {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("NARRATION_SCHEMA_MISMATCH");
  const root = value as Record<string, unknown>;
  if (
    !exactShape(root, [
      "headline",
      "headlineGroundingIds",
      "meaning",
      "meaningGroundingIds",
      "sentences",
    ]) ||
    typeof root.headline !== "string" ||
    !Array.isArray(root.headlineGroundingIds) ||
    root.headlineGroundingIds.some((id) => typeof id !== "string") ||
    typeof root.meaning !== "string" ||
    !Array.isArray(root.meaningGroundingIds) ||
    root.meaningGroundingIds.some((id) => typeof id !== "string") ||
    !Array.isArray(root.sentences) ||
    !root.headline.trim()
  )
    throw new Error("NARRATION_SCHEMA_MISMATCH");
  const sentences = root.sentences.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("NARRATION_SCHEMA_MISMATCH");
    const sentence = item as Record<string, unknown>;
    if (
      !exactShape(sentence, ["text", "groundingIds"]) ||
      typeof sentence.text !== "string" ||
      !Array.isArray(sentence.groundingIds) ||
      sentence.groundingIds.some((id) => typeof id !== "string")
    )
      throw new Error("NARRATION_SCHEMA_MISMATCH");
    return {
      text: sentence.text,
      groundingIds: sentence.groundingIds as string[],
    };
  });
  return {
    headline: root.headline,
    headlineGroundingIds: root.headlineGroundingIds as string[],
    meaning: root.meaning,
    meaningGroundingIds: root.meaningGroundingIds as string[],
    sentences,
  };
}

function numbers(value: string): string[] {
  return [...value.matchAll(/[-−+]?\d+(?:[,.]\d+)?/g)].map((match) =>
    match[0].replaceAll(",", "").replace("−", "-"),
  );
}

function allowedText(
  need: InformationNeed,
  result: RenderableResolution,
): string {
  return [
    need.canonicalNeed,
    need.measure,
    need.geography,
    need.period,
    need.breakdown,
    need.informationHolder,
    result.headline,
    result.meaning,
    result.evidenceStatus,
    result.searchScope,
    result.recommendedAction,
    ...result.gaps,
    ...result.evidence.flatMap((item) => [
      item.sourceTitle,
      item.publisher,
      item.applicablePeriod,
      item.extract,
      item.url,
      ...item.grounding.map((reference) => reference.locatedContent),
    ]),
    ...result.rows.flatMap((row) => [
      row.geography,
      row.stolen2021,
      row.stolen2023,
      row.stolenDelta,
      row.recovery2021,
      row.recovery2023,
      row.recoveryDelta,
    ]),
    result.calculation?.operation ?? "",
    ...(result.calculation?.filters ?? []),
    result.calculation?.caveat ?? "",
  ].join(" ");
}

function hasUnknownNumber(text: string, allowed: Set<string>): boolean {
  return numbers(text).some((number) => !allowed.has(number));
}

function hasUnsupportedEntity(text: string, allowed: string): boolean {
  return KNOWN_PUBLIC_ENTITIES.some(
    (entity) =>
      text.toLocaleLowerCase().includes(entity.toLocaleLowerCase()) &&
      !allowed.toLocaleLowerCase().includes(entity.toLocaleLowerCase()),
  );
}

export function groundingCatalog(
  result: RenderableResolution,
): GroundingEntry[] {
  return result.evidence
    .flatMap((item) =>
      item.grounding.map((reference, index) => ({
        id: `${item.id}:${index}`,
        text: reference.locatedContent,
      })),
    )
    .concat(
      result.rows.flatMap((row) =>
        row.lineage.map((reference, index) => ({
          id: `row:${row.geography}:${index}`,
          text: reference.locatedContent,
        })),
      ),
    );
}

export function verifyNarration(
  value: unknown,
  need: InformationNeed,
  result: RenderableResolution,
): NarrationVerification {
  let narration: ProposedNarration;
  try {
    narration = parseNarration(value);
  } catch (error) {
    return {
      accepted: false,
      rejectionCode:
        error instanceof Error ? error.message : "NARRATION_SCHEMA_MISMATCH",
    };
  }
  const catalog = new Map(
    groundingCatalog(result).map((entry) => [entry.id, entry]),
  );
  const allowedNumbers = new Set(numbers(allowedText(need, result)));
  const allowedEntities = allowedText(need, result);
  const allText = [
    narration.headline,
    narration.meaning,
    ...narration.sentences.map((sentence) => sentence.text),
  ];
  if (allText.some((text) => prohibited.some((pattern) => pattern.test(text))))
    return { accepted: false, rejectionCode: "NARRATION_PROHIBITED_ASSERTION" };
  if (allText.some((text) => hasUnknownNumber(text, allowedNumbers)))
    return { accepted: false, rejectionCode: "NARRATION_NUMBER_UNGROUNDED" };
  if (allText.some((text) => hasUnsupportedEntity(text, allowedEntities)))
    return { accepted: false, rejectionCode: "NARRATION_ENTITY_UNGROUNDED" };
  if (
    ![
      ...narration.headlineGroundingIds,
      ...narration.meaningGroundingIds,
    ].every((id) => catalog.has(id)) ||
    narration.headlineGroundingIds.length === 0 ||
    narration.meaningGroundingIds.length === 0 ||
    !narration.sentences.every(
      (sentence) =>
        sentence.groundingIds.length > 0 &&
        sentence.groundingIds.every((id) => catalog.has(id)),
    )
  )
    return { accepted: false, rejectionCode: "NARRATION_GROUNDING_MISSING" };
  if (narration.headline.length < 3 || narration.meaning.length < 3)
    return { accepted: false, rejectionCode: "NARRATION_EMPTY" };
  return { accepted: true, narration };
}

export function deterministicNarration(
  result: RenderableResolution,
): ProposedNarration {
  const first = groundingCatalog(result)[0]?.id;
  const groundingIds = first ? [first] : [];
  return {
    headline: result.headline,
    headlineGroundingIds: groundingIds,
    meaning: result.meaning,
    meaningGroundingIds: groundingIds,
    sentences: [{ text: result.evidenceStatus, groundingIds }],
  };
}
