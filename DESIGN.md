---
name: RTI Preflight
description: Evidence-led civic research and drafting expressed as a flat inspection system.
---

<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->

# Design System: RTI Preflight

## Overview

**Creative North Star: "Evidence Light Table"**

RTI Preflight makes inspection visible. A citizen's Information Need occupies the active plane while sources, interpretations, calculations, and drafts align beneath it for checking. Registration marks and flat overlays express provenance and comparison without imitating government paperwork or turning the experience into a chatbot.

The world is polished, serious, and entirely two-dimensional. It relies on typography, border weight, alignment, and disciplined color rather than physical-paper effects, decorative data graphics, or generic AI chrome. Expression must never obscure the current task, evidence state, or familiar control affordance.

**Key Characteristics:**

- Flat, planar evidence fields aligned to one inspection grid.
- One unmistakable active plane; supporting information remains quieter.
- Registration brackets with a semantic inspection role.
- Restrained civic clarity without official-looking government styling.
- Icon, wording, and edge treatment working together for every status.

## Colors

The palette is cool, restrained, and evidence-led, with one deliberately scarce action color.

### Primary

- **Deep Inspection Teal** (`#132C33`): Active task planes, the strongest inspection frames, primary text on light surfaces, and high-emphasis controls that are not calls to action.

### Secondary

- **Oxidized Evidence Teal** (`#4F6F73`): Supporting rules, source metadata, quiet icons, and secondary evidence structure.
- **Action Amber** (`#F2A23A`): Primary actions only. It never communicates warning, risk, conflict, gaps, evidence quality, or selection state.

### Tertiary

- **Problem Oxblood** (`#7A2733`): Conflicts, failures, and material evidence gaps, always paired with an icon and explicit wording.
- **Partial Slate** (`#7B8588`): Partial, unknown, unverified, or outside-coverage states, always paired with an icon and explicit wording.

### Neutral

- **Light-Table Mist** (`#EEF2F1`): Page ground and quiet planar fields. It keeps the interface bright enough for mobile use in daylight without becoming clinical white.

### Named Rules

**The One-Job Amber Rule.** Amber means the citizen can act. If an element is not an action, it cannot be amber.

**The Three-Channel Status Rule.** Status is never color alone. Every status combines a distinct icon, explicit words, and a colored left edge: teal for supported, slate for partial or unknown, and oxblood for a problem or conflict.

## Typography

**Display Font:** Noto Sans, with `system-ui, sans-serif` fallback  
**Body Font:** Noto Sans, with `system-ui, sans-serif` fallback  
**Hindi Font:** Noto Sans Devanagari, with `Noto Sans, system-ui, sans-serif` fallback

**Character:** Professional, restrained, and highly legible, with conventional letterforms and calm weight contrast. The same family carries headings, controls, evidence, and long-form explanations; hierarchy comes from scale and weight rather than switching personalities.

### Hierarchy

- **Display:** Reserved for short, task-defining statements; exact size and weight remain to be resolved during implementation.
- **Headline:** Establishes the current journey state without competing with the active task plane; exact metrics remain to be resolved during implementation.
- **Title:** Names evidence groups, draft sections, and material steps.
- **Body:** Uses Devanagari-safe line boxes and generous vertical padding. Hindi is the clipping and rhythm test; English must not be tightened below the metrics Hindi requires.
- **Label:** Sentence case by default. Uppercase is not a decorative texture.
- **Numeric UI:** Uses equal-width tabular figures for counters, dates, monetary values, percentages, and aligned columns (`font-variant-numeric: tabular-nums`). Counters must not jitter as values change.

### Named Rules

**The Hindi-Sets-the-Rhythm Rule.** Line height and control height are approved in Hindi first, including marks above and below the headline; English inherits that space.

**The Stable-Numbers Rule.** Every changing counter and numeric column uses tabular figures. Visual wobble is a functional defect.

## Layout

The system is mobile-first and planar. Content aligns to a shared registration grid; the current task receives the strongest frame and contrast, while source material, explanations, and alternatives step down in emphasis without retreating into floating cards.

Desktop layouts widen the evidence plane and reveal more comparison at once. They do not become dashboards. Narrow layouts preserve the same reading order, turn dense tables into labelled rows, and keep primary actions reachable without horizontal scrolling.

Spacing, breakpoints, maximum widths, and exact grid measurements remain to be resolved from the first implementation.

## Elevation & Depth

The system is flat by invariant. It uses no drop shadows, cast shadows, simulated paper thickness, perspective, tilt, parallax, floating sheets, glassmorphism, or photoreal material. Hierarchy comes from planar color fields, border weight, overlap, opacity, and alignment.

**The Flat Evidence Rule.** A source layer may overlap or align, but it never appears to float above the citizen's work.

## Shapes

Forms are crisp and near-square, with restrained corner treatment. Exact radius tokens remain to be resolved during implementation. Strong border weight belongs to the active inspection plane; quieter rules organize supporting material.

Inspection brackets have one semantic meaning: the enclosed content is currently being inspected or validated. They may frame an Information Need, a source extract, a calculation, or a Filing Draft. They never decorate logos, navigation, headings, or empty space.

**The Brackets-Mean-Inspection Rule.** If the system is not actively checking the content, brackets do not appear.

## Do's and Don'ts

### Do:

- **Do** make the active citizen task the strongest object on the screen through border weight, scale, and contrast.
- **Do** use flat registration, alignment, and source layering to show how evidence is inspected.
- **Do** pair every status with an icon, explicit wording, and a semantic left edge.
- **Do** validate typography and control metrics with real Hindi copy and changing numerical values.
- **Do** keep prototype limitations visible in the same visual system as the primary task.

### Don't:

- **Don't** use amber for warnings, gaps, conflicts, or evidence status.
- **Don't** use color as the only carrier of meaning.
- **Don't** use inspection brackets as branding or ornament.
- **Don't** introduce 3D paper, shadows, glowing gradients, glass, chat bubbles, bento grids, or generic AI-assistant styling.
- **Don't** imitate government identity, official seals, or tricolor portal conventions.
- **Don't** let sample questions appear to be separate hardcoded product modes.
