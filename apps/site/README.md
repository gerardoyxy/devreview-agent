# NudgeThis landing

An English static landing for the NudgeThis brand. The application and repository
still use the DevReview name. This site does not rename CLI commands, connect to a
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
JavaScript adds a locally remembered light/dark choice. All asset URLs are relative
to support a custom domain, a `pages.dev` address, or a GitHub project subpath.

## Design and assets

Taste Skill design read: a calm product landing for people building with AI,
using plain language and actual product screenshots. Dials: design variance 6,
motion intensity 3, visual density 3. The existing framework-independent frontend
is retained. Native screenshot assets are used instead of fabricated product UI.

- One green accent with light/dark tokens throughout.
- Self-hosted DM Sans, 400 and 700. See `public/assets/FONT-LICENSE.txt` (OFL).
- `conversation.png` and `history.png`: real screenshots from the project's local
  deterministic Rust demo. They show the current alpha and previous product name.
- The small `n` favicon is a geometric monogram.
- Motion is limited to control feedback and respects reduced-motion settings.

The font files were sourced from `@fontsource/dm-sans`; they are vendored with their
license so production visitors do not contact a font service.

See [publication instructions](../../docs/landing.md) for Cloudflare Pages and GitHub Pages.
