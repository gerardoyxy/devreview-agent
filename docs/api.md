# Local API

The server binds to `127.0.0.1:7331` by default. Every `/api/` endpoint requires
`Authorization: Bearer <local-token>`. The token lives in ignored `.devreview/token`.
Browser calls must also use an explicitly allowed loopback Origin.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/status` | Branch, HEAD, adapter, workers, validation commands |
| GET | `/api/tasks` | Task summaries, newest first |
| POST | `/api/tasks` | Create and enqueue; returns 202 |
| GET | `/api/tasks/QA-1` | Context, patch, validation, messages, activity, revision summaries |
| POST | `/api/tasks/QA-1/messages` | Send a follow-up; returns 202 |
| GET | `/api/tasks/QA-1/revisions/1` | Historical patch and validation for version 1 |
| POST | `/api/tasks/QA-1/apply` | Apply a ready patch to the active working tree |
| POST | `/api/tasks/QA-1/reject` | Reject and remove the worktree |
| POST | `/api/tasks/QA-1/retry` | Discard old worktree and retry from HEAD |
| POST | `/api/tasks/QA-1/cancel` | Cancel pending or active work |
| DELETE | `/api/tasks/QA-1` | Delete an inactive, unapplied task and worktree |
| GET | `/api/events` | SSE events named `connected` and `task` |

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
ignored; the server does not accept commands or repository paths from task bodies.
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
