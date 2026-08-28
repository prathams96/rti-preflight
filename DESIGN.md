---
name: RTI Preflight
description: Evidence-led civic research and drafting arranged on a physical drafting-table surface.
---

<!-- Captured from the implemented surface in src/ui/PreflightApp.tsx and src/app/globals.css. -->

# Design System: RTI Preflight

## Overview

**Creative North Star: “Drafting Table for Evidence”**

RTI Preflight makes inspection tangible without imitating a government portal. The page is a light drafting-table ground beneath a compact dark-teal utility strip. The citizen’s current task sits on a white paper plane with crisp registration marks and a physical edge shadow; evidence and examples sit on pale blue translucent acetate layers that can align or offset for comparison.

The visual language is precise, quiet, and civic. Depth comes from paper edges, restrained shadows, opacity, and slight registration offsets—not from generic glass UI, decorative data graphics, or chatbot chrome. The surface remains a tool for asking, confirming, checking, and preserving the right to file.

## Surface anatomy

- **Utility strip:** Full-width dark-teal bar containing the independent-prototype identity statement and Prototype details action.
- **Identity row:** RTI Preflight wordmark/registration mark and a compact English/Hindi language toggle, placed above the journey content.
- **Task plane:** White paper Ask, Information Need, or Result plane with a strong outline, squared corners, physical bottom/side edge shadow, and registration marks at its corners.
- **Acetate layers:** Pale blue translucent evidence cards, examples, calculation strips, and supporting fields. Adjacent evidence cards may be subtly offset to show separate source layers.
- **Action accent:** Amber is reserved for the primary action; it is never used to signal warning, conflict, evidence quality, or selection.

## Color tokens

- **Deep drafting teal** (`#102F37` / utility strip `#042B34` → `#063F49`): body ink, utility strip, headings, strongest rules, and high-emphasis non-action controls.
- **Supporting teal** (`#225660`, `#315D64`): labels, explanatory copy, metadata, and quiet rules.
- **Drafting-table ground** (`#E8F0EF`, with soft white and blue-green radial fields): page background.
- **Paper** (`#FBFDFC` → `#EAF1F0`): task planes and primary working surfaces.
- **Acetate blue** (`rgba(194, 224, 227, .45)` and related pale blue layers): evidence cards, source comparison, calculation, and supporting examples.
- **Action amber** (`#F2A23A`, with the implemented action gradient): primary action only.
- **Problem oxblood** (`#7A2733`) and **partial slate** (`#7B8588`): semantic problem/uncertain states, always accompanied by icon and explicit words.

### Named rules

**The One-Job Amber Rule.** Amber means the citizen can act. If an element is not a primary action, it cannot be amber.

**The Three-Channel Status Rule.** Status meaning is carried by an icon, a visible label, and semantic treatment (including edge/border treatment); color is never the sole signal.

**The Layer-Order Rule.** White paper is the active working surface. Pale blue acetate supports comparison and provenance; it must not overpower the confirmed need or result.

## Typography

The implemented family is **Noto Sans**, with **Noto Sans Devanagari** for Hindi and `system-ui, sans-serif` fallbacks. Use tabular figures for changing counters, dates, percentages, monetary values, and aligned table columns.

- Keep headings, controls, evidence, and long-form explanations in the same family; hierarchy comes from scale and weight.
- Use calm, precise labels in sentence case. Uppercase is reserved for small metadata where it improves scanning.
- Hindi is the rhythm test: preserve line boxes, control heights, and spacing needed by Devanagari marks before tightening English.
- The compact identity row and restrained introductory line establish context without competing with the task plane.

## Layout and responsive behavior

The content uses a shared registration width of roughly 1080px on larger screens, with the utility strip spanning the viewport. The Ask plane is a two-column drafting layout on wide screens: the question spans the plane, while the privacy note and primary action resolve as a lower working edge. Subsequent screens keep the same paper-plane hierarchy.

Mobile is the design center. At narrow widths:

- the identity row and language toggle remain compact and reachable;
- paper planes lose the slight perspective treatment while retaining edge shadows and registration marks;
- the Ask plane becomes a single readable column with a reachable action edge;
- examples remain stacked acetate sheets;
- evidence tables become labelled rows/cards without horizontal scrolling for primary actions;
- language, Hindi copy, focus states, and tap targets remain first-class constraints.

## Depth, material, and registration

The system is dimensional but restrained. Paper planes use a solid offset edge plus a soft cast shadow to suggest a sheet on a table. Evidence and example layers use pale blue transparency and small offsets to suggest acetate overlays. There is no backdrop blur, glowing glass, floating dashboard, or photoreal material treatment.

Registration marks are short crosshair brackets at the corners of content being checked. They are functional: they identify the active paper plane or inspected result/need, never branding, navigation, empty space, or decoration.

## Interaction and motion

Hover and active states use small, purposeful translation or contrast changes for buttons and example layers. Any registration/alignment motion must remain brief and subordinate to reading. Under `prefers-reduced-motion: reduce`, transforms are removed and transitions/animations are effectively disabled; all information and actions remain available in the static layout.

## Status and evidence treatment

Every outcome retains an icon plus explicit label and semantic treatment. Supported findings use teal treatment; partial, unknown, or outside-snapshot outcomes use slate; conflicts, failures, and material gaps use oxblood. Evidence cards expose source type, title, extract, publisher, applicable period, immutable cell-reference count, and an official-source link. Derived findings expose the operation, matching-row count, and caveat. Search Scope and unresolved gaps stay visible rather than being hidden in visual styling.

## Do’s and don’ts

### Do

- Make the current citizen task the strongest white paper plane on the table.
- Use pale blue acetate layers to show provenance, examples, comparison, and supporting calculations.
- Keep the independent prototype disclosure in the utility strip and retain visible prototype details.
- Preserve icon + wording + semantic treatment for every status.
- Test English/Hindi switching, mobile widths, keyboard focus, and reduced motion against real journey copy.

### Don’t

- Don’t describe or implement the surface as a flat-only “Evidence Light Table.”
- Don’t use amber for warnings, gaps, conflicts, evidence status, or selection.
- Don’t use color as the only carrier of meaning.
- Don’t turn paper planes into generic glass cards, bento dashboards, chat bubbles, or ornamental 3D objects.
- Don’t use government seals, logos, tricolor portal conventions, or language implying official endorsement.
- Don’t make seeded examples look like separate product modes; they feed the same journey as free text.
