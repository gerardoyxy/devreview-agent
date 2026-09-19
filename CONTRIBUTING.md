# Contributing

For a small fix, open a pull request describing the problem, resulting behavior and
validation. Discuss larger changes in an issue first. Report security issues privately
through the process in [Security](SECURITY.md).

## Development setup

Use Node.js 24.15+, Git, stable Rust and a C compiler for bundled SQLite. From the
repository root:

```bash
npm ci
npm run build
npm run build:site
npm run check
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked -p nudgethis --bin nudgethis
npm test
```

Default tests create disposable repositories and run with agent execution disabled.
`npm test` selects `*.safe.test.js`; Rust application tests target the `nudgethis` binary.
Default checks must not depend on provider credentials or live model calls.

## Browser and starter checks

Set `NUDGETHIS_TEST_BROWSER` to an installed Chrome/Chromium executable before running
`npm test` to include browser checks. Without it, browser tests are reported as skipped.
The helpers use headless mode and temporary profiles; never use an existing browser
profile or debugging session. Linux CI runs these checks with installed Chrome.

To build and preview the maintained Astro and React starters, run:

```bash
NUDGETHIS_DISABLE_EXECUTION=1 node scripts/check-starters.js
```

This downloads the starters' npm dependencies and runs their build/preview commands
in temporary projects. It does not run agents.

Simulated agent-protocol fixtures are a separate opt-in suite:
`NUDGETHIS_ALLOW_AGENT_TESTS=1 npm run test:agents`. They are excluded from default CI
and do not verify live-provider compatibility. See [Agent transports](docs/agents.md#validation).

## Changes and documentation

Keep UI strings and public documentation in English. Describe current behavior and
limitations; update the relevant guide and [roadmap](ROADMAP.md) when features change.
Use the [design guide](DESIGN.md) for shared components, themes and accessibility.
Add focused regression coverage for behavior changes, especially Git operations,
persistence, lifecycle and API validation.

Keep tokens, `.env` files, `.nudgethis/`, generated worktrees, machine-specific settings,
private documents and local design-tool records out of commits and published assets.
Retain third-party licenses and avoid unnecessary dependencies.

Contributions are distributed under the project's [MIT license](LICENSE).
