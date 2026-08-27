import { describe, expect, it } from "vitest";
import { redactSensitiveIdentifiers } from "./redaction";

describe("identifier redaction boundary", () => {
  it("masks high-risk identifiers before provider or diagnostic use", () => {
    const result = redactSensitiveIdentifiers(
      "Aadhaar 2345 6789 0123, PAN ABCDE1234F, phone +91 9876543210, email citizen@example.com, OTP 123456",
    );
    expect(result.redacted).not.toContain("2345");
    expect(result.redacted).not.toContain("ABCDE1234F");
    expect(result.redacted).not.toContain("9876543210");
    expect(result.redacted).not.toContain("citizen@example.com");
    expect(result.redacted).toContain("[REDACTED]");
    expect(result.redactedCount).toBe(5);
  });
});
