# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Next.js App Router with TypeScript.
- Vercel is the intended public deployment target.
- The OpenAI API is called server-side with structured outputs and `store: false`; API keys never reach the browser.
- The prototype uses a frozen, build-time-hashed Evidence Snapshot, versioned JSON fixtures and route profiles, and deterministic in-process TypeScript calculations.
- Journey and draft state live in the browser session/local state. There is no server-side citizen database and no separate production backend tier.

## Users

The primary user is an **Occasional Applicant** in India: a citizen with one specific public-information need who cannot be expected to know which public authority holds the information, whether it has already been published, how to phrase an effective RTI request, or what a filing portal requires.

The user may be on a mobile device or slower connection, may have limited digital experience, and may communicate in English, Hindi, or mixed Hindi-English. They are trying to resolve one Information Need through the least burdensome valid route, while retaining the right to seek a formal response.

## Product Purpose

RTI Preflight is an independent research and drafting assistant. It first checks whether reliable published government information resolves a citizen's confirmed Information Need. If it does not—or the citizen still requires a new formal response—it prepares a focused, editable Filing Draft and demonstrates the filing journey without transmitting anything to a government system.

The product exists because public information can already be available yet hard to discover. Its promise is: **Before you file and wait, check whether reliable public information already answers your question—and prepare a better RTI when it does not.**

Success is measured by the **Valid Resolution Path rate**: journeys that end in either a supported resolution or an appropriately scoped formal-request path without false closure. False Source-Resolved results, unsupported claims, incomplete provenance, and derived claims without visible operands are release-blocking failures. Overall reduction in RTI filings is not a success metric.

## Positioning

RTI Preflight is not a general government chatbot, authority directory, or filing-avoidance tool. Its distinctive mechanism is a citizen-confirmed, need-first journey that separates language-model interpretation from evidence retrieval and deterministic calculation. Every factual result must be traceable to the curated Evidence Snapshot, every derived result must expose its operands and operation, and uncertainty routes conservatively while the citizen's option to file remains available.

## Operating Context

The P0 product is a browser-based hackathon prototype with a complete citizen-facing journey:

1. Ask for public information in natural language or choose a seeded example.
2. Review and explicitly confirm an Information Need Card; clarify material gaps one at a time.
3. Search the versioned prototype Evidence Snapshot.
4. Review a grounded result, its Evidence Status, evidence, calculations, gaps, and Search Scope.
5. Prepare and edit a Filing Draft when a formal response remains appropriate.
6. Complete simulated OTP, fictional applicant details, final review, and ₹10 Demo Payment steps.
7. Receive an explicitly fictional Demo Submission acknowledgement and downloadable Filing Package.

Research remains anonymous until the citizen chooses to save or file. All seven screens must work at 360px and on a slower connection. The Ask route targets no more than 200KB of gzipped JavaScript and a cold 3G first-contentful-paint budget of two seconds.

## Capabilities and Constraints

- Accept arbitrary free text; identify and visibly split multiple Information Needs; extract measure, geography, period, breakdown, likely Information Holder, and Resolution Preference.
- Ask only Material Clarifications and never search before the citizen confirms the interpreted need.
- Retrieve only from the prototype's curated, versioned Evidence Snapshot. Absence from the snapshot never becomes a claim that information is unpublished or unavailable.
- Render Source-Resolved, Derived Finding, Partially Resolved, Formal Response Required, No Reliable Finding, Evidence Conflict, and Outside Snapshot Coverage outcomes with their correct evidence and scope disclosures.
- Use model assistance for interpretation, planning, explanation, and drafting. Use validated application code—not the model—for retrieval, arithmetic, provenance, outcome classification, route validation, and grounding enforcement.
- Preserve row-level provenance. Model memory never supports a citizen-visible factual claim, and retrieved content is treated as untrusted data rather than instructions.
- Keep a visible Citizen Override path to prepare an RTI even after a source resolves the need.
- Support Guided Filing only for verified selected Central Filing Routes. Other recognized authorities may receive an editable draft and verified route information, but Demo Payment and Demo Submission remain disabled.
- The represented Central route blocks drafts over 3,000 characters without truncating or silently shortening citizen text.
- Likely sensitive identifiers are masked before model calls. Aadhaar, PAN, EPIC, real OTPs, real payment credentials, and real government login details are never requested or accepted.
- P0 performs no real government submission, OTP delivery, identity verification, payment authorization, status tracking, response ingestion, statutory deadline calculation, appeal support, crawling, refresh jobs, or source-administration workflow.
- Demo OTP is `123456`; applicant details, payment, acknowledgement, and submission are conspicuously fictional or simulated.
- P0 is prioritized around the seven-screen journey, the deterministic NCRB hero scenario, the Northern Railway filing journey, grounded free-text behavior, honest disclosure, mobile usability, and English/Hindi state preservation.

