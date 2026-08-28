export type EpfoSubjectScope = "own-record" | "another-person" | "unspecified";

export interface EpfoOfficialServiceRouteMetadata {
  readonly id: "epfo-claim-status";
  readonly version: "1.0.0";
  readonly canonicalHolder: "Employees' Provident Fund Organisation";
  readonly purpose: "Check the status of an EPF claim";
  readonly officialUrl: "https://passbook.epfindia.gov.in/MemberPassBook/login";
  readonly verificationDate: "2026-08-27";
  readonly primarySourceUrls: readonly [
    "https://passbook.epfindia.gov.in/MemberPassBook/login",
  ];
}

export const EPFO_CLAIM_STATUS_ROUTE = {
  id: "epfo-claim-status",
  version: "1.0.0",
  canonicalHolder: "Employees' Provident Fund Organisation",
  purpose: "Check the status of an EPF claim",
  officialUrl: "https://passbook.epfindia.gov.in/MemberPassBook/login",
  verificationDate: "2026-08-27",
  primarySourceUrls: ["https://passbook.epfindia.gov.in/MemberPassBook/login"],
} as const satisfies EpfoOfficialServiceRouteMetadata;

export function classifyEpfoRecordSubject(text: string): EpfoSubjectScope {
  if (
    /on behalf of|someone else|someone else's|another person|other person|my (?:father|mother|parent|spouse|partner|friend|colleague|wife|husband|child|son|daughter|sibling|brother|sister)|his claim|her claim|किसी और|दूसरे व्यक्ति|पिता|माता|पति|पत्नी|दोस्त|उसका|उसकी/i.test(
      text,
    )
  )
    return "another-person";
  if (
    /\bmy\s+(?:own\s+)?(?:epf|pf|provident fund|claim)\b|\bmine\b|\bmera\b|\bmeri\b|\bmere\b|\bapna\b|\bapni\b|मेरी|मेरा|मेरे|अपना|अपनी/i.test(
      text,
    )
  )
    return "own-record";
  return "unspecified";
}

export type EpfoServiceRouteDecision =
  | {
      readonly kind: "own-record-service-route";
      readonly route: EpfoOfficialServiceRouteMetadata;
    }
  | {
      readonly kind: "not-own-record-service-route";
      readonly subjectScope: "another-person" | "unspecified";
    };

export function resolveEpfoServiceRoute(
  subjectScope: EpfoSubjectScope,
): EpfoServiceRouteDecision {
  if (subjectScope === "own-record") {
    return {
      kind: "own-record-service-route",
      route: EPFO_CLAIM_STATUS_ROUTE,
    };
  }

  return {
    kind: "not-own-record-service-route",
    subjectScope,
  };
}
