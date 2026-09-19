# Publish the NudgeThis landing

The landing is a static website. Keep the code on `gerardoyxy/nudgethis`
and serve the built files using Cloudflare Pages Free or GitHub Pages Free.
The local Rust app and agent processes continue to run on users' computers.

No domain has been purchased or connected by this project. `nudgethis.click`
is a candidate, and `nudgethis.pages.dev` is only a proposed project address:
Cloudflare assigns the actual available subdomain when a project is created.

## Cloudflare Pages with GitHub

1. In your **personal Cloudflare account**, open **Workers & Pages**, create an
   application, select **Pages**, then import a Git repository.
2. Authorize the GitHub integration for **gerardoyxy**, using **Only select
   repositories** and selecting **nudgethis**. Keep `hejoirsys` outside
   this installation.
3. Use these build settings:

   | Setting | Value |
   | --- | --- |
   | Project name | `nudgethis`, if available |
   | Framework preset | None |
   | Production branch | `feat/typescript-rust-agent-runtime` while this work is in draft |
   | Root directory | Repository root |
   | Build command | `npm run build:site` |
   | Build output directory | `dist/site` |
   | Environment variable | `NODE_VERSION=24.21.0` |

   Pages installs dependencies from the lockfile before the build. Do **not** use
   `npm run build`: that command builds the local Rust application.
4. Deploy. Use the `*.pages.dev` address assigned by Cloudflare. Later pushes to
   the selected branch update the site through the Git integration.
5. After the Rust/landing pull request is merged, set the Pages production branch
   to `main` and update the site's explicit GitHub branch links to `main`.

The Free plan currently includes 500 builds per month. The project needs no
Workers, Functions, D1, R2, paid hosting, or paid analytics.

Sources, checked September 2026:
[static sites](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/),
[GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/),
[Free plan limits](https://developers.cloudflare.com/pages/platform/limits/).

## Add a domain later

For an apex domain such as `nudgethis.click`:

1. Register the available domain with your preferred registrar.
2. Add it to the same Cloudflare account as a zone on the Free plan.
3. At the registrar, use the exact Cloudflare nameservers assigned to that zone.
   This changes DNS hosting, not the registrar where you own the domain.
4. In the Pages project, select **Custom domains**, then **Set up a domain**.
5. Add the apex domain, allow Cloudflare to create its DNS record, and wait for
   DNS and certificate activation. Add `www` through the same Pages flow if wanted.

If you prefer to keep the registrar's DNS, a subdomain such as
`www.nudgethis.click` can instead use a CNAME pointing to the assigned
`<project>.pages.dev` address. Associate the subdomain with the Pages project
**before** adding the DNS record. Apex domains on Pages require Cloudflare DNS.
Preserve any existing mail or other service records when moving a used domain.

After choosing the permanent address, add canonical and `og:url` metadata to
`apps/site/public/index.html`. They are intentionally absent while ownership and
the published URL are undecided.

[Cloudflare custom-domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## GitHub Pages alternative

GitHub Pages supports a free static project site from this public repository,
including a custom domain and HTTPS. Build with `npm run build:site`, then publish
`dist/site` using a GitHub Pages deployment workflow. The included `Landing`
workflow **only builds and uploads a reviewable artifact**; it does not activate
hosting or change a domain.

Keep the Pages project under `gerardoyxy`. The same relative asset URLs also work
under a project path such as `/nudgethis/`.

[GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages),
[custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site),
[HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).
