NudgeThis 0.3.0-alpha.2 adds Chromium device emulation to route review.

- Open an owned Chrome, Edge or Chromium window from Route review, with generic phone,
  tablet and desktop profiles. Change orientation, touch, pixel density and mobile user
  agent/client hints; return to desktop with its original user agent and mouse input.
- Keep the session in a temporary profile, separate from existing browser accounts/tabs.
  Explicit close and graceful server shutdown stop the owned browser and remove its profile.
- Record device settings, browser version and observed viewport metrics with a manual review.
  Closed tabs, stale sessions, incomplete loads and redirects cannot confirm the requested view.
- Find browser availability in `doctor`/Workspace setup. Keep the embedded layout preview
  when a supported browser is unavailable. The mobile route list can collapse to show controls.
- Read the new foundation evidence map for implemented basics and outstanding first-run,
  framework, recovery, accessibility and distribution work.

Validation covers application code only: 13 Rust tests, five API/browser test cases with
execution disabled, strict TypeScript, Clippy and local Chromium UI checks at desktop and
390/320px widths. Real Chromium checks include touch input, rotation, density, user agent,
client hints, desktop reset, redirects, loading, stale sessions and browser/profile lifecycle.
Linux CI runs the browser suite; Windows/macOS CI build and test the native application.
This is not evidence of visible browser-window interaction on every operating system.
No agent, model, agent fixture or demo was exercised.

Device mode uses Chromium emulation, not Safari/WebKit or physical hardware. One mobile
record represents its saved profile/orientation, not every device. Visual approval remains
manual; source changes do not invalidate coverage automatically. Temporary profiles may
remain after an abrupt crash and require deliberate cleanup after stopping their browser.
An installed Chrome, Edge or Chromium is needed for device mode; Node/ChromeDriver are not.

Archives contain the executable with embedded frontend assets, build metadata, license and
installation instructions. Verify downloads against `SHA256SUMS.txt`. Builds remain unsigned,
not notarized and experimental. Worktrees are not OS sandboxes and provider compatibility
is not certified by these checks.

See [device browser](https://github.com/gerardoyxy/nudgethis/blob/main/docs/route-review.md#device-browser),
[foundation evidence](https://github.com/gerardoyxy/nudgethis/blob/main/docs/foundations.md) and
[installation](https://github.com/gerardoyxy/nudgethis/blob/main/docs/install.md).
