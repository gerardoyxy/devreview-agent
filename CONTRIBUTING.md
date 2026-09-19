# Contributing

Thanks for helping improve the feedback-to-fix loop.

Use Node.js 24.15+ and Git. No dependency installation or build is required:

```bash
npm run check
npm test
npm run demo
```

For a small fix, open a pull request with the problem, resulting behavior, and
validation. For larger changes, discuss the design in an issue first. Keep UI
strings and documentation clear about experimental or simulated features.

Tests create disposable Git repositories and deterministic adapters. Never make
the default suite depend on provider credentials or live model calls. Add focused
regression coverage for lifecycle, Git safety, process cancellation and API changes.

Do not commit tokens, `.env` files, `.nudgethis/`, generated worktrees, or personal
Git configuration. Avoid dependencies unless their benefit justifies them.

This project uses the MIT license. By contributing, you agree that your contribution
will be distributed under the same license.
