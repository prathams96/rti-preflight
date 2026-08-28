import { describe, expect, it } from "vitest";
import { informationNeedEditErrors } from "./need-validation";

describe("Information Need structured edits", () => {
  it("accepts standard and custom geography and period values", () => {
    expect(
      informationNeedEditErrors({
        measure: "maintenance expenditure",
        geography: "A custom municipality",
        period: "April 2024 to March 2025",
        breakdown: "Contractor",
        informationHolder: "Municipal corporation",
      }),
    ).toEqual([]);
  });

  it("reports empty structured edits instead of allowing an unsafe search", () => {
    expect(
      informationNeedEditErrors({
        measure: "maintenance expenditure",
        geography: "",
        period: "",
        breakdown: "Contractor",
        informationHolder: "Municipal corporation",
      }),
    ).toEqual([
      "geography must contain a value.",
      "period must contain a value.",
    ]);
  });
});
