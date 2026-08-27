# Luna tickets #16–#20 browser verification

**Verified:** 2026-08-27

The release candidate was exercised at `http://localhost:3000` in a 360 × 800
viewport using the Playwright CLI. The browser session reported zero console
errors and no requests to government systems; the flows use the registered
fixtures and route metadata only.

| Flow                                                                  | Expected browser behavior                                                                                     | Observed                                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Mixed Hindi-English EPFO request: `Mera EPF claim ka status kya hai?` | Confirm the citizen's own-record intent, then show a route-only result without credentials or account fields  | `OFFICIAL_SERVICE_ROUTE`; official EPFO claim-status link, verification date, and primary source links shown; no personal input requested |
| Previous RTI example                                                  | Show fictional status clearly, with immutable provenance rather than an official-response claim               | Synthetic watermark and disclosure shown; three JSON-pointer groundings with content hashes; no source URL presented                      |
| CPCB / air-quality text                                               | Keep the cut conflict scenario out of seeded examples and avoid fabricating a conflict                        | CPCB is absent from scenario examples; direct CPCB text follows Outside Snapshot Coverage                                                 |
| Northern Railway filing                                               | Walk through no-finding result, draft, OTP demo, fictional details, review, demo payment, and acknowledgement | Completed end to end; acknowledgement states that no request, payment, or personal information was sent to a government system            |
| Filing package download                                               | Export only the allowlisted confirmed need, draft, fictional filing data, receipt, and disclosures            | Downloaded JSON contains no `rawPrompt`, `modelPayload`, `diagnostics`, `session`, or `originalText` keys                                 |
| Start another Preflight                                               | Clear the completed flow and saved state                                                                      | Returned to a blank start screen; saved-state storage was empty                                                                           |

The downloaded filing package is generated from the same public artifact builder
used by the application and is deterministic for the same input.
