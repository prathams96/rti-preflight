import { describe, expect, it } from "vitest";
import { normaliseNeedPhrase } from "./phrase";

describe("normaliseNeedPhrase", () => {
  it("strips trailing punctuation and whitespace", () => {
    expect(normaliseNeedPhrase("Records from 2024.  ")).toBe(
      "Records from 2024",
    );
  });

  it("removes a leading need verb and normalises an individual-set phrase", () => {
    expect(
      normaliseNeedPhrase(
        "Identify individual States/UTs with increased theft.",
      ),
    ).toBe("the States/UTs with increased theft");
  });

  it("leaves a phrase without a leading verb unchanged", () => {
    expect(normaliseNeedPhrase("records from the authority")).toBe(
      "records from the authority",
    );
  });
});
