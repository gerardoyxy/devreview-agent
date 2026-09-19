# NudgeThis landing

An English static landing for the NudgeThis brand. The application and repository
still use the NudgeThis name. This site does not rename CLI commands, connect to a
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

The existing landing identity remains while the replacement visual direction is
being selected. The browser demonstration follows Impeccable's motion guidance.

- The hero contains a native HTML/CSS example page and conversation, not an iframe.
- A TypeScript controller advances through Point, Describe, Review, and Apply.
  The selected button changes color and corners only at Apply.
- Autoplay runs once for 13 seconds. Pause, Play, Replay, and individual step
  controls work with keyboard and touch. The animation clock stops offscreen or
  when the browser tab is hidden.
- Reduced-motion preferences and disabled JavaScript show the final static
  illustration. With JavaScript, visitors can still inspect steps manually.
- The demo is labeled illustrative and makes no agent, API, or localhost requests.
- Self-hosted DM Sans, 400 and 700; see `public/assets/FONT-LICENSE.txt` (OFL).
- `history.png` is a real screenshot of the deterministic Rust demo, showing the
  current alpha and previous product name. The hero example is authored HTML.
- The small `n` favicon is a geometric monogram.

The font files were sourced from `@fontsource/dm-sans`; they are vendored with their
license so production visitors do not contact a font service.

See [publication instructions](../../docs/landing.md) for GitHub Pages with the Namecheap domain.
