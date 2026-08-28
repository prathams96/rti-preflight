# RTI Tathya

RTI Tathya helps an Indian citizen resolve a public-information need through the least burdensome valid route, without presenting itself as a public authority or official RTI service.

## Language

**Information Need**:
The public information a citizen is trying to obtain, whether it is already published or must be requested through RTI.
_Avoid_: Query, prompt, RTI query

**Occasional Applicant**:
A citizen who uses RTI infrequently and cannot be assumed to know the responsible authority, applicable process, or effective request wording.
_Avoid_: Novice user, layperson

**RTI Tathya**:
An independent research and drafting assistant that helps an Occasional Applicant find reliable existing information or prepare an RTI request when filing is necessary.
_Avoid_: RTI bot, automated PIO, official RTI portal

**Research Finding**:
Existing public information presented with enough evidence and context for the citizen to judge whether it resolves their Information Need.
_Avoid_: AI answer, instant RTI response

## Citizen purpose

**Informational Purpose**:
The citizen wants to learn reliable public information and does not require a new formal response from a public authority.
_Avoid_: Casual query, unofficial request

**Formal Response Purpose**:
The citizen needs a public authority to respond through the statutory RTI process, regardless of whether related information is already public.
_Avoid_: Certified answer, legal mode

**Resolution Preference**:
The citizen's stated choice between accepting reliable information from a published government source and requiring a new formal response from a public authority.
_Avoid_: User intent, reason for filing

**Information Need Card**:
The citizen-confirmed statement of one Information Need, including the measure, geography, period, requested breakdown, likely Information Holder, and Resolution Preference.
_Avoid_: Parsed prompt, generated query

**Material Clarification**:
A missing detail whose absence could change the meaning, scope, responsible Information Holder, or resolution status of an Information Need.
_Avoid_: Follow-up prompt, optional question

**Personal Record Need**:
An Information Need tied to an identifiable person's own government-held record rather than aggregate or generally public information.
_Avoid_: Personal query, ID-based RTI

**Official Service Route**:
An authenticated public-service channel for viewing, correcting, or obtaining a person's own record without defaulting to RTI.
_Avoid_: Alternative portal, external link

## Evidence and coverage

**Primary Public Source**:
Material published or issued by a public authority, including an official dataset, report, order, parliamentary response, or Anonymized RTI Response.
_Avoid_: Trusted website, verified internet source

**Anonymized RTI Response**:
A previously issued RTI response made public without the applicant's identifying details.
_Avoid_: Previous answer, community response

**RTI Response Fixture**:
A clearly fictional, identity-free response used only to demonstrate how the prototype would retrieve and present an Anonymized RTI Response.
_Avoid_: Anonymized RTI Response, official response

**Verified Coverage**:
The authorities, sources, periods, and material that RTI Tathya can truthfully report it checked for an Information Need.
_Avoid_: Full coverage, exhaustive government search

**Search Scope**:
The citizen-facing disclosure of the Verified Coverage used to produce a result, including material gaps that could affect the outcome.
_Avoid_: Search log, technical coverage

**Research Coverage**:
The public authorities and Primary Public Sources that RTI Tathya is designed to search for Research Findings.
_Avoid_: Product coverage, all-government access

**Guided Filing Coverage**:
The Filing Routes for which RTI Tathya can validate a Filing Draft, demonstrate applicant fields and fees, and complete a Demo Submission.
_Avoid_: Supported authorities, RTI coverage

**Information Holder**:
The public authority likely to maintain the records relevant to an Information Need, whether or not it is ultimately the correct authority for an RTI filing.
_Avoid_: Department selected by AI, owner

**Period Fit**:
The relationship between a source's applicable period and the period requested in the citizen's Information Need.
_Avoid_: Freshness score, recent enough

## Resolution

**Net Elector Change**:
The difference between authoritative registered-elector counts for the same geography and roll scope at two citizen-specified calendar dates.
_Avoid_: Voter IDs churned, gross churn, voters removed

**Source-Resolved**:
An outcome in which Primary Public Sources directly answer the complete Information Need with an appropriate Period Fit.
_Avoid_: Auto-handled, answered by AI

**Partially Resolved**:
An outcome in which Primary Public Sources support part of the Information Need while at least one required dimension remains unsupported.
_Avoid_: Mostly answered, probably resolved

