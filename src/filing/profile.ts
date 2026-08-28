import type { FilingRouteRef, InformationHolderRef } from "./types";

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
  verifiedBy: "RTI Preflight route directory",
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
