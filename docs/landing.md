# Landing deployment

The static landing is published at [nudgethis.click](https://nudgethis.click/)
from [gerardoyxy/nudgethis](https://github.com/gerardoyxy/nudgethis).
GitHub Pages serves only the landing. The Rust application runs locally and is
never included in the published directory.

## Build

With Node.js 24.15 or later:

```sh
npm ci
npm run build:site
```

Publish only `dist/site`. Its relative asset paths support a project subpath or
a custom domain. A Rust build, local database, provider credentials and access
tokens are not needed for this site.

## Production workflow

[The Landing workflow](../.github/workflows/site.yml) builds matching pull requests
and pushes to `main`. Pull requests produce a review artifact. Pushes to `main`
publish the Pages artifact through the `github-pages` environment. That environment
permits deployments from `main` only. A manual run on `main` can rebuild the site.

In repository settings, Pages uses **GitHub Actions** as its build source,
`nudgethis.click` as its custom domain and **Enforce HTTPS**. Canonical metadata
and the `www` redirect point to the apex domain.

When maintaining or forking the deployment:

1. Enable Pages with GitHub Actions and permit the production branch in the
   `github-pages` environment.
2. Configure the custom domain in Pages before changing its DNS. Follow
   [GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
   for current DNS records and domain verification.
3. Update repository links, canonical metadata and the homepage for the new owner.
4. After deployment, check HTTPS, the canonical redirect, navigation, fonts,
   screenshots, the animated demo and the mobile layout.

GitHub Actions deployments do not require a `CNAME` file. Keep credentials and
machine-specific deployment notes outside the repository. The workflow uses
GitHub's job token and OIDC; it does not require a personal access token.

See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
for the build and deployment permissions.
