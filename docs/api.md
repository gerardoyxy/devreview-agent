# Local API

The server binds to `127.0.0.1:7331` by default. Every `/api/` endpoint requires
`Authorization: Bearer <local-token>`. The token lives in ignored `.devreview/token`.
Browser calls must also use an explicitly allowed loopback Origin.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/status` | Branch, HEAD, configured agents, executionEnabled, setup/validation commands |
| GET | `/api/diagnostics` | Read-only framework, package-manager and executable availability report |
| GET | `/api/device-preview` | Browser availability, fixed profiles and the last opened device session |
| POST | `/api/device-preview` | Explicitly open/configure or close the owned Chromium browser |
| GET | `/api/tasks` | Task summaries, newest first |
| POST | `/api/tasks` | Create a draft or enqueue; returns 202 |
| GET | `/api/tasks/QA-1` | Context, patch, validation, messages, activity, revision summaries |
| POST | `/api/tasks/QA-1/messages` | Send a follow-up; returns 202 |
| GET | `/api/tasks/QA-1/revisions/1` | Historical patch, validation and context snapshot for version 1 |
| POST | `/api/tasks/QA-1/draft` | Edit a draft with version checking |
| POST | `/api/tasks/QA-1/start` | Queue a saved draft when execution is enabled |
| POST | `/api/tasks/QA-1/undo` | Undo an applied patch if affected files are unchanged |
| POST | `/api/tasks/QA-1/apply` | Apply a ready patch to the active working tree |
| POST | `/api/tasks/QA-1/reject` | Reject and remove the worktree |
| POST | `/api/tasks/QA-1/retry` | Discard old worktree and retry from the current workspace |
| POST | `/api/tasks/QA-1/cancel` | Cancel pending or active work |
| DELETE | `/api/tasks/QA-1` | Delete an inactive, unapplied task and worktree |
| GET | `/api/project-context` | Project instructions, skills and reference documents |
| POST | `/api/project-context` | Validate and replace the project context library |
| GET | `/api/events` | SSE events named `connected`, `task`, `appearance`, `project-context` and `route-review` |

Use `Content-Type: application/json` for POST, and `{}` for actions. A task body (optional `agent` selects a configured ID):

```json
{
  "agent": "codex",
  "request": "Align the button right on desktop and full width on mobile.",
  "context": {
    "url": "http://localhost:5173/team",
    "tagName": "button",
    "selector": "[data-testid=add-teammate]",
    "text": "Add teammate",
    "viewport": { "width": 1440, "height": 900 },
    "boundingBox": { "x": 24, "y": 200, "width": 160, "height": 40 }
  }
}
```

URLs are stripped of credentials, query strings and fragments. Extra fields are
ignored; the server does not accept executable commands or a repository root from task bodies.
Optional `references` are safe relative file hints, not an allowlist or file-reading request.
Payloads are limited to 32 KB. A conflict or invalid lifecycle action returns 409.

SSE uses `fetch` with the authorization header, rather than putting a token in
an EventSource URL. Reconnect clients should refetch `/api/tasks`; SSE is an update
notification stream, not a durable event log.

## Conversations

Send `{ "content": "Keep the alignment, but round the corners." }` to the messages
endpoint. Content must contain 1–8000 characters. The server assigns the `user`
role; clients cannot inject assistant messages. A running turn or unresolved
conflict returns 409 without storing the attempted message.

Actions and messages also accept `attempt`, the version displayed by the client.
The in-page modal and dashboard send this value so a stale review cannot apply or
discard a newer version. A mismatch returns 409. CLI commands without this field
act on the latest version by task ID.

Agent replies cause a `task` SSE notification immediately, even before execution
finishes. Refetch the full task to read messages. A reply without any patch enters
`awaiting_feedback` and can accept another message. Existing tasks from the first
alpha retain their original request and latest available patch during migration;
earlier replies that were never stored cannot be reconstructed.

Each historical revision includes its attempt number, status, diff, files,
validation results, base commit/branch and timestamp. Historical revisions are
read-only. There is no endpoint that applies an obsolete revision.

## Project context

`GET /api/project-context` returns `{ "version": 1, "revision": 0, "items": [] }`
for a new repository. Save the complete library with its last-read `revision`:

```json
{
  "version": 1,
  "revision": 0,
  "items": [{
    "id": "project-rules",
    "kind": "instruction",
    "title": "Project rules",
    "content": "Keep product copy in English.",
    "source": "",
    "default": true
  }]
}
```

Kinds are `instruction`, `skill` and `document`. IDs are unique lowercase identifiers,
starting with a letter, using letters/digits/underscores/hyphens, up to 64 characters.
The server assigns item `revision` and `updatedAt`; unchanged items retain them.
A stale library revision returns 409 without overwriting another window's save.
Saving publishes a `project-context` SSE event containing only the library revision.

Limits: 32 items, 16 KiB of UTF-8 text per item, title 120 characters, source label 180
characters, serialized library 128 KiB, serialized task snapshot 48 KiB. The save route
accepts HTTP bodies up to 256 KiB before normalization. Defaults must fit the snapshot
budget. `source` is only a label, never a filesystem path to read or a URL to fetch.

Creation accepts optional `contextIds: ["project-rules"]`; omission selects defaults,
while `[]` selects nothing. On follow-up, omitted IDs retain the exact previous
snapshot; explicit IDs resolve the latest saved library. Missing IDs return 400 and an
oversized selection returns 413 before storing a task or advancing its conversation.
Retry retains the previous snapshot even if library items have since been deleted.

Full tasks and historical revisions contain `projectContext` with `version`,
`libraryRevision`, `capturedAt` and complete selected `items`. Legacy revisions may
have no snapshot. List/SSE task summaries and revision summaries omit attachment text;
fetch the individual task or revision to inspect it. Client-supplied snapshots are ignored.

The common agent prompt distinguishes user-selected instructions/skills from reference
material. This is a prompt boundary, not an execution sandbox or a guarantee of provider
compliance. Importing a skill's text does not install tools, scripts or referenced assets.

## My Style

`GET /api/my-style` returns `{version:1,revision,profiles,activeId,dismissed,suggestions,guides}`.
Suggestions and Markdown guides are computed locally. `POST /api/my-style` accepts the
last-read `revision`, `action`, and fields below (64 KiB body limit):

| action | Fields |
| --- | --- |
| `save` | `profile`: ID beginning `style-`, name, direction, matching branch, tokens, rules, notes |
| `import` | `profile` with a new ID; imported evidence is discarded |
| `publish` | `profileId`; refresh its generated Project context instruction |
| `activate` | `profileId`; publish and use for new changes by default |
| `deactivate` | Clear the default style; retain profiles and context history |
| `delete` | `profileId`; remove the profile and generated context item |
| `accept` | `profileId`, `suggestionId`, explicit `scope`; recheck current applied evidence |
| `dismiss` | `suggestionId` |
| `reset-dismissed` | Show dismissed patterns again |

Scope is `global`, `buttons`, `inputs`, `headings`, or `surfaces`. Server-generated profile
versions and rule evidence cannot be forged by imports. Stale revision/evidence returns 409;
invalid preferences return 400. Profile and Project context changes commit atomically and
emit `my-style` and, when changed, `project-context` revision events. Open/reload the editor
to fetch current values; open unsaved drafts are not overwritten by events.

Applying a profile is a UI flow: publish it, then create an ordinary frontend draft/request
with its `my-<profileId>` in `contextIds`. The API does not directly execute a style operation.
See [My Style](my-style.md) for the builder, evidence boundaries, export format and limits.

## Agent registry

`GET /api/status` includes `agents`: configured IDs, display labels, transport names
and current integration capabilities (`automatic`, `streaming`, `resume`, `images`).
Executable paths and arguments are not returned. These are configured integrations,
not proof that a provider is installed or authenticated.

Task creation accepts an optional `agent` ID. An unknown ID returns 400 before a
task is stored. Omission uses `defaultAgent`. The choice is persisted on the task
and retained by follow-ups. The browser cannot provide commands or switch the
provider of an existing conversation. Runtime protocol versions are independent of
this temporary HTTP API; see [agents](agents.md).

## Appearance and shutdown

`GET /api/appearance` returns the saved appearance document or `null` for defaults.
`POST /api/appearance` validates and saves a version-1 theme, then broadcasts `appearance`
with that document. Both require the same token/Origin checks as task APIs. Appearance
payloads have a separate 2 MiB limit; uploaded WOFF/WOFF2 data totals at most 1 MiB.
See [appearance schema](appearance.md). No uploaded-font URL is exposed without authentication.
Clients refetch preferences after reconnecting. The last save wins; unsaved local previews
are not broadcast. No account-level or cross-repository synchronization is provided.

`POST /api/shutdown` with `{}` stops the server and cancels active agents. The Rust CLI's
`stop` command uses it. `GET /api/status` additionally reports `runtime: "rust"`.

## Drafts and execution control

Creation accepts `kind` (`frontend`, `backend`, `tests`, `documentation`, `general`),
`draft: true` and up to 32 `references`. Element `context` is optional. Requests are limited
to 8000 characters. Drafts do not snapshot source, create worktrees or execute anything.
POST `/api/tasks/QA-1/draft` accepts the same fields plus `attempt`; it records the previous
version and increments the draft attempt. POST `/start` captures the current workspace.
Execution-disabled servers return 403 for execution, start, follow-up and retry requests.

`validationStatus` is `not_run`, `not_configured`, `running`, `passed` or `failed`.
`setupChecks` records preparation separately. An empty check list never implies a pass.
Applied tasks include an `undo` before/after record; older tasks may not have one.
Interrupted Apply/Undo becomes `recovery_required`. See [recovery](recovery.md).

## Route review

GET `/api/route-review` returns `{version:1,revision:0,origin:"",routes:[],...}` initially.
POST accepts the last-read `revision` and one operation:

| action | Fields |
| --- | --- |
| `scan` | `origin`: exact configured loopback origin; starts a fresh checklist |
| `add` | `path`: concrete URL path without query or fragment |
| `resolve` | `id`, `path`: map a route candidate to a real URL |
| `remove` | `id`: exclude a route from coverage |
| `review` | `id`, `viewport` (`desktop`/`mobile`), `status` (`pending`/`reviewed`/`blocked`), `width`, optional `note` |

Review notes are limited to 2000 characters; blocked records require a reason. Reviewed
records require a concrete path and a width of 320–480 px for mobile or 1024–2560 px for
desktop. The server records time and `method: manual-browser-review`. It validates record
shape and width, not the truth of a human review. Stale revisions return 409. The selected
origin is never fetched by Rust; the browser loads the preview. [Coverage semantics](route-review.md).

To confirm an emulated device view, send `method: "device"` and the current `sessionId`
with the review request. The server verifies the live browser session, matching URL and
Desktop/Mobile category, and completed document load. It obtains width/settings from its
owned session, allowing landscape and tablet widths. It records `method: "manual-device-emulation"`
and a `device` evidence object. Client-supplied evidence is ignored. This verifies the
browser context; the user still judges page correctness. Old sessions and redirected or
closed tabs return 409. Requests with no method or `method: "embedded"` retain layout-only
manual review behavior for existing clients.

## Device preview

GET reports `available`, `browser`, `profiles` and nullable `session`. It never starts a
browser. `doctor`/diagnostics also include metadata-only `deviceBrowser` availability.

POST accepts either `{ "action": "close" }` or:

```json
{
  "action": "open",
  "origin": "http://localhost:3000",
  "path": "/settings",
  "profile": "phone",
  "orientation": "portrait"
}
```

Profiles are `phone-small`, `phone`, `phone-large`, `tablet` and `desktop`. Orientation is
`portrait` or `landscape`; desktop is always landscape. The origin must be an explicitly
allowed loopback origin and the path must be concrete without query/fragment. The body
limit is 4 KiB. Only one owned browser session exists per repository server; opening again
updates its tab and generates a fresh session ID. The API accepts no executable, arbitrary
browser arguments, script, CDP command, external debugging endpoint or user profile.

These endpoints remain available with agent execution disabled. Opening explicitly launches
a browser, never an agent or project command. Close and graceful server shutdown stop the
owned process and clean its temporary profile. See [device browser](route-review.md#device-browser).
