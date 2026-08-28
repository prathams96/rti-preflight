import type { InformationNeed } from "../domain/types";

const STRUCTURED_FIELDS = [
  "measure",
  "geography",
  "period",
  "breakdown",
  "informationHolder",
] as const satisfies ReadonlyArray<keyof InformationNeed>;

export function informationNeedEditErrors(
  need: Pick<InformationNeed, (typeof STRUCTURED_FIELDS)[number]>,
): string[] {
  return STRUCTURED_FIELDS.flatMap((field) =>
    typeof need[field] !== "string" || need[field].trim().length === 0
      ? [`${field} must contain a value.`]
      : [],
  );
}
