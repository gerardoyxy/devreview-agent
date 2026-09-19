# Local API

The server binds to `127.0.0.1:7331` by default. Every `/api/` endpoint requires
`Authorization: Bearer <local-token>`. The token lives in ignored `.nudgethis/token`.
Browser calls must also use an explicitly allowed loopback Origin.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/status` | Branch, HEAD, adapter, workers, validation commands |
| GET | `/api/tasks` | Task summaries, newest first |
| POST | `/api/tasks` | Create and enqueue; returns 202 |
| GET | `/api/tasks/QA-1` | Full context, patch, output, validation |
| POST | `/api/tasks/QA-1/apply` | Apply a ready patch to the active working tree |
| POST | `/api/tasks/QA-1/reject` | Reject and remove the worktree |
| POST | `/api/tasks/QA-1/retry` | Discard old worktree and retry from HEAD |
| POST | `/api/tasks/QA-1/cancel` | Cancel pending or active work |
| DELETE | `/api/tasks/QA-1` | Delete an inactive, unapplied task and worktree |
| GET | `/api/events` | SSE events named `connected` and `task` |

Use `Content-Type: application/json` for POST, and `{}` for actions. A task body:

```json
{
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
