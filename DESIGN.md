---
name: "NudgeThis — Reference desk"
description: "Ultramarine, Archivo and precise ruled surfaces for pointing, conversation and review."
colors:
  app-light-page: "#f4f6ff"
  app-light-surface: "#ffffff"
  app-light-elevated: "#edf1ff"
  app-light-text: "#172143"
  app-light-muted: "#566480"
  app-light-border: "#bdc8de"
  app-light-accent: "#2147cc"
  app-light-on-accent: "#ffffff"
  app-light-accent-soft: "#e7edff"
  app-light-success: "#21633d"
  app-light-success-soft: "#e7f4eb"
  app-light-danger: "#a33143"
  app-light-danger-soft: "#fbe9ed"
  app-light-warning: "#76510d"
  app-light-warning-soft: "#fff3d7"
  app-light-info: "#254dab"
  app-light-info-soft: "#e7edff"
  app-light-backdrop: "#0b1433"
  app-dark-page: "#101629"
  app-dark-surface: "#19223a"
  app-dark-elevated: "#243150"
  app-dark-text: "#eff3ff"
  app-dark-muted: "#b3c0dc"
  app-dark-border: "#536589"
  app-dark-accent: "#a8beff"
  app-dark-on-accent: "#101c47"
  app-dark-accent-soft: "#293e75"
  app-dark-success: "#a5deb7"
  app-dark-success-soft: "#233e31"
  app-dark-danger: "#ffb4c3"
  app-dark-danger-soft: "#4a2938"
  app-dark-warning: "#f0d184"
  app-dark-warning-soft: "#443b27"
  app-dark-info: "#abc5ff"
  app-dark-info-soft: "#293c65"
  app-dark-backdrop: "#050b1b"
  landing-light-page: "#f4f6ff"
  landing-light-surface: "#ffffff"
  landing-light-elevated: "#edf1ff"
  landing-light-text: "#111839"
  landing-light-muted: "#536184"
  landing-light-line: "#b4bfd9"
  landing-light-accent: "#2147cc"
  landing-light-on-accent: "#ffffff"
  landing-light-hero: "#2147cc"
  landing-light-hero-text: "#ffffff"
  landing-light-selection: "#f0df65"
  landing-dark-page: "#101629"
  landing-dark-surface: "#19223a"
  landing-dark-elevated: "#222e4b"
  landing-dark-text: "#eff3ff"
  landing-dark-muted: "#b3c0dc"
  landing-dark-line: "#516388"
  landing-dark-accent: "#a8beff"
  landing-dark-on-accent: "#101c47"
  landing-dark-hero: "#193bb3"
  landing-dark-hero-text: "#ffffff"
