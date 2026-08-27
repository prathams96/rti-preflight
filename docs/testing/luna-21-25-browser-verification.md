# Luna 21–25 browser verification

Date: 2026-08-27

Environment: local Next.js development server at `http://localhost:3000`, Chromium through Playwright CLI, viewport `360 × 800`.

## Observed

- The NCRB prompt reached the confirmed Information Need Card and then the derived result without a separate authority selector.
- The result showed the Derived Finding status, 16 rows, Gujarat's `₹175.1 → ₹423.5 crore`, `+248.4`, `38.4% → 23.2%`, and `−15.2 pp` values.
- **Save/share Evidence Brief** used the download fallback and produced `rti-preflight-evidence-brief.json`; the UI announced “Evidence Brief downloaded.” through a status region.
- Switching to Hindi on the result preserved the result rows, scope, evidence, and download feedback while translating the surrounding controls.
- The accessibility snapshot exposed labelled textboxes, buttons, headings, table headers, row headers, links, dialog controls, and status text.
- `document.documentElement.scrollWidth` remained `360` at the result and after switching to Hindi, so the primary result action did not introduce horizontal overflow.
- Prototype Details opened from the footer and closed with Escape.

Screenshot artifact captured during this verification: `.playwright-cli/page-2026-08-27T16-18-25-360Z.png` (ignored local browser output; attach it to the release PR when visual evidence is required).

## Still required before public certification

- Repeat the NCRB and Northern Railway flows against the production URL.
- Run a real screen reader check, keyboard-only pass through all seven screens, reduced-motion inspection, and Hindi clipping review.
- Capture cold-3G FCP and cached Ask-to-Result p50/p95 against the deployed build.
- Attach public smoke output and reviewer-access evidence to the certification checklist.