**Derived Finding**:
A Research Finding calculated entirely from values supported by Primary Public Sources, with the inputs and calculation exposed to the citizen.
_Avoid_: Official figure, AI calculation

**Evidence Snapshot**:
A curated prototype copy of real Primary Public Source material used by the Evidence Index without implying live or exhaustive government-system access.
_Avoid_: Mock data, scraped government database

**Interpretive Caveat**:
A source-specific limitation needed to prevent a Research Finding from being understood more broadly or causally than its evidence supports.
_Avoid_: Disclaimer, fine print

**Evidence Conflict**:
A material disagreement between applicable Primary Public Sources that prevents RTI Tathya from selecting one claim as authoritative.
_Avoid_: Data glitch, resolved discrepancy

**Evidence Status**:
A factual description of how a finding is supported, such as directly stated, derived from official figures, found in an Anonymized RTI Response, partially supported, or conflicting.
_Avoid_: AI confidence, confidence percentage

**Grounded Result**:
A result whose factual claims and calculations are supported entirely by retrieved Primary Public Sources with traceable provenance.
_Avoid_: AI answer, model knowledge

**Formal Response Required**:
An outcome in which the citizen's purpose requires the statutory RTI process even when relevant public information has been found.
_Avoid_: Escalated, failed search

**No Reliable Finding**:
An outcome in which the checked sources do not support an answer to the Information Need; it does not establish that the information is unavailable or not public.
_Avoid_: No information exists, not public

**Interpretation Failure**:
A recoverable system state in which RTI Tathya could not reliably transform the citizen's input into an Information Need Card; it is not a resolution outcome or evidence finding.
_Avoid_: No Reliable Finding, invalid request

## Measurement

**Valid Resolution Path**:
A journey ending in either a Source-Resolved result or an appropriately scoped path toward a formal RTI response, without falsely closing the citizen's Information Need.
_Avoid_: Successful chat, completed query

**Citizen Override**:
The citizen's choice to prepare a Filing Draft after Preflight has Source-Resolved the Information Need from published evidence.
_Avoid_: Ignore result, file anyway

**Avoidable RTI Filing**:
An RTI filing for an Information Need that a Primary Public Source could already resolve to the required evidence standard.
_Avoid_: Redundant RTI, unnecessary citizen request

## Citizen artifacts

**Evidence Brief**:
A portable record of the confirmed Information Need, Research Finding, supporting evidence, unresolved gaps, search date, Search Scope, and RTI Tathya's independent status.
_Avoid_: AI report, RTI response

**Filing Draft**:
The citizen-editable request text prepared for a specific Information Holder and Filing Route, constrained to the confirmed Information Need and applicable route limits.
_Avoid_: AI application, legal letter

**Draft Divergence**:
A material difference introduced by citizen edits between a Filing Draft and its confirmed Information Need Card, including the addition of a separate need.
_Avoid_: Invalid edit, user error

**Filing Route**:
The current official channel through which a Filing Draft can be sent to a particular Information Holder, together with that channel's applicable limits, fields, fees, and attachment rules.
_Avoid_: RTI Online, submission link

**Filing Route Directory**:
The maintained mapping between Information Holders and their current official Filing Routes, constraints, fees, and verification dates.
_Avoid_: Central RTI portal list, route table

**Evidence Snapshot**:
A versioned subset of real Primary Public Sources used by the prototype to represent the intended Evidence Index while keeping retrieval reproducible and its boundaries honest.
_Avoid_: Mock data, complete index

**Filing Profile**:
The minimum applicant information required by a selected Filing Route, kept separate from anonymous research and indexed evidence.
_Avoid_: User profile, KYC

**Demo Submission**:
A simulated filing outcome that completes the prototype journey without transmitting a request, payment, or personal information to a government system.
_Avoid_: Submitted RTI, successful filing

**Demo Payment**:
A simulated fee step that demonstrates the applicable Filing Route without collecting, authorizing, or transmitting real payment information.
_Avoid_: Payment, fee paid

**Filing Package**:
The citizen-confirmed combination of Filing Draft, Filing Route, Filing Profile, attachments, and applicable fee or exemption prepared for submission.
_Avoid_: RTI form, application payload

**Saved Preflight**:
An OTP-backed record of an Information Need and its resulting Evidence Brief or Filing Draft, created only when the citizen chooses to save or continue.
_Avoid_: Account history, user session