typography:
  landing-display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(96px, 8.9vw, 140px)"
    fontWeight: 900
    lineHeight: 0.84
    letterSpacing: "-.04em"
  landing-headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(32px, 3.7vw, 56px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-.03em"
  landing-process-title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-.03em"
  landing-body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  landing-hero-body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 400
    lineHeight: 1.4
  app-headline:
    fontFamily: "NudgeThis Archivo, system-ui, sans-serif"
    fontSize: "calc(var(--dr-size) * 2.8571)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-.035em"
  app-review-title:
    fontFamily: "NudgeThis Archivo, system-ui, sans-serif"
    fontSize: "calc(var(--dr-size) * 1.5714)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-.025em"
  app-section-title:
    fontFamily: "NudgeThis Archivo, system-ui, sans-serif"
    fontSize: "calc(var(--dr-size) * 1.2857)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-.02em"
  app-editor-title:
    fontFamily: "NudgeThis Archivo, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
  app-body:
    fontFamily: "NudgeThis Archivo, system-ui, sans-serif"
    fontSize: "var(--dr-size)"
    fontWeight: 400
    lineHeight: 1.6
  app-label:
    fontFamily: "NudgeThis Archivo, system-ui, sans-serif"
    fontSize: "calc(var(--dr-size) * 0.8571)"
    fontWeight: 400
    lineHeight: 1.6
  app-metadata:
    fontFamily: "NudgeThis Archivo, system-ui, sans-serif"
    fontSize: "calc(var(--dr-size) * 0.7857)"
    fontWeight: 400
    lineHeight: 1.6
  app-code:
    fontFamily: "ui-monospace, monospace"
    fontSize: "calc(var(--dr-size) * 0.8571)"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  app-default: "6px"
  app-control: "calc(var(--dr-radius) * .6)"
  app-badge: "calc(var(--dr-radius) * .65)"
  landing-control: "6px"
  landing-browser: "7px"
  circle: "50%"
spacing:
  4: "4px"
  6: "6px"
  8: "8px"
  10: "10px"
  12: "12px"
  16: "16px"
  17: "17px"
  18: "18px"
  20: "20px"
  22: "22px"
  24: "24px"
  26: "26px"
  28: "28px"
components:
  brand-mark:
    backgroundColor: "transparent"
    textColor: "{colors.landing-light-accent}"
  brand-icon:
    backgroundColor: "{colors.landing-light-accent}"
    textColor: "{colors.landing-light-on-accent}"
  brand-star:
    textColor: "{colors.landing-light-selection}"
  app-brand-icon:
    backgroundColor: "var(--dr-accent)"
    textColor: "var(--dr-onAccent)"
    width: "28px"
    height: "28px"
  app-brand-star:
    textColor: "var(--dr-warningSoft)"
  landing-source-button:
    backgroundColor: "#ffffff"
    textColor: "{colors.landing-light-text}"
    rounded: "{rounded.landing-control}"
    padding: "14px 33px"
    height: "65px"
  landing-primary-button:
    backgroundColor: "{colors.landing-light-accent}"
    textColor: "{colors.landing-light-on-accent}"
    rounded: "{rounded.landing-control}"
    padding: "14px 24px"
  app-primary-button:
    backgroundColor: "{colors.app-light-accent}"
    textColor: "{colors.app-light-on-accent}"
    rounded: "{rounded.app-default}"
    padding: "11px 16px"
  app-secondary-button:
    backgroundColor: "{colors.app-light-surface}"
    textColor: "{colors.app-light-text}"
    rounded: "{rounded.app-default}"
    padding: "8px 11px"
  app-secondary-button-hover:
    backgroundColor: "{colors.app-light-elevated}"
  app-composer-field:
    backgroundColor: "{colors.app-light-surface}"
    textColor: "{colors.app-light-text}"
    typography: "{typography.app-body}"
    rounded: "{rounded.app-default}"
    padding: "10px 12px"
  app-navigation-selected:
    backgroundColor: "{colors.app-light-accent-soft}"
    textColor: "{colors.app-light-accent}"
    rounded: "{rounded.app-default}"
    padding: "10px"
  app-ready-badge:
    backgroundColor: "{colors.app-light-success-soft}"
    textColor: "{colors.app-light-success}"
    rounded: "{rounded.app-badge}"
    padding: "4px 7px"
  app-queue-container:
    backgroundColor: "{colors.app-light-surface}"
    textColor: "{colors.app-light-text}"
    rounded: "{rounded.app-default}"
  app-review-tab:
    backgroundColor: "transparent"
    textColor: "{colors.app-light-muted}"
    padding: "11px 0"
  app-selection-outline:
    rounded: "3px"
---

# Design System: NudgeThis

## Overview

**Creative North Star: "Reference desk"**

NudgeThis uses broad Archivo lettering, ultramarine emphasis, cool pale ground, navy ink and precise rules. The shared language is direct and legible, with modest rectangular controls and a visible relationship between a selected object and its conversation.

The public landing uses expansive blue, heavy display type and a large illustrative local browser. The local application uses compact typography, a ruled queue, restrained accent coverage, readable conversations and explicit review actions. These are two expressions of one identity.

The documented application palette, font and radius are defaults. Saved repository appearance remains authoritative across dashboard and isolated overlay roots, including custom light/dark palettes and body, heading or code fonts. NudgeThis is the public name and product copy is English; existing DevReview CLI, API and integration identifiers remain compatible.

**Key Characteristics:**
- Ultramarine actions and selection against cool surfaces.
- Archivo at expressive landing scale and compact application scale.
- Fine borders and tonal separation, with no decorative shadow vocabulary.
- User-controlled application appearance, including independent light and dark palettes.

Implementation sources: `apps/site/site.css`, `apps/site/public/index.html`, `apps/site/demo.ts`, `packages/overlay/src/appearance.ts`, `styles.ts`, `review.ts`, `project-context.ts`, `fonts.ts`, and `packages/server/public/style.css` plus `index.html`.

Logo sources: `assets/brand/nudgethis.svg`, `assets/brand/nudgethis-icon.svg`, and the shared SVG import in `packages/overlay/src/brand.ts`.

## Colors

Ultramarine supplies the brand's strong emphasis; cool neutrals support long reading, with semantic state pairs in the application.

### Primary

- **Ultramarine / bright blue:** `app-light-accent` and `app-dark-accent` drive primary actions, focus, selected navigation and inspection outlines. Their corresponding `on-accent` roles provide text on filled controls.
- **Soft selected blue:** the application's `accent-soft` roles distinguish selected navigation, selected targets and user-message surfaces without filling a conversation with solid accent.
- **Lemon selection:** `landing-light-selection` is the landing's marker and selection color in both modes. The live application's inspection handles instead inherit `warning-soft` and `warning`; they must stay themeable.

### Neutral

The application has exactly 18 roles per mode, recorded in the frontmatter under `app-light-*` and `app-dark-*`. Hyphenated documentation keys map to camelCase runtime keys (`accent-soft` → `--dr-accentSoft`, for example).

| Runtime roles | Use |
| --- | --- |
| `page`, `surface`, `elevated` | Page ground, primary containers and raised/hover regions |
| `text`, `muted` | Reading hierarchy |
| `border` | Fine dividers and control boundaries |
| `accent`, `onAccent`, `accentSoft` | Action, readable filled-action text and selected surface |
| `success`, `successSoft` | Ready/applied badges and added diff lines |
| `danger`, `dangerSoft` | Failed/conflict badges, removed diff lines and errors |
| `warning`, `warningSoft` | Awaiting-feedback badges, warnings and inspection handles |
| `info`, `infoSoft` | Working, analyzing, validating and applying states |
| `backdrop` | Modal dimming |

The landing has its own `--page`, `--surface`, `--elevated`, `--text`, `--muted`, `--line`, `--accent`, `--on-accent`, `--hero`, `--hero-text` and `--selection` properties. Both modes are recorded separately where declared. Its navy ink, border and dark raised surface differ slightly from application defaults; preserve these scoped values instead of silently consolidating them. The dark landing retains a deep-blue hero with white text while its regular action color becomes brighter.

**The Semantic Appearance Rule.** Application surfaces consume all 18 semantic appearance roles through --dr-* variables; saved values take precedence over these defaults. Keep success, danger, warning and activity meanings distinct from brand emphasis.

## Typography

**Display Font:** Archivo, locally served in the landing at weights 400, 700 and 900, with system-ui and sans-serif fallbacks. `font-synthesis: none` is set on the landing.

**Body Font:** NudgeThis Archivo in the application, with system-ui and sans-serif fallbacks. Bundled WOFF2 bytes are loaded through FontFace at weights 400 and 700; the overlay does not need an external font request.

**Label/Mono Font:** ui-monospace, monospace by default for code, file paths and selected technical targets. User font choices override each body, heading and mono role independently.

**Character:** Broad, compact Archivo headings carry the identity. Regular labels and spacious text leading keep operational surfaces readable.

### Hierarchy

- **Landing display:** `landing-display` is reserved for the three-line hero. At 1023px and below it becomes `clamp(74px, 12vw, 118px)` with 0.9 leading; at 600px and below it becomes `clamp(67px, 16vw, 96px)` with 0.88 leading. Authored breaks retain “That bit. / Make it / better.”
- **Landing headline and process title:** lower sections use `landing-headline`; the three-step sequence uses the heavier `landing-process-title`. Neither is the application's heading ramp.
- **Application headline:** `app-headline` is about 40px at the default base size and about 34px on phones. It is distinct from the compact review title (about 22px) and section title (about 18px).
- **Application editor title:** Appearance and Project context declare 22px/600. Only 400/700 default font faces are bundled, so font matching uses the available bold face; do not describe a separately shipped 600 face.
- **Body and labels:** application base text defaults to 14px; controls and labels commonly use 12px, metadata 11px, and compact timestamps 10px. These sizes derive from `--dr-size`. Review reading uses 1.6 leading; overlay/editor chrome uses 1.5. The base is user-adjustable from 12–20px.
- **Code:** use the configurable mono family and 1.7 leading for patches. Diff scroll areas preserve whitespace; context snapshots wrap plain text. Landing FAQ paragraphs stay within 65ch; the context introduction stays within 75ch.

**The Surface Scale Rule.** Share the type family and compact lettering character. Reserve display sizes for the landing and use compact, readable sizes in the application.

## Layout

The spacing tokens are observed recurring steps, not a universal grid. Application containers commonly use 16–26px insets, compact controls use 8–13px vertical padding, and fine rules divide dense information. The landing uses larger section spacing and generous surrounding ground.

The desktop landing has a 44.85% / 55.15% hero split and an 840px minimum hero height. Its general wrapper is 93% wide with a 1500px maximum. At 1023px the blue introduction and browser stack; at 600px the process sequence and lower sections become single-column. The 1024–1400px range reduces demonstration typography. These are landing-specific composition rules.

The desktop dashboard uses a fixed 232px rail, 44px main horizontal padding and a main maximum width of 1800px. At 1080px toolbar and queue-header content stack; at 700px the rail becomes a top navigation strip, page padding becomes 16px and task status moves beneath the title. Metrics remain a ruled line of real counts, not a card grid.

Shared review content keeps heading, wrapping tabs and actions around a scrollable content region. Dashboard task dialogs are 900px wide and at most 880px tall; overlay review is at most 1120px by 860px, with a 235px conversation rail. At 700px the overlay rail becomes a horizontal row. Shared review spacing compacts again at 600px.

Project context is bounded to 920px with a 240px library column; at 640px it stacks with a horizontal library. Appearance is bounded to 720px and changes its color grid to one column at 540px. Native dialog viewport gutters and bounded height preserve scrolling to actions. Long titles and snapshot text wrap; patches scroll horizontally where source whitespace matters.

## Elevation & Depth

The documented surfaces have no box-shadow vocabulary. Fine borders, pale or dark tonal steps, and filled selection establish hierarchy. Dialogs dim the inspected page with `color-mix(in srgb, var(--dr-backdrop) 65%, transparent)`. Floating overlay controls retain a crisp border and scoped theme rather than imitating a physical card.

**The Ruled Surface Rule.** Separate regions with fine borders and surface tones. Modal depth comes from the backdrop, not an invented shadow.

## Shapes

Use modest rectangles: the default application radius and landing controls share a 6px starting point, while the landing's browser and conversation frames use 7px. Application radius is user-adjustable from 0–24px. Appearance/context editor controls use 0.6 times that saved radius, badges 0.65 times it. Status dots and avatars are circles. Selection handles are small squares; the live inspection outline uses a fine, lightly tinted box.

Most container and control boundaries are one pixel. Live inspection outlines and review-tab selection are two pixels. Functional icons are inline outlined SVGs, typically 20px in the app and 24px on the landing, with a 1.7 stroke and rounded caps/joins. Letter avatars identify participants; they are not substitutes for action icons.

## Components

### Cursor and star logo

The brand mark pairs a cursor with a four-point star at its tip. `assets/brand/nudgethis.svg` is the transparent mark: an ultramarine cursor and lemon star with an ultramarine outline. `assets/brand/nudgethis-icon.svg` is the compact icon: a white cursor and lemon star on an ultramarine tile. Both preserve a square `0 0 96 96` viewBox, a three-unit stroke and rounded joins; the tile has a 20-unit corner radius. Preserve this geometry when scaling.

The landing and README use the icon's fixed brand colors. The application embeds the same trusted SVG through `packages/overlay/src/brand.ts`. In `packages/overlay/src/styles.ts` and `packages/server/public/style.css`, `--nt-logo-background` maps to `--dr-accent`, `--nt-logo-cursor` to `--dr-onAccent`, and `--nt-logo-star` to `--dr-warningSoft`. Saved appearance controls all three; the logo does not override a user's palette.

The landing header uses a 36px icon, reducing to 28px at 600px and 24px at 360px. Its demonstration header uses 24px, reducing to 20px at 600px; the footer uses 32px. Dashboard and overlay conversation headers use 28px, the playground uses 32px, and the overlay launcher uses 24px. The README displays the icon at 80px. Marks alongside the NudgeThis name are decorative for assistive technology; the README image has descriptive alternative text.

Both landing and local application favicons use the canonical icon. `scripts/build-site.js` copies it to `dist/site/assets/favicon.svg` and the transparent mark to `dist/site/assets/nudgethis.svg`; the local server embeds the icon from its canonical source. The landing's moving demonstration pointer remains a separate functional illustration.

### Buttons

Direct, modest rectangles. Dashboard primary actions use accent/onAccent with a matching border; secondary actions use surface/text with border. Hover darkens filled actions slightly and raises secondary surface tone while changing its border to accent. Landing source actions on blue use white fill and navy text; the lower source action uses the regular accent pair. Component frontmatter describes default light appearances; runtime snippets resolve current theme variables.

Application focus uses a two-pixel accent outline with a three-pixel offset in shared review/editors and four pixels on the dashboard. Landing focus is three pixels with a five-pixel offset; hero links use white focus. Disabled controls retain layout and reduce opacity. Preserve the explicit Apply current changes action and readable pending/disabled states.

### Chips

Status badges pair a small dot with text and a semantic foreground/background pair. Validated ready/applied is success, failed/conflict/recovery is danger, agent activity is info and awaiting-feedback, drafts and unchecked ready changes use warning. Neutral states use muted/elevated. The badge is compact, not pill-shaped.

### Cards / Containers

The queue is one bordered surface with ruled rows. Its header combines the title, real count and search. Rows separate icon, title/metadata, status and review action; hover uses page tone. Dialogs, the landing browser and the separate demo conversation use the same precise frame language at their own scale.

### Inputs / Fields

Surface-colored fields with text and border roles, configured radius, accent caret and explicit focus outline. The follow-up composer is vertically resizable, 78px minimum and 160px maximum by default. Appearance/context fields share compact insets and the smaller derived control radius. Errors use semantic text plus readable copy; draft state stays visible during save failures.

### Navigation

Dashboard queue filters use selected blue ground, accent text and bold emphasis. Shared review tabs use an accent underline and selected text, with wrapping on narrow screens. Overlay conversation navigation becomes a scrollable horizontal row on phones. All current states have semantic selection attributes in addition to color.

### Conversation, review and context

User messages align right on selected-blue ground; agent messages align left on the reading surface. Role/time/version labels support the conversation. Changes, History and Context used remain separate tab panels. Code additions/removals use semantic state pairs. Context choices are collapsible near the composer; historical context snapshots are readable, bounded and distinct from the editable library.

### Workspace and route review

The task composer and setup dialog share the existing surface, border, radius, font roles
and accent controls. Route review extends the framed workspace to a two-column checklist
and preview. Its top progress bar counts reviewed viewports; the list pairs readable desktop
and mobile states. On phones the checklist and preview stack. Preview scaling preserves
its selected layout width; the surrounding interface retains the user's saved theme.

### Selected object and demonstration

The landing selection box surrounds the example Save changes button with four lemon handles; a continuous thin connector starts at its bottom edge and reaches the conversation. The connector is measured from actual element geometry on resize and disappears after Apply. This is a relationship diagram specific to the demonstration, not general page decoration. The live overlay uses a themeable inspection outline with two corner handles.

The landing runs one bounded 13-second point/tell/review/apply sequence with manual steps, pause and replay. Button padding changes over 450ms using `cubic-bezier(.16, 1, .3, 1)`; agent visibility uses a 200ms opacity transition. Hidden/offscreen state pauses the animation clock. Reduced motion disables transitions and starts at the static applied result with manual navigation still available. Application motion remains restrained; no general entrance-animation system is established.

## Do's and Don'ts

### Do:
- **Do** reuse the canonical cursor-and-star SVG geometry and keep embedded application logo colors bound to saved appearance roles.
- **Do** inherit application colors, fonts, text size and corner radius through the saved appearance variables.
- **Do** keep selected objects, their conversation and the current review decision visually connected.
- **Do** pair state color with readable status text and preserve visible keyboard focus.
- **Do** retain deliberate landing headline phrase breaks and test the selected-button connector when the demonstration resizes.
- **Do** use NudgeThis and English product copy while preserving compatible DevReview technical identifiers.

### Don't:
- **Don't** apply the landing’s display scale or large blue field to application conversations.
- **Don't** replace saved themes or uploaded fonts with hard-coded brand defaults.
- **Don't** introduce decorative eyebrows, text glyph icons or hard offset shadows as house style.
- **Don't** merge current changes, historical versions and captured context into one undifferentiated panel.
