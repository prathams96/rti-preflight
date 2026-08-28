import type { InformationNeed } from "../domain/types";
import { detectDraftDivergence, validateDraft } from "../filing/validation";
import type { ValidatedFilingPackage } from "../filing/types";

export function isFilingDemoReady(input: {
  need: InformationNeed | undefined;
  draftText: string;
  filingPackage: ValidatedFilingPackage | undefined;
}): boolean {
  if (!input.need || !input.filingPackage) return false;

  const validation = validateDraft(
    input.draftText,
    input.filingPackage.route.profile,
  );
  return (
    validation.valid &&
    !detectDraftDivergence(input.need, input.draftText).diverged
  );
}