## Brand Commitments

- Product name: **RTI Preflight**.
- Persistent status: **Independent hackathon prototype—not affiliated with or endorsed by any government authority.**
- The product must never imply official status, partnership, endorsement, or exhaustive access to Indian government information. Government logos must not be used in a way that suggests endorsement.
- Voice is plain, precise, respectful, non-legalistic, and honest about what is real, curated, synthetic, working, or simulated. Prototype limitations belong in the interface, not only in footer text.
- Use the confirmed domain vocabulary in [`CONTEXT.md`](./CONTEXT.md), including Information Need, Occasional Applicant, Research Finding, Evidence Snapshot, Search Scope, Filing Draft, and Demo Submission. Avoid framing outputs as “AI answers” or “instant RTI responses.”
- The origin story may state that an Election Commission RTI response pointed to already-public but hard-to-find information. The original link is no longer on hand; the product must not reconstruct it, invent it, or imply that the page itself is dead.

## Evidence on Hand

- Confirmed citizen journey and acceptance specification: [`docs/product/RTI-PREFLIGHT-PROTOTYPE-SPEC.md`](./docs/product/RTI-PREFLIGHT-PROTOTYPE-SPEC.md).
- Confirmed P0 architecture: [`docs/product/RTI-PREFLIGHT-FULL-ARCHITECTURE.md`](./docs/product/RTI-PREFLIGHT-FULL-ARCHITECTURE.md).
- Confirmed terminology: [`CONTEXT.md`](./CONTEXT.md).
- Hackathon requirements and evaluation context: [`build-what-moves-india-brief-and-faq.md`](./build-what-moves-india-brief-and-faq.md).
- Real official NCRB hero source: the data.gov.in “State/UT-wise Value of Property Stolen and Recovered & Recovery Percentage during 2021 to 2023” resource and its official CSV. The deterministic expected result is exactly 16 individual States/UTs, excluding aggregate rows; Gujarat is the required example row.
- A previous-RTI-response scenario is available only as a clearly labelled synthetic RTI Response Fixture.
- The CPCB conflict scenario has no approved evidence until two genuinely applicable, scope-compatible official sources are selected and verified; it must be cut rather than fabricated if that dependency remains open.
- The Northern Railway Information Holder and filing route, the EPFO Official Service Route, and final Filing Route metadata require verification against current official sources before shipping.
- Fictional applicant details and acknowledgement identifiers still need to be prepared. No real testimonials, customers, adoption claims, government endorsements, or production usage evidence are on hand and none may be invented.

## Product Principles

1. Start with the citizen's need, not an authority selector.
2. Ask rather than silently assume; confirmation precedes retrieval and filing.
3. Evidence outranks fluency, and uncertainty must never create false closure.
4. Show both what the evidence establishes and what it does not.
5. Preserve citizen control, anonymity during research, and an obvious right to file.

## Accessibility & Inclusion

- Support English and Hindi interface copy, mixed Hindi-English input, and journey-state preservation across language switching.
- Keep original-language source extracts beside clearly labelled machine translations.
- All controls must be keyboard and screen-reader accessible, with visible focus states, comfortable mobile tap targets, and reduced-motion behavior.
- Status and outcome meaning must use text and icons, never color alone.
- Evidence must remain usable without PDF preview; narrow layouts turn tables into labelled cards and never require horizontal scrolling for primary actions.
