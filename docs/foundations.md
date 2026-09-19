# Application foundations and evidence

This is a capability and evidence map, not a production-readiness certification. Source
inspection, application tests, browser checks and real provider checks answer different
questions. The default tests never run agents or models.

| Foundation | Implemented and checked | Remaining boundary |
| --- | --- | --- |
| Start with an existing project | Portable native builds; `init` preserves configuration; `doctor` inspects frameworks, package managers, commands and browser availability without executing them. | A guided first-run wizard is missing. The user starts the development server, reviews suggested commands/origins and enables the overlay. Detection does not prove a framework integration. |
| Explain a change without UI vocabulary | Element/parent/child/sibling selection, free-text requests, general/backend tasks and optional file references. Browser checks exercise selection and draft creation. | No direct drag-to-resize editor or verified DOM-to-source mapping. Ambiguous selectors require reselection. |
| Keep work and context | SQLite drafts, version history, conversation records, project instructions/documents and custom appearance. Application tests cover restart persistence and stale versions. | This is local state, not cloud backup. Deleting an item does not erase earlier task snapshots. Review-session import/export and retention controls are incomplete. |
| Protect existing code | Private source snapshots, affected-file conflict checks, explicit Apply, guarded Undo and interrupted-mutation records. Tests cover unrelated edits, conflicts, binary files, CRLF, private paths and symlinks. | Worktrees are not OS sandboxes. Interrupted mutation recovery still needs a human; there is no universal rollback of external commands, databases or side effects. |
| Distinguish a checked result | Separate setup/validation results; an empty command list stays visibly unchecked. Execution-disabled mode is tested independently of providers. | Project-specific tests must be configured. A ready patch does not prove that the application works or looks right. Agent execution, cancellation and provider compatibility need separate authorized evidence. |
| Review routes and device views | Bounded route inventory, concrete dynamic URLs, desktop/mobile records, blockers, notes and exports. Chromium device tests cover touch, DPR, rotation, desktop reset, redirects, stale sessions and owned browser cleanup. | Discovery is not exhaustive. Progress counts explicit human review and becomes stale after code changes. One mobile record covers one saved profile/orientation; it is not coverage of every device. |
| Handle failures and concurrent changes | Request timeouts, SSE reconnect, draft version checks and route revision conflicts. Missing/closed device browsers, redirects and incomplete loads cannot certify device review. | Cross-origin embedded frames cannot reliably report failures. There is no automatic recovery for every crash or lost browser input; save drafts before leaving. |
| Access and privacy | Loopback binding, Host/Origin checks, token authentication, minimized DOM context and trusted-configuration-only executables. API tests include unauthorized and unsafe inputs. | The local account and project remain trusted. No remote collaboration, public API hosting, exhaustive secret scan or authentication against external providers is certified. |
| Usable interfaces | Shared theme controls, keyboard-operated dialogs/tabs, responsive layouts and bounded Chromium accessibility/browser checks. | Automated checks are not complete accessibility certification. Screen-reader sessions, physical touch devices, Safari and Firefox need their own coverage. |
| Distribution | Cross-platform build/test workflows and unsigned preview archives with checksums. | Native installers, signing/notarization, automatic updates and broad clean-machine installation checks remain pending. |

## Priority before calling the basics complete

1. Guide the first successful project connection: prerequisites, running origin, overlay,
   saved draft and a clear explanation of configured validation.
2. Maintain real application fixtures for React, Vue, Angular and the supported file routers,
   including login, nested/dynamic routes, HMR, iframe restrictions and long/empty content.
3. Make backup, retention and interrupted Apply/Undo recovery easier without overwriting work.
4. Expand browser, keyboard and assistive-technology evidence, and clean-machine installation
   coverage. Provider end-to-end checks remain a separate, explicitly authorized workstream.

See [route review](route-review.md), [recovery](recovery.md), [installation](install.md),
[security](../SECURITY.md) and the [roadmap](../ROADMAP.md) for the exact current limits.
