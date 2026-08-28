# RTI Tathya release-gate report

This report is a checked-in evidence record for Luna tickets 21–25. It records what can be verified from this repository and keeps deployment-dependent claims explicitly open.

## Evidence record

| Gate                                 | Repository evidence                                                                                                                                                                                                                                                                             | Status                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| #21 Evidence Brief                   | `src/evidence/brief.ts` allowlists confirmed need, result, operands, operations, extracts, provenance, periods, gaps, search scope, and search date. `src/evidence/brief.test.ts` covers derived, synthetic, partial, no-finding, outside-coverage, determinism, and negative provenance cases. | Implemented locally                                                                                     |
| #22 Golden evaluation                | `src/release-gates/golden.test.ts` exercises the public Preflight/Filing seams, frozen NCRB result, lineage, coverage distinctions, narration grounding, demo rejection, disclosure ledger, and route constraints. Existing calculation tests cover the registered-table operator edge cases.   | Implemented locally; run full suite before release                                                      |
| #23 Bilingual/mobile/accessibility   | English/Hindi copy, semantic status text, reduced-motion CSS, narrow table cards, focus styles, and state persistence are in the app.                                                                                                                                                           | Browser/mobile/screen-reader evidence still required                                                    |
| #24 Privacy/performance/zero effects | `src/observability/` provides a local safe trace contract; route boundary tests cover body limits, confirmed-need gating, and Demo Adapter network isolation. `scripts/measure-release.mjs` records the modern-browser initial Ask-route JavaScript gzip measurement and reports deferred feature chunks separately. | Privacy boundary implemented locally; performance and deployed network-deny measurements still required |
| #25 Public certification             | `docs/release/release-checklist.md` and `docs/release/demo-runbook.md` define the evidence to collect. The PR Vercel Preview deployment completed, but its public URL redirects to Vercel login.                                                                                                | Blocked on public deployment access and smoke-test evidence                                             |

## Privacy and evidence decisions

- Evidence Briefs omit `originalText`, `traceId`, model responses, Filing Profile values, secrets, and internal diagnostics.
- Official dataset evidence must carry immutable grounding; synthetic fixtures must carry an explicit fictional/non-official disclosure.
- `NO_RELIABLE_FINDING` requires an execution receipt. `OUTSIDE_SNAPSHOT_COVERAGE` requires a capability manifest. Neither asserts that records are unavailable or unpublished.
- The Demo Adapter has no network call. No government, identity, OTP, payment, or unrelated endpoint is in the prototype's submission path.

## Measurement commands

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run measure:release
```

`measure:release` reports the sum of modern-browser JavaScript chunks referenced by the built Ask-route HTML, excluding `noModule` legacy polyfills, and reports deferred feature/PDF chunks separately. Each measurement is identified by its commit and Next build ID. Cold 3G first-contentful paint, cached Ask-to-Result p50/p95, deployed smoke flows, and reviewer-access checks must be appended after a real public deployment; this file intentionally does not invent those results.

Latest local production build measurement (2026-08-28, working tree): 606,083 raw JavaScript bytes, 174,716 bytes gzip at level 9 across seven modern initial chunks. The initial Ask-route budget passes below the 204,800-byte budget; PDF dependencies are absent from initial scripts and deferred to one 1,153,889 raw / 505,085 gzip chunk. This is not a deployed cold-3G measurement and must be rerun on the certified commit.
