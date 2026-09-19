NudgeThis 0.6.0-alpha.1 adds multiple-element selection and area selection for shared visual changes.

- **Select multiple** adds or removes controls with clicks or taps. A configurable extra
  modifier works with existing mouse and keyboard shortcuts.
- **Select area** adds visible elements inside a dragged rectangle, including touch input.
  Nested control contents and ancestor containers are collapsed to avoid redundant targets.
- **Review selection** shows numbered targets and lets you remove any before describing
  one change for the group. **Add more elements** preserves the request while you keep picking.
- Groups stay attached to drafts, conversations and historical revisions. Review, My Style
  and Copy context include the group. Changed or ambiguous targets require reselection or removal.
- Existing single-element integrations and saved selection preferences remain supported.
- The website adds a branded social preview image and simplified page title.

Groups are limited to 20 unique elements from one page and 48 KiB of minimized context.
Area discovery inspects up to 5,000 elements in the visible viewport; it does not enter
iframe contents or shadow roots. An oversized selection is rejected rather than silently
reduced. Source hints remain unverified and private-content capture rules still apply.

Application checks cover API validation, persistence and historical group context,
clipboard minimization, gesture isolation, stale targets, desktop selection and Chromium
touch emulation. These checks run with execution disabled, without agents or models.

Archives include the native application, portable launcher, embedded frontend, license,
build metadata and installation guide. Verify downloads against `SHA256SUMS.txt`.
This remains an unsigned, unnotarized alpha with no automatic updater. The welcome starts
agents disabled; configuring a real coding agent still requires local setup and a terminal.
Worktrees are not OS sandboxes. Browser emulation is not physical-device or Safari coverage.

See [selection controls](https://github.com/gerardoyxy/nudgethis/blob/main/docs/selection-controls.md)
and [installation](https://github.com/gerardoyxy/nudgethis/blob/main/docs/install.md).
