NudgeThis 0.7.0-alpha.1 adds a visual Tools & elements palette for preparing changes without
writing CSS or knowing component names.

- **Tools** prepares requests for colors, sizing, spacing, corner radius, matching sizes and
  replacement text. Existing request text is preserved, including grouped selections.
- **Elements** shows six component examples. Choose a reference element and request a button,
  text block, image, card, form field or section before, after or inside it.
- Favorite tools and components appear first. Dock the palette on either side, collapse it,
  or use its My Style and review shortcuts. Browser-local preferences contain no project data.
- Compact selection icons, keyboard tab navigation, touch support and appearance tokens keep
  the workbench usable across viewport sizes and custom themes.
- The website includes terminal installers and 21 public documentation pages, including
  Windows/WSL setup and the new palette guide. Installers verify archive checksums and retain
  previous versions for rollback.

Preparing a request does not modify the page or run anything. Review the editable request,
save a draft or explicitly start a conversation, then review proposed code before applying.
Component samples illustrate intent; actual changes use your configured coding agent and
the project's own framework and conventions. This is not a drag-and-drop source editor.

Application checks cover selection isolation, draft preservation, stale targets, insertion
context, grouped requests, favorites, blocked browser storage, keyboard navigation and
Chromium mobile emulation. All run with execution disabled, without agents or models.

Archives include the native application, portable launcher, embedded frontend, license,
build metadata and installation guide. Verify downloads against `SHA256SUMS.txt`.
This remains an unsigned, unnotarized alpha with no automatic updater. The welcome starts
agents disabled; configuring a coding agent still requires local setup. Worktrees are not
OS sandboxes. Chromium emulation is not physical-device or Safari coverage.

See [Tools & elements](https://nudgethis.click/docs/tool-palette/),
[terminal installation](https://nudgethis.click/docs/terminal-install/) and
[downloads](https://nudgethis.click/#download).
