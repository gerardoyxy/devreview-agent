# Contributing

Thanks for helping improve the feedback-to-fix loop.

Use Node.js 24.15+, Git and stable Rust. Build the TypeScript frontend and native
agent runtime before testing:

```bash
npm ci
npm run build
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked -p nudgethis --bin nudgethis
npm run check
npm test
```

For a small fix, open a pull request with the problem, resulting behavior, and
validation. For larger changes, discuss the design in an issue first. Keep UI
strings and documentation clear about experimental or simulated features.
Write public documentation, UI strings and marketing copy in English.

Default tests create disposable Git repositories and run the application with execution
disabled. They never launch agent executables, fixture agents or models. `npm test` runs
only `*.safe.test.js`; Rust tests target the `nudgethis` binary. Integration fixtures are
separate: `NUDGETHIS_ALLOW_AGENT_TESTS=1 npm run test:agents` is an explicit opt-in outside
default CI. Do not run it when agent tests are prohibited. Never make the default suite
depend on provider credentials or live model calls. Add focused
regression coverage for lifecycle, Git safety, process cancellation and API changes.

Do not commit tokens, `.env` files, `.nudgethis/`, generated worktrees, or personal
Git configuration. Avoid dependencies unless their benefit justifies them.

Keep public documentation focused on reproducible setup, behavior, limitations and
contribution guidance. Personal briefs, account instructions, design-tool sessions
and downloaded agent skills belong outside the tracked product source. Maintain
the [roadmap](ROADMAP.md) when a capability or release requirement changes.

This project uses the MIT license. By contributing, you agree that your contribution
will be distributed under the same license.
