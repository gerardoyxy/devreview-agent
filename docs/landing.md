# Publish the NudgeThis landing on GitHub Pages

NudgeThis has a static landing and a separate local Rust application. GitHub
Pages hosts only the landing. The user owns **nudgethis.click at Namecheap**.
The personal repository is `gerardoyxy/devreview-agent`; do not switch or reuse
`hejoirsys` authentication for this project.

## Current status

The blue landing is published at **https://nudgethis.click/**. The `Landing`
workflow builds a review artifact for matching pushes and pull requests, and
publishes `dist/site` only on pushes to `feat/typescript-rust-agent-runtime`.
The `github-pages` environment is restricted to that branch.

On September 19, 2026, GitHub validated the apex and `www` DNS records, approved
a certificate for both names, and HTTPS enforcement was enabled. The HTTPS
landing returned HTTP 200; HTTPS `www` redirected to the apex. Namecheap remains
the DNS provider, using `dns1.registrar-servers.com` and
`dns2.registrar-servers.com`. The records below describe the active setup.

## Build and review

```sh
npm ci
npm run build:site
```

The publish directory is `dist/site`. Relative asset paths support both the
GitHub project address and the custom domain. Do not run the full Rust build for
hosting the static landing.

Before publishing, review the redesigned landing at desktop and mobile widths,
including light/dark mode, keyboard interactions, and links. Keep the existing
draft pull request separate from a decision to merge into `main`.

## GitHub configuration

1. In the personal repository's **Settings → Pages**, choose **GitHub Actions**
   as the build source.
2. Use a Pages workflow to upload `dist/site` with `actions/upload-pages-artifact`
   and deploy it with `actions/deploy-pages`. Only the explicitly selected
   production branch should deploy; pull requests should only build.
3. After a successful Pages deployment, set **Custom domain** to
   `nudgethis.click` in the same repository. GitHub recommends verifying domain
   ownership in the personal account's Pages settings first; use the exact TXT
   record GitHub supplies rather than inventing a verification value.
4. Add the custom domain in GitHub **before** changing the Namecheap DNS records.
   A `CNAME` file is not required when publishing through GitHub Actions.

## Namecheap DNS values

Keep Namecheap BasicDNS. In **Domain List → Manage → Advanced DNS → Host
Records**, replace only the parking/redirect records for `@` and `www` with:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A Record | `@` | `185.199.108.153` | Automatic |
| A Record | `@` | `185.199.109.153` | Automatic |
| A Record | `@` | `185.199.110.153` | Automatic |
| A Record | `@` | `185.199.111.153` | Automatic |
| CNAME Record | `www` | `gerardoyxy.github.io` | Automatic |

The CNAME target has no `https://` prefix and no repository path. Preserve mail
and unrelated records. Do not add these records until the domain is associated
with the correct GitHub Pages repository.

When DNS and GitHub's certificate are ready, enable **Enforce HTTPS**. Verify
`https://nudgethis.click/`, the `www` redirect, and all assets before announcing
publication. GitHub notes that DNS and HTTPS activation can take up to 24 hours.

This project does not have access to the user's Namecheap session. No registrar
password or API key belongs in this repository or in chat.

## After the migration is merged

Update the Landing workflow deployment conditions and the `github-pages`
environment branch policy to `main`. Also update the landing's source/setup
links, which currently target `feat/typescript-rust-agent-runtime`. Keep the
canonical URL as `https://nudgethis.click/` once that is the deployed domain.

Sources:
- [GitHub custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub custom domains and DNS values](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Namecheap: connecting a domain to GitHub Pages](https://www.namecheap.com/support/knowledgebase/article.aspx/9645/2208/how-do-i-link-my-domain-to-github-pages/)
