import type {
  ConfirmedFilingNeed,
  FilingRouteRef,
  InformationHolderRef,
} from "./types";

export const NORTHERN_RAILWAY_HOLDER: InformationHolderRef = {
  id: "northern-railway",
  canonicalName: "Northern Railway",
};

export const GENERIC_RTI_DEMO_ROUTE_ID = "generic-rti-demo";

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

function genericHolderName(need: ConfirmedFilingNeed): string {
  const candidate = need.informationHolder?.trim();
  if (
    !candidate ||
    /^(unknown|to be confirmed|not specified|not yet specified|none specified|unspecified|relevant public authority)$/i.test(
      candidate,
    )
  )
    return "Relevant public authority";
  return candidate.slice(0, 120);
}

function genericHolderId(name: string): string {
  const slug = name
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return `demo-holder-${slug || "relevant-public-authority"}`;
}

/**
 * Creates a simulated fallback route for interpreted needs that are not in the
 * verified route directory. It deliberately carries no official route URL.
 */
export function createGenericRtiDemoRoute(need: ConfirmedFilingNeed): {
  holder: InformationHolderRef;
  route: FilingRouteRef;
} {
  const holderName = genericHolderName(need);
  const holder = {
    id: genericHolderId(holderName),
    canonicalName: holderName,
  };
  const route: FilingRouteRef = {
    id: GENERIC_RTI_DEMO_ROUTE_ID,
    authority: {
      id: "generic-rti-demo-authority",
      canonicalName: holderName,
      portalNames: {
        [GENERIC_RTI_DEMO_ROUTE_ID]: "Generic RTI demo route (not verified)",
      },
      jurisdiction: "unknown",
      aliases: [],
      lastVerified: "Not verified",
      verifiedBy: "RTI Tathya demo fallback",
    },
    profile: {
      id: "generic-draft-v1",
      version: "1.0.0",
      verifiedAt: "Not verified",
      text: { maxChars: 3_000, overflowStrategy: "reject" },
      identity: { fieldsRequired: [], fieldsProhibited: [] },
      jurisdictionRule:
        "The official filing authority and route must be verified before real filing.",
      sourceUrl: "https://example.invalid/rti-demo",
      sourceUrls: ["https://example.invalid/rti-demo"],
      unverifiedConstraints: [
        "This is a simulated fallback route; portal, authority, fee, and eligibility details are not verified.",
      ],
      submission: "demo",
    },
    guidedCoverage: false,
  };
  return { holder, route };
}

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
