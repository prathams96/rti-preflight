import { describe, expect, it } from "vitest";
import {
  DISCLOSURE_LEDGER,
  EXPECTED_DISCLOSURE_COMPONENTS,
  validateDisclosureLedger,
} from "./ledger";

describe("disclosure ledger", () => {
  it("covers the independent expected component registry", () => {
    expect(DISCLOSURE_LEDGER.map((entry) => entry.id)).toEqual([
      ...EXPECTED_DISCLOSURE_COMPONENTS,
    ]);
    expect(() => validateDisclosureLedger()).not.toThrow();
  });
});
