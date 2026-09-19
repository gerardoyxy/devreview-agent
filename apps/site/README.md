# NudgeThis landing

An English static landing for NudgeThis. The application, CLI and repository share the same name.
The site introduces the local tool; it does not connect to a local application or invoke agents. It introduces the current alpha honestly and
links to the source alpha on `main`.

## Build

From the repository root, with Node.js 24.15 or later:

```sh
npm ci
npm run build:site
```

Publish **only `dist/site`**. The Rust runtime, local databases, configuration and
tokens are not part of the site build. No backend, cloud functions, credentials,
remote fonts, analytics script, or application install is required.

The source is semantic HTML, native CSS and strict TypeScript. Without JavaScript,
navigation and FAQ disclosures work and the site follows the system color scheme.
JavaScript adds a locally remembered light/dark choice and the scripted browser demonstration. All asset URLs are relative
to support a custom domain, a `pages.dev` address, or a GitHub project subpath.

## Design and assets

The blue design system is shared with the application. The landing
uses a 45/55 split hero, large Archivo lettering, fine borders, and a connected browser
and conversation example. The application adapts the same identity to compact working UI.
See [the design system](../../DESIGN.md).

- The hero contains a native HTML/CSS example page and conversation, not an iframe.
- A TypeScript controller advances through Point, Describe, Review, and Apply.
  The selected button gains padding and softer corners only at Apply; Review lets
  the visitor inspect first.
- Autoplay repeats a 6.5-second sequence while visible: Point (0.85s), Tell (1.25s),
  Review (1.5s), then Apply, a readable result and a smooth reset (2.9s).
  The change starts at 3.6 seconds. The branded cursor follows curved paths between
  selection, the message's send cue, review and the changed button. A traveling
  connector dot, staggered messages, typing dots, click compression, spring settling
  and a brief star accent make the sequence visible without external animation libraries.
  Pause, Play, Replay, and individual step controls work with keyboard and touch.
  Manual step selection pauses autoplay; interacting with the example runs once and
  holds the applied result. Native animation tracks and pointer motion use one clock,
  so the whole scene freezes when paused, offscreen or in a hidden tab.
- Reduced-motion preferences and disabled JavaScript show the final static
  illustration. With JavaScript, visitors can still inspect steps manually.
- The demo is labeled illustrative and makes no agent, API, or localhost requests.
- Self-hosted Archivo, 400, 700 and 900; see `public/assets/FONT-LICENSE.txt` (OFL).
- `history.png` is a real screenshot of the deterministic Rust demo, showing the
  current blue NudgeThis interface and its archived patch/context. The hero example is authored HTML.
- The favicon and visible brand icons use the canonical cursor with a four-point
  star at its tip: `assets/brand/nudgethis-icon.svg` at the repository root. The
  build copies it to `dist/site/assets/favicon.svg` and the transparent mark,
  `assets/brand/nudgethis.svg`, to `dist/site/assets/nudgethis.svg`. The moving
  demonstration pointer reuses the transparent mark's cursor-and-star geometry,
  with a white cursor outline for contrast over the example button.
- The build also renders PNGs from that SVG: a 32px favicon fallback, a 180px
  Apple touch icon, and 192px/512px home-screen icons referenced by
  `site.webmanifest`. Home-screen images have an opaque blue background so the
  device can apply its own corner treatment. The manifest opens the landing in
  the browser; the shortcut does not install the local NudgeThis runtime.

The font files were sourced from `@fontsource/archivo`; they are vendored with their
license so production visitors do not contact a font service.

See [publication instructions](../../docs/landing.md) for GitHub Pages with the Namecheap domain.

## Deployment

The Landing workflow builds matching pull requests and pushes to `main`.
Only `main` publishes `dist/site` to GitHub Pages, through the branch-restricted
`github-pages` environment. A manual workflow run on `main` can rebuild the site.
The production domain is `nudgethis.click`. See [deployment instructions](../../docs/landing.md).

## Profile introductions

The hero selects between starting from an idea, building with AI and writing code. Each
profile updates the introduction and workflow and shows a distinct illustrative sequence.
The scenes are static product examples driven by local animation clocks; no API or agent
connection is made. Hidden scenes pause, and reduced motion shows a stable final pose.
Native buttons provide keyboard selection, manual steps, pause and replay. Download links
point to the portable release and the installation guide explains unsigned builds.
