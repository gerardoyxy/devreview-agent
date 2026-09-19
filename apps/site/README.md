# NudgeThis website

Source for [nudgethis.click](https://nudgethis.click/): product introductions, illustrative
workflow animations, download links and the FAQ. The site does not connect to the local
application or invoke agents.

## Build

From the repository root, with Node.js 24.15 or later:

```sh
npm ci
npm run build:site
```

Publish only `dist/site`. The build uses semantic HTML, CSS and TypeScript; no Rust runtime,
local database or credentials are included. Asset URLs are relative to support a custom
domain or GitHub project subpath.

Navigation and FAQ disclosures work without JavaScript. JavaScript adds a remembered
light/dark choice and three profile introductions: starting from an idea, building with
AI and writing code. Each animation supports keyboard/touch controls, pause, replay and
manual steps. Hidden/offscreen scenes pause, and reduced motion uses stable illustrations.

## Assets

The website and application share the [design guide](../../DESIGN.md).

- Archivo fonts are self-hosted; retain [their OFL license](public/assets/FONT-LICENSE.txt).
- The History image shows sample conversation data, not a live user conversation.
- The canonical [cursor-and-star SVG](../../assets/brand/nudgethis-icon.svg) supplies the
  favicon and app icons. The build also creates a 32px PNG favicon, 180px Apple touch icon
  and 192px/512px home-screen icons. The manifest opens the website in a browser; it does
  not install the local NudgeThis application.
- Open Graph and X cards use `public/assets/social-preview.png` at 1200 × 630. Edit
  [the HTML artwork](../../assets/brand/social-preview.html), then run
  `node scripts/render-social-preview.js` with Playwright's Chromium installed, or set
  `NUDGETHIS_BROWSER_PATH` to a local Chromium executable. Commit the updated PNG and keep
  image URLs, dimensions and alternative text in `public/index.html` aligned.

## Documentation and terminal installation

`scripts/build-docs.js` renders an explicit list of repository Markdown guides into
`dist/site/docs/`. Edit the source guide rather than generated HTML. Relative guide links
become site links, headings keep addressable anchors, and raw HTML is escaped. Marked is
a build dependency; the published pages need no server or client Markdown runtime.

The homepage includes installation tabs and a documentation section. Commands remain
visible without JavaScript; JavaScript adds keyboard tab navigation and copy buttons.
The documentation uses the site's theme and a collapsible mobile guide list.

`scripts/install.sh` and `scripts/install.ps1` are templates. The site build replaces
`@VERSION@` with `package.json`'s version and publishes them at the site root. They download
that version's release archive and checksum, install into the user's folder, and preserve
previous versions. See the [terminal guide](../../docs/terminal-install.md) for PATH and updates.

Run `node --test tests/installers.safe.test.js` for isolated installer checks. Browser
coverage is in `tests/documentation-browser.safe.test.js` and uses the same Chromium
environment variable as the other application checks. Neither suite runs agents or models.

## Deployment

[The Landing workflow](../../.github/workflows/site.yml) builds matching pull requests and
pushes to `main`. Pull requests produce a review artifact. Once the release linked by the
website is published, `main` deploys `dist/site` through the `github-pages` environment.
Deployment also requires the Linux, Windows and macOS installer checks to pass.
Run the workflow manually on `main` after publishing a release if deployment was skipped.

For a fork, update repository/download links, canonical metadata, social-image URLs and
the repository homepage. Configure Pages to use GitHub Actions, restrict its deployment
environment to the production branch and enable HTTPS. If using a custom domain, follow
[GitHub's domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
The workflow uses GitHub's job token and OIDC; no personal access token is needed.

See [GitHub's Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
for deployment permissions. After publishing, check HTTPS, downloads, asset loading,
social previews and responsive layout.
