import type { InformationNeed, RenderableResolution } from "../domain/types";

export type NarrationSentence = { text: string; groundingIds: string[] };
export type ProposedNarration = {
  headline: string;
  headlineGroundingIds: string[];
  meaning: string;
  meaningGroundingIds: string[];
  sentences: NarrationSentence[];
  evidenceStatus: string;
  evidenceStatusGroundingIds: string[];
  searchScope: string;
  searchScopeGroundingIds: string[];
  recommendedAction: string;
  recommendedActionGroundingIds: string[];
  gaps: string[];
  gapsGroundingIds: string[];
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
  /(?:रिकॉर्ड|अभिलेख|सूचना).*(?:मौजूद नहीं|उपलब्ध नहीं|प्रकाशित नहीं)/u,
  /(?:आधिकारिक उत्तर|सरकार द्वारा अनुमोदित|गारंटी)/u,
  /सरकार.*(?:जमा|भेज|भुगतान)/u,
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
  const requiredKeys = [
    "headline",
    "headlineGroundingIds",
    "meaning",
    "meaningGroundingIds",
    "sentences",
    "evidenceStatus",
    "evidenceStatusGroundingIds",
    "searchScope",
    "searchScopeGroundingIds",
    "recommendedAction",
    "recommendedActionGroundingIds",
    "gaps",
    "gapsGroundingIds",
  ] as const;
  if (
    !exactShape(root, requiredKeys) ||
    typeof root.headline !== "string" ||
    !Array.isArray(root.headlineGroundingIds) ||
    root.headlineGroundingIds.some((id) => typeof id !== "string") ||
    typeof root.meaning !== "string" ||
    !Array.isArray(root.meaningGroundingIds) ||
    root.meaningGroundingIds.some((id) => typeof id !== "string") ||
    !Array.isArray(root.sentences) ||
    typeof root.evidenceStatus !== "string" ||
    typeof root.searchScope !== "string" ||
    typeof root.recommendedAction !== "string" ||
    !Array.isArray(root.gaps) ||
    root.gaps.some((gap) => typeof gap !== "string") ||
    !root.headline.trim()
  )
    throw new Error("NARRATION_SCHEMA_MISMATCH");
  for (const key of [
    "evidenceStatusGroundingIds",
    "searchScopeGroundingIds",
    "recommendedActionGroundingIds",
    "gapsGroundingIds",
  ])
    if (
      !Array.isArray(root[key]) ||
      root[key].some((id) => typeof id !== "string")
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
    evidenceStatus: root.evidenceStatus,
    evidenceStatusGroundingIds: root.evidenceStatusGroundingIds as string[],
    searchScope: root.searchScope,
    searchScopeGroundingIds: root.searchScopeGroundingIds as string[],
    recommendedAction: root.recommendedAction,
    recommendedActionGroundingIds:
      root.recommendedActionGroundingIds as string[],
    gaps: root.gaps as string[],
    gapsGroundingIds: root.gapsGroundingIds as string[],
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
      ...row.columns.flatMap((column) => [column.label, column.value]),
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

const ABSENCE_EN = [
  /\bno\b/i,
  /\bnot\b/i,
  /\bnone\b/i,
  /\babsence\b/i,
  /couldn['’]t find/i,
  /did not provide/i,
  /could not/i,
];

const ABSENCE_HI = [/नहीं/u, /अभाव/u, /कमी/u];

/**
 * Conservative check for absence, non-verification, or uncertainty. This is
 * deliberately narrow: it exists to stop a model narration from silently
 * inverting a deterministic "no finding" anchor into a positive claim.
 */
function communicatesAbsence(text: string): boolean {
  return (
    ABSENCE_EN.some((pattern) => pattern.test(text)) ||
    ABSENCE_HI.some((pattern) => pattern.test(text))
  );
}

function preservesAnchor(text: string, source: string): boolean {
  if (text === source) return true;
  if (communicatesAbsence(source) && !communicatesAbsence(text)) return false;
  const sourceNumbers = numbers(source);
  if (sourceNumbers.some((number) => !numbers(text).includes(number)))
    return false;
  if ((text.match(/[\u0900-\u097F]/gu) ?? []).length >= 3) {
    const concepts = [
      [/snapshot/i, /स्नैपशॉट|snapshot/iu],
      [/evidence|supporting/i, /साक्ष्य|प्रमाण|सहायक|evidence/iu],
      [/records?/i, /रिकॉर्ड|अभिलेख|records?/iu],
      [/findings?/i, /निष्कर्ष|findings?/iu],
      [/sources?/i, /स्रोत|sources?/iu],
      [/checked/i, /जाँच|checked/iu],
      [/registered/i, /पंजीकृत|registered/iu],
      [/scope|coverage/i, /दायरा|कवरेज|scope|coverage/iu],
      [/review/i, /समीक्षा|review/iu],
      [/prepare|draft|filing/i, /तैयार|ड्राफ्ट|फाइलिंग|prepare|draft|filing/iu],
      [/authorit(?:y|ies)/i, /प्राधिकरण|authorit/iu],
      [/available|unavailable/i, /उपलब्ध|available/iu],
      [/published|unpublished/i, /प्रकाशित|published/iu],
      [/formal|written response/i, /औपचारिक|लिखित.*(?:उत्तर|जवाब)|formal/iu],
      [/calculation|figures/i, /गणना|आँक|calculation|figures/iu],
      [/official/i, /आधिकारिक|official/iu],
      [/missing|gaps?/i, /कमी|गुम|अंतर|missing|gaps?/iu],
    ].filter(([sourcePattern]) => sourcePattern.test(source));
    if (concepts.length === 0) return true;
    const preserved = concepts.filter(([, targetPattern]) =>
      targetPattern.test(text),
    ).length;
    return preserved >= Math.ceil(concepts.length * 0.6);
  }
  const sourceTerms = source.toLocaleLowerCase().match(/[a-z]{4,}/g) ?? [];
  const textTerms = new Set(text.toLocaleLowerCase().match(/[a-z]{4,}/g) ?? []);
  return (
    sourceTerms.length === 0 || sourceTerms.some((term) => textTerms.has(term))
  );
}

export function groundingCatalog(
  result: RenderableResolution,
  need?: InformationNeed,
): GroundingEntry[] {
  const entries = result.evidence
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
  entries.push({ id: "result:headline", text: result.headline });
  entries.push({ id: "result:meaning", text: result.meaning });
  entries.push({ id: "result:evidenceStatus", text: result.evidenceStatus });
  entries.push({ id: "result:searchScope", text: result.searchScope });
  entries.push({
    id: "result:recommendedAction",
    text: result.recommendedAction,
  });
  result.gaps.forEach((gap, index) =>
    entries.push({ id: `result:gap:${index}`, text: gap }),
  );
  if (need) {
    entries.push({ id: "need:canonicalNeed", text: need.canonicalNeed });
    entries.push({ id: "need:measure", text: need.measure });
    entries.push({ id: "need:geography", text: need.geography });
    entries.push({ id: "need:period", text: need.period });
    entries.push({ id: "need:breakdown", text: need.breakdown });
    entries.push({
      id: "need:informationHolder",
      text: need.informationHolder,
    });
  }
  return entries;
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
    groundingCatalog(result, need).map((entry) => [entry.id, entry]),
  );
  const allowedNumbers = new Set(numbers(allowedText(need, result)));
  const allowedEntities = allowedText(need, result);
  const allText = [
    narration.headline,
    narration.meaning,
    ...narration.sentences.map((sentence) => sentence.text),
    ...(narration.evidenceStatus === result.evidenceStatus
      ? []
      : [narration.evidenceStatus]),
    ...(narration.searchScope === result.searchScope
      ? []
      : [narration.searchScope]),
    ...(narration.recommendedAction === result.recommendedAction
      ? []
      : [narration.recommendedAction]),
    ...narration.gaps.filter((gap, index) => gap !== result.gaps[index]),
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
  const owned = [
    [
      narration.evidenceStatus,
      narration.evidenceStatusGroundingIds,
      "result:evidenceStatus",
    ],
    [
      narration.searchScope,
      narration.searchScopeGroundingIds,
      "result:searchScope",
    ],
    [
      narration.recommendedAction,
      narration.recommendedActionGroundingIds,
      "result:recommendedAction",
    ],
  ] as const;
  if (
    owned.some(
      ([text, ids, requiredId]) =>
        !text.trim() ||
        !ids.includes(requiredId) ||
        ids.some((id) => !catalog.has(id)) ||
        !preservesAnchor(
          text,
          requiredId === "result:evidenceStatus"
            ? result.evidenceStatus
            : requiredId === "result:searchScope"
              ? result.searchScope
              : result.recommendedAction,
        ),
    )
  )
    return { accepted: false, rejectionCode: "NARRATION_GROUNDING_MISSING" };
  // Headline and meaning must own their deterministic anchors. This closes the
  // loophole where a model cites an unrelated grounding ID (e.g. a need or
  // evidence anchor) and thereby skips the polarity-preservation check.
  if (
    !narration.headlineGroundingIds.includes("result:headline") ||
    !preservesAnchor(narration.headline, result.headline)
  )
    return { accepted: false, rejectionCode: "NARRATION_GROUNDING_MISSING" };
  if (
    !narration.meaningGroundingIds.includes("result:meaning") ||
    !preservesAnchor(narration.meaning, result.meaning)
  )
    return { accepted: false, rejectionCode: "NARRATION_GROUNDING_MISSING" };
  if (
    narration.gaps.length !== result.gaps.length ||
    narration.gaps.length !== narration.gapsGroundingIds.length ||
    narration.gaps.some(
      (text, index) =>
        narration.gapsGroundingIds[index] !== `result:gap:${index}` ||
        !catalog.has(narration.gapsGroundingIds[index]) ||
        !preservesAnchor(text, result.gaps[index] ?? ""),
    )
  )
    return { accepted: false, rejectionCode: "NARRATION_GROUNDING_MISSING" };
  return { accepted: true, narration };
}

export function deterministicNarration(
  result: RenderableResolution,
): ProposedNarration {
  const groundingIds = ["result:headline"];
  return {
    headline: result.headline,
    headlineGroundingIds: groundingIds,
    meaning: result.meaning,
    meaningGroundingIds: groundingIds,
    sentences: [{ text: result.evidenceStatus, groundingIds }],
    evidenceStatus: result.evidenceStatus,
    evidenceStatusGroundingIds: ["result:evidenceStatus"],
    searchScope: result.searchScope,
    searchScopeGroundingIds: ["result:searchScope"],
    recommendedAction: result.recommendedAction,
    recommendedActionGroundingIds: ["result:recommendedAction"],
    gaps: result.gaps,
    gapsGroundingIds: result.gaps.map((_, index) => `result:gap:${index}`),
  };
}
