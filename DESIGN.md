# Design guide

NudgeThis uses an ultramarine palette, Archivo typography, fine borders and compact
rectangular controls. The website and application share this identity. Application
appearance remains configurable per project.

## Source of truth

| Surface | Source |
| --- | --- |
| Application theme and defaults | [appearance.ts](packages/overlay/src/appearance.ts) |
| Overlay layout | [styles.ts](packages/overlay/src/styles.ts) |
| Shared conversation and review | [review.ts](packages/overlay/src/review.ts) |
| Dashboard layout | [style.css](packages/server/public/style.css) |
| Website layout and motion | [site.css](apps/site/site.css), [demo.ts](apps/site/demo.ts), [profiles.ts](apps/site/profiles.ts) |
| Brand artwork | [cursor mark](assets/brand/nudgethis.svg), [app icon](assets/brand/nudgethis-icon.svg) |

Use these implementations for exact colors, dimensions and breakpoints. Avoid maintaining
a second copy of the CSS values in documentation.

## Colors and fonts

Application components use the 18 semantic appearance roles through `--dr-*` variables.
Use accent colors for actions and selection, and success, warning, danger and info pairs
for their corresponding states. Pair color with readable text.

Saved light/dark palettes, body/heading/code fonts, text size and corner radius take
precedence over the defaults. The overlay stays inside its Shadow DOM and must not
restyle the inspected page. See [Appearance](docs/appearance.md) for supported settings.

Archivo is bundled locally at weights 400/700 for the application and 400/700/900 for the
website. Retain the font licenses. Do not add remote font requests to application themes.
Use the configurable monospace family for code and diffs.

## Components and responsive layout

Use compact controls, fine borders and surface tones to separate content. Reserve large
display typography and broad blue backgrounds for the website; conversations need readable
text, bounded scrolling and clear actions.

Keep a selected element or group visibly connected to its request. Conversation, Changes,
History and Context used are separate views. Current changes and historical versions must
remain distinguishable, and applying a patch requires an explicit action.

At narrow widths, navigation and columns stack or wrap. Dialogs must keep their actions
reachable, long text must wrap, and code can scroll horizontally. Preserve keyboard focus,
native control semantics and meaningful disabled/error states. Check light, dark and custom
themes when changing shared components.

## Brand assets

Use the canonical cursor with a four-point star; scale its SVG geometry without redrawing
it. The website and README use fixed brand colors. The application's embedded icon maps
its background, cursor and star to the user's appearance variables through
[brand.ts](packages/overlay/src/brand.ts).

[build-brand.js](scripts/build-brand.js) generates raster favicon and home-screen sizes
from the same SVG. The social preview has an editable
[HTML source](assets/brand/social-preview.html); see the [website guide](apps/site/README.md)
for regeneration instructions.

## Motion

The website has separate illustrative workflows for starting an idea, making visual changes
and publishing code. Each supports pause, replay, manual steps and keyboard controls.
Only the visible scene runs; pause animation offscreen and in hidden tabs. Respect reduced
motion with stable states and optional manual navigation.

Application motion should help identify selection or state changes without delaying review.
Do not transfer the website's decorative animation into application conversations.
