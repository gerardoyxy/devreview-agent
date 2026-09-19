# Route review

Open **Route review** in the dashboard, or **Routes** in the overlay. Enter the exact
origin of your running local application and choose **Scan routes**. The origin must
appear in `server.allowedOrigins`. NudgeThis reads source files; it does not start your
development server, run package scripts or contact an agent.

Discovery recognizes common file routes in Next.js `app`/`pages`, Nuxt/Vue/Astro `pages`,
SvelteKit `src/routes`, and literal `path` declarations used by React/Vue/Angular routers.
It is a candidate inventory, not a framework compiler or exhaustive runtime crawl.
Dynamic parameters, relative nested routes, generated routes, router base paths and
authentication may require adjustment. Source hints remain unverified.

Use **Add a missing route** for URLs the scan missed. Resolve a dynamic pattern such
as `/products/[id]` to a real path such as `/products/42`. Add extra concrete URLs
separately to review multiple data cases. **Exclude route** removes false positives
from the checklist and denominator. No source files are changed by these controls.

## Desktop and mobile

The preview embeds your application in a browser frame. Switch between **Desktop**
(1024–1920 px presets) and **Mobile** (320–480 px presets); the default widths are
1440 and 390 px. Fit preview scales the frame visually while retaining its chosen
layout width. Turn it off to inspect at actual size and scroll the preview.

**Embedded layout** exercises CSS media queries and the layout viewport. It does not
emulate touch, user agent or device pixel ratio. **Device browser**, described below,
adds those Chromium emulation controls in a separate browser window. Login
requirements, redirects and frame restrictions may prevent an embedded preview.
NudgeThis cannot reliably identify cross-origin frame errors or confirm a rendered
route; verify the URL/content yourself and record blockers honestly.

Each route has separate desktop and mobile records: `pending`, `reviewed` or `blocked`.
Loading a route never marks it reviewed. After checking the requested page at the selected
width, confirm the checkbox and choose **Mark desktop/mobile reviewed**. Record a reason
when marking a view blocked. Notes retain their draft text when switching views.

Progress is `reviewed viewports / (included routes × 2)`. A route is complete only when
both viewports are reviewed. Blocked views remain incomplete. **Next pending view**
walks the remaining checklist; filters show incomplete, completed, blocked or unresolved
routes. Coverage records a point in time, not continuous monitoring: rescan after code
changes to start a fresh checklist. Export the current report first to preserve it.

**Create change** opens a task composer carrying the route, viewport and notes. You can
save a draft without execution or start the configured agent when execution is enabled.
**Export report** downloads JSON with source candidates, checks, notes, timestamps,
widths and the Git HEAD recorded at scan time. This records manual review, not automated
visual correctness or provider compatibility.

Records persist in local SQLite. Concurrent saves use a revision number; a stale window
must reopen Route review before saving. Scans skip ignored/generated/private paths,
symlinks, source files over 256 KiB and literal scanning beyond 3000 source files. A
checklist is limited to 1000 routes. No DOM screenshots or image uploads are collected.

## Device browser

Choose **Device browser** under **Preview**, then choose Desktop or Mobile. Mobile offers
generic small-phone (360 × 800, DPR 3), phone (390 × 844, DPR 3), large-phone
(430 × 932, DPR 3) and tablet (768 × 1024, DPR 2) profiles. Rotate between portrait and
landscape; **Open device browser** applies the selected settings and navigates to the
selected route. Choosing Desktop and opening it restores 1440 × 900, DPR 1, mouse input
and the original desktop user agent. Changing a control alone does not change the open tab.

NudgeThis controls an installed Chrome, Edge or Chromium through the Chrome DevTools
Protocol from Rust. It does not require Node, ChromeDriver, an extension or an agent at
runtime. Mobile settings include device metrics, screen orientation, touch capabilities,
mouse-to-touch emulation, an Android user agent and matching client hints. Tablet client
hints use the Android tablet convention (`mobile: false`) while retaining touch/mobile
layout. These are generic Chromium profiles, not claims of exact named-phone compatibility.

The browser uses a new temporary profile inside ignored `.nudgethis/`. Existing browser
tabs, accounts and profiles are not attached to or changed. Login/local storage persist
while this device session stays open, including when changing route or device settings.
Sign in to the local application in this window if necessary. **Close device browser**
or a graceful server shutdown ends the owned process and removes its temporary profile.
Closing the Route review dialog leaves the device browser open so you can keep inspecting.
An abrupt process/OS crash can leave a `browser-*` directory; only remove it after confirming
its browser process has stopped. The application does not bulk-delete old browser profiles.

Before counting a device review, the server checks the current session/settings, the main
frame URL and completion of document loading. Redirects, closed windows, stale sessions or
the wrong Desktop/Mobile category return an error. HTTP/application errors still require
human judgment: a loaded document is not proof of a correct page. The record includes
`method: manual-device-emulation`, configured dimensions/DPR/orientation, browser version
and observed layout dimensions, touch capabilities and pointer media query. Missing viewport
metadata or overflowing content can make observed dimensions differ from the configured
screen. Query strings and fragments are not included in the review evidence.

There is one desktop and one mobile record per route. Reviewing another mobile profile
replaces the mobile record; it does not claim every device/orientation has been reviewed.
Export the current report to preserve it before recording another case. Both methods still
require the review checkbox and manual confirmation. Source changes do not invalidate old
coverage automatically. Rescan when you want a fresh checklist.

### Browser setup and limitations

`nudgethis doctor` and Workspace setup report whether a supported executable was found,
without launching it. If detection fails, set `NUDGETHIS_BROWSER_PATH` in the server's
environment to an absolute Chrome/Edge/Chromium executable path, then restart NudgeThis.
The browser API cannot supply an executable, arbitrary arguments, JavaScript or CDP commands.
On Linux a graphical session is required for visible review; `NUDGETHIS_BROWSER_HEADLESS=1`
is available for automated browser checks and does not provide a visible review window.

Device preview is available with agent execution disabled. Opening it explicitly starts a
browser and runs the trusted local application's JavaScript; it never runs project setup,
validation or agent commands. Remote debugging is bound to loopback and uses only the
owned temporary profile. Do not expose that debugging port or the NudgeThis server remotely.

Emulation does not reproduce Safari/WebKit, physical hardware, real network/radio behavior,
an OS virtual keyboard, safe-area notches or every device gesture. Physical-device and
cross-engine testing remain necessary for those behaviors. No screenshot evidence is
captured automatically.
