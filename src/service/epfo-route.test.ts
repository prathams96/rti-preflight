import { describe, expect, it } from "vitest";
import {
  classifyEpfoRecordSubject,
  EPFO_CLAIM_STATUS_ROUTE,
  resolveEpfoServiceRoute,
} from "./epfo-route";

describe("EPFO official service route", () => {
  it.each([
    ["own-record", "own-record-service-route"],
    ["another-person", "not-own-record-service-route"],
    ["unspecified", "not-own-record-service-route"],
  ] as const)("classifies %s as %s", (subjectScope, expectedKind) => {
    expect(resolveEpfoServiceRoute(subjectScope).kind).toBe(expectedKind);
  });

  it("returns the route metadata only for an own record", () => {
    expect(resolveEpfoServiceRoute("own-record")).toEqual({
      kind: "own-record-service-route",
      route: EPFO_CLAIM_STATUS_ROUTE,
    });
    expect(resolveEpfoServiceRoute("another-person")).toEqual({
      kind: "not-own-record-service-route",
      subjectScope: "another-person",
    });
    expect(resolveEpfoServiceRoute("unspecified")).toEqual({
      kind: "not-own-record-service-route",
      subjectScope: "unspecified",
    });
  });

  it("exposes the versioned verified route metadata", () => {
    expect(EPFO_CLAIM_STATUS_ROUTE).toEqual({
      id: "epfo-claim-status",
      version: "1.0.0",
      canonicalHolder: "Employees' Provident Fund Organisation",
      purpose: "Check the status of an EPF claim",
      officialUrl: "https://passbook.epfindia.gov.in/MemberPassBook/login",
      verificationDate: "2026-08-27",
      primarySourceUrls: [
        "https://passbook.epfindia.gov.in/MemberPassBook/login",
      ],
    });
  });

  it.each([
    ["What is the status of my EPF claim?", "own-record"],
    ["Check my father's EPF claim", "another-person"],
    ["Check my EPF claim on behalf of my wife", "another-person"],
    ["Check my sister's EPF claim", "another-person"],
    ["What is the status of an EPF claim?", "unspecified"],
  ] as const)("classifies %s as %s", (text, expected) => {
    expect(classifyEpfoRecordSubject(text)).toBe(expected);
  });
});
