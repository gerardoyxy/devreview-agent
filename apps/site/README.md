# NudgeThis landing

An English static landing for the NudgeThis brand. The application UI shares the NudgeThis name; CLI and repository
identifiers remain DevReview. This site does not rename CLI commands, connect to a
local application, or invoke agents. It introduces the current alpha honestly and
links to the branch containing the Rust implementation.

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

The approved blue Reference desk direction is shared with the application. The landing
uses a 45/55 split hero, large Archivo lettering, fine borders, and a connected browser
and conversation example. The application adapts the same identity to compact working UI.
See [the design system](../../DESIGN.md).

- The hero contains a native HTML/CSS example page and conversation, not an iframe.
- A TypeScript controller advances through Point, Describe, Review, and Apply.
  The selected button gains padding only at Apply; Review lets the visitor inspect first.
- Autoplay runs once for 13 seconds. Pause, Play, Replay, and individual step
  controls work with keyboard and touch. The animation clock stops offscreen or
  when the browser tab is hidden.
- Reduced-motion preferences and disabled JavaScript show the final static
  illustration. With JavaScript, visitors can still inspect steps manually.
- The demo is labeled illustrative and makes no agent, API, or localhost requests.
- Self-hosted Archivo, 400, 700 and 900; see `public/assets/FONT-LICENSE.txt` (OFL).
- `history.png` is a real screenshot of the deterministic Rust demo, showing the
  current blue NudgeThis interface and its archived patch/context. The hero example is authored HTML.
- The favicon is a geometric pointer with a selection corner.

The font files were sourced from `@fontsource/archivo`; they are vendored with their
license so production visitors do not contact a font service.

See [publication instructions](../../docs/landing.md) for GitHub Pages with the Namecheap domain.

## Deployment

The Landing workflow builds every matching push/PR. Only a push to
`feat/typescript-rust-agent-runtime` publishes `dist/site` to GitHub Pages.
The `github-pages` environment permits that branch explicitly. The custom
domain is `nudgethis.click`; Namecheap DNS must point to GitHub for it to resolve.
When the migration is merged, update the workflow conditions and environment
branch policy to `main` before expecting automatic production deployments there.
