import type {
  ConfirmedFilingNeed,
  FilingRouteRef,
  InformationHolderRef,
} from "./types";

export const NORTHERN_RAILWAY_HOLDER: InformationHolderRef = {
  id: "northern-railway",
  canonicalName: "Northern Railway",
};

const authority = {
  id: "northern-railway",
  canonicalName: "Northern Railway",
  portalNames: {
    "northern-railway-rti": "Northern Railway-Delhi Division",
  },
  jurisdiction: "central" as const,
  aliases: ["Northern Railway"],
  lastVerified: "2026-08-27",
  verifiedBy: "RTI Tathya route directory",
};

export const NORTHERN_RAILWAY_PROFILE = {
  id: "central-rti-online-text-v1",
  version: "1.0.0",
  verifiedAt: "2026-08-27",
  text: {
    maxChars: 3000,
    overflowStrategy: "reject" as const,
    newlinesPermitted: false,
  },
  attachments: {
    maxCount: 1,
    maxBytes: 1_000_000,
    mimeTypes: ["application/pdf"],
    prohibited: ["filenames containing spaces"],
  },
  fee: {
    amountInr: 10,
    exemptions: [{ code: "BPL", proofRequired: "Government BPL certificate" }],
    methods: ["demo_upi"] as "demo_upi"[],
  },
  identity: {
    fieldsRequired: ["fullName", "email", "address", "state", "pinCode"],
    fieldsProhibited: ["aadhaar", "pan", "epic", "upiId", "cardNumber", "cvv"],
  },
  routing: { intermediary: "Nodal Officer" },
  jurisdictionRule: "Central Government public authority",
  sourceUrl: "https://rtionline.gov.in/",
  sourceUrls: [
    "https://rtionline.gov.in/faq.php",
    "https://rtionline.gov.in/guidelines.php?request=",
    "https://rtionline.gov.in/request/allpa.php",
    "https://nr.indianrailways.gov.in/view_section.jsp?backgroundColor=LIGHTSTEELBLUE&fontColor=black&id=0,6,299&lang=0",
  ],
  constraintSources: [
    {
      id: "text-limit",
      label: "3,000-character text limit and overflow guidance",
      sourceUrls: [
        "https://rtionline.gov.in/faq.php",
        "https://rtionline.gov.in/guidelines.php?request=",
      ],
    },
    {
      id: "authority-directory",
      label: "Northern Railway-Delhi Division authority listing",
      sourceUrls: ["https://rtionline.gov.in/request/allpa.php"],
    },
    {
      id: "railway-authority",
      label: "Northern Railway RTI contact and authority page",
      sourceUrls: [
        "https://nr.indianrailways.gov.in/view_section.jsp?backgroundColor=LIGHTSTEELBLUE&fontColor=black&id=0,6,299&lang=0",
      ],
    },
  ],
  submission: "demo" as const,
};

export const NORTHERN_RAILWAY_ROUTE: FilingRouteRef = {
  id: "northern-railway-rti",
  authority,
  profile: NORTHERN_RAILWAY_PROFILE,
  officialUrl: "https://rtionline.gov.in/",
  guidedCoverage: true,
};

export const FILING_ROUTE_DIRECTORY = [NORTHERN_RAILWAY_ROUTE] as const;

const NORTHERN_RAILWAY_GUIDED_SCOPE = {
  measure:
    "Maintenance expenditure, work orders, contracts, and contractor names",
  geography: "New Delhi Railway Station",
  period: "Financial year 2024–25",
  breakdown: "Contractor",
  informationHolder: "Northern Railway",
} as const;

function comparable(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

/** Guided Filing Coverage is a deterministic registry decision, never a model decision. */
export function isNorthernRailwayGuidedNeed(
  need: ConfirmedFilingNeed,
): boolean {
  return (
    need.scenario === "railway-filing" &&
    need.informationHolderStatus === "verified" &&
    (need.unresolvedClarifications?.length ?? 0) === 0 &&
    comparable(need.measure) ===
      comparable(NORTHERN_RAILWAY_GUIDED_SCOPE.measure) &&
    comparable(need.geography) ===
      comparable(NORTHERN_RAILWAY_GUIDED_SCOPE.geography) &&
    comparable(need.period) ===
      comparable(NORTHERN_RAILWAY_GUIDED_SCOPE.period) &&
    comparable(need.breakdown) ===
      comparable(NORTHERN_RAILWAY_GUIDED_SCOPE.breakdown) &&
    comparable(need.informationHolder) ===
      comparable(NORTHERN_RAILWAY_GUIDED_SCOPE.informationHolder)
  );
}
