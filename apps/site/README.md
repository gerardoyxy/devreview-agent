# NudgeThis website

Source for [nudgethis.click](https://nudgethis.click/), including product demos,
download links and the FAQ. The demos are illustrative; they do not connect to
a local application or invoke agents.

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
JavaScript adds a locally remembered light/dark choice and interactive product demos.
Asset URLs are relative to support a custom domain or a GitHub project subpath.

## Profile introductions

The hero offers three profiles: starting from an idea, building with AI and writing code.
Each selection changes the introduction and shows its own animated workflow. The demos
use native HTML/CSS and TypeScript animation controllers.

Pause, Play, Replay and individual step controls work with keyboard and touch. Manual
step selection pauses autoplay. All animation freezes when paused, offscreen or in a
hidden tab. Reduced-motion preferences and disabled JavaScript show static illustrations;
with JavaScript, visitors can still inspect steps manually.

## Design and assets

The blue design system is shared with the application. The landing
uses a 45/55 split hero, large Archivo lettering, fine borders, and a connected browser
and conversation example. The application adapts the same identity to compact working UI.
See [the design system](../../DESIGN.md).

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

## Social preview

Open Graph and X cards use `public/assets/social-preview.png`, a 1200 × 630 image.
Its editable source is `assets/brand/social-preview.html` at the repository root.
After editing the artwork, run `node scripts/render-social-preview.js` with Playwright's
Chromium installed, or set `NUDGETHIS_BROWSER_PATH` to a local Chromium executable.
Commit the updated PNG with the artwork. Normal site builds copy it without a browser.
Keep the absolute image URLs, dimensions and alternative text in `public/index.html`
aligned with the asset.

## Deployment

The Landing workflow builds matching pull requests and pushes to `main`.
Once the release linked by the website is published, `main` deploys `dist/site` to
GitHub Pages through the branch-restricted `github-pages` environment. A manual
workflow run on `main` can rebuild the site after release publication.
The production domain is `nudgethis.click`. See [deployment instructions](../../docs/landing.md).
