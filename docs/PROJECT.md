# DevReview Agent

> Visual QA → comment → coding agent → validated patch → apply → hot
> reload.

DevReview Agent is an open-source, local-first developer tool that turns
feedback made directly on a localhost web application into asynchronous
coding-agent tasks, without interrupting the developer's QA flow.

## The idea

Keep building new features in your normal coding-agent workflow. When
you enter QA, DevReview becomes the fast correction layer:

``` text
localhost / Docker
      ↓
right-click an element
      ↓
write a QA request
      ↓
Save
      ↓
continue reviewing immediately
      ↓
agent works in an isolated Git worktree
      ↓
validation
      ↓
Review / Apply / Reject
      ↓
active branch + hot reload
```

**Principle:** coding agents build; DevReview inspects and corrects.

DevReview is not intended to replace Codex, Claude Code, OpenCode, or
other coding-agent interfaces. Large features, architecture and major
refactors belong in those tools. DevReview is optimized for issues
discovered while testing: visual bugs, responsive problems, copy, broken
interactions, regressions and small contextual changes.

## Example

While reviewing `http://localhost:3000/admin/users`, you notice the
**Create User** button is incorrectly positioned. Right-click it and
write:

``` text
Desktop: align this button to the right.
Mobile: make it full width.
```

Saving creates a structured task such as:

``` yaml
id: QA-184
route: /admin/users
element:
  tag: button
  text: Create User
  testId: create-user
  selector: button[data-testid="create-user"]
viewport:
  width: 1440
  height: 900
request: |
  Desktop: align this button to the right.
  Mobile: make it full width.
status: pending
```

You continue QA immediately. The task runs in the background.

## Architecture

``` text
┌─────────────────────────────┐
│ Local Web App               │
│ Docker / localhost          │
└─────────────┬───────────────┘
              │ right-click
              ▼
┌─────────────────────────────┐
│ Browser Overlay             │
│ element + route + DOM       │
│ screenshot + comment        │
└─────────────┬───────────────┘
              │ Save
              ▼
┌─────────────────────────────┐
│ Local DevReview Server      │
│ API + queue + task database │
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│ Agent Orchestrator          │
└──────┬──────────────┬───────┘
       ▼              ▼
  Worktree A      Worktree B
  Agent A         Agent B
       └──────┬───────┘
              ▼
┌─────────────────────────────┐
│ Validation                  │
│ lint / types / tests / build│
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│ Review                      │
│ Apply / Reject / Retry      │
└─────────────┬───────────────┘
              ▼
        Active branch
              ↓
          hot reload
```

## Core components

### 1. Browser Overlay

A development-only package injected into the application. It should:

-   intercept a configurable context-menu action;
-   identify and highlight the selected DOM element;
-   collect route, selector, text, viewport and useful DOM context;
-   optionally capture a screenshot and element crop;
-   show a tiny comment interface;
-   submit the task;
-   display task status next to reported elements.

Possible API:

``` ts
import { DevReview } from "@devreview/overlay";

if (import.meta.env.DEV) {
  DevReview.init({ server: "http://localhost:7331" });
}
```

The overlay must never be included in production by default.

### 2. Local Server

A localhost service connecting the browser, repository, queue and
agents.

``` bash
npx devreview start
```

Suggested API:

``` text
POST   /api/tasks
GET    /api/tasks
GET    /api/tasks/:id
POST   /api/tasks/:id/apply
POST   /api/tasks/:id/reject
POST   /api/tasks/:id/retry
DELETE /api/tasks/:id
WS     /api/events
```

SQLite is sufficient for the MVP.

### 3. Task Queue

Suggested lifecycle:

``` text
pending → analyzing → working → validating → ready → applied
```

Alternative endings:

``` text
failed / rejected / cancelled / conflict
```

Creating a task must never block the developer from continuing QA.

### 4. Agent Adapter

The core should not be permanently coupled to one model/provider.

``` ts
interface CodingAgent {
  name: string;
  run(input: AgentTask): Promise<AgentResult>;
  cancel?(taskId: string): Promise<void>;
}
```

The open-source project owns task context, orchestration, Git isolation,
validation and lifecycle. Agent integrations remain replaceable.

## Git isolation

Agents should **not** concurrently modify the developer's working tree.
Give every task an isolated Git worktree:

``` text
.devreview/
  worktrees/
    QA-184/
    QA-185/
```

Conceptually:

``` bash
git worktree add .devreview/worktrees/QA-184 -b devreview/QA-184 HEAD
```

The agent edits only its worktree. DevReview records the base commit,
changed files, diff and validation result. Applying completed changes to
the active branch is serialized.

## Conflict management

Two QA requests can affect the same component. For the MVP:

1.  Tasks may execute concurrently in isolated worktrees.
2.  Applying patches to the active branch is serialized.
3.  Before apply, verify that the patch still applies cleanly.
4.  If the branch changed incompatibly, mark the task `conflict`.
5.  Retry/rebase the task against the latest state.

Later, DevReview can predict affected files and automatically serialize
or group related tasks.

## Context sent to the agent

Capture the smallest useful context, not the entire page:

``` ts
interface ElementContext {
  url: string;
  route: string;
  selector?: string;
  tagName: string;
  id?: string;
  classes?: string[];
  text?: string;
  ariaLabel?: string;
  testId?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  nearbyText?: string;
  domSnippet?: string;
  screenshot?: string;
}
```

Useful optional context includes browser console errors, failed network
requests and reproduction steps.

## Component → source mapping

A major future optimization is mapping the selected DOM element to its
source component:

``` text
DOM element
   ↓
React/Vue/Svelte component
   ↓
CreateUserButton
   ↓
src/components/users/CreateUserButton.tsx
```

Possible implementations include source maps, framework development
metadata, Vite/Babel plugins, or development-only source attributes:

``` html
<button data-devreview-source="src/components/users/CreateUserButton.tsx:41">
  Create User
</button>
```

This should be optional and implemented through framework adapters.

## Validation

An agent is not finished just because files changed. Projects define
validation commands:

``` ts
export default {
  validation: {
    commands: [
      "npm run lint",
      "npm run typecheck",
      "npm test"
    ]
  }
};
```

Future checks can include builds, Playwright, browser console checks and
visual regression tests.

## Review UX

The browser overlay can show lightweight states:

``` text
● QA-184 Working
● QA-185 Pending
● QA-186 Ready
✓ QA-183 Applied
```

A ready task might show:

``` text
QA-186 READY

Request:
"Mobile button should be full width."

Files changed:
  src/components/CreateUserButton.tsx
  src/styles/users.css

Validation:
  ✓ lint
  ✓ typecheck
  ✓ tests

[View Diff]   [Reject] [Retry] [Apply]
```

Explicit approval before applying should be the default.

## CLI

``` bash
devreview init
devreview start
devreview status
devreview tasks
devreview task QA-184
devreview apply QA-184
devreview retry QA-184
devreview cancel QA-184
```

Example configuration:

``` ts
import { defineConfig } from "@devreview/core";

export default defineConfig({
  server: { port: 7331 },
  repository: {
    root: ".",
    worktrees: ".devreview/worktrees"
  },
  workers: { maxConcurrent: 2 },
  validation: {
    commands: ["npm run lint", "npm run typecheck", "npm test"]
  },
  privacy: { screenshots: "local" }
});
```

## Suggested monorepo

``` text
devreview/
├── apps/
│   └── playground/
├── packages/
│   ├── core/
│   ├── cli/
│   ├── server/
│   ├── overlay/
│   ├── git/
│   ├── queue/
│   ├── agent-sdk/
│   ├── validation/
│   └── shared/
├── integrations/
│   ├── react/
│   ├── vue/
│   └── vite/
├── examples/
│   ├── react-vite/
│   └── docker/
├── docs/
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── LICENSE
└── README.md
```

## MVP scope

The first useful release should stay deliberately small.

**Browser:** select an element, right-click, write a comment, submit it
and see task status.

**Server:** localhost API, SQLite, queue and WebSocket/SSE status
events.

**Git:** detect repository/branch, create a worktree, generate a diff,
safely apply a patch and clean up.

**Agent:** one initial adapter with a structured task prompt and
captured output/errors.

**Validation:** configurable shell commands with success/failure
reporting.

**Review:** request, changed files, diff, Apply, Reject and Retry.

That is enough to prove the workflow before adding complex
orchestration.

## MVP user journey

``` text
1. Start application / Docker.
2. Start DevReview.
3. Open localhost.
4. Right-click a broken element.
5. Write: "The icon should be vertically centered."
6. Save.
7. Continue testing immediately.
8. QA-001 → Working.
9. Agent modifies an isolated worktree.
10. Validation runs.
11. QA-001 → Ready.
12. Review the diff.
13. Press Apply.
14. Patch reaches the active branch.
15. Existing hot reload updates localhost.
```

The primary product metric is:

> **How quickly can a developer report an issue and return to QA?**

## Local-first

Default behavior:

``` text
Source code       → local
Task database     → local
Screenshots       → local
Git worktrees     → local
Queue             → local
DevReview server  → localhost
```

Only the explicitly configured coding-agent integration communicates
externally when required. Core functionality should not require
telemetry.

## Security

Because DevReview can modify code and run validation commands:

-   bind the API to localhost by default;
-   never execute shell commands supplied by the browser comment;
-   load validation commands only from trusted repository configuration;
-   restrict filesystem access to the configured repository;
-   sanitize task IDs and paths;
-   keep screenshots local unless explicitly configured otherwise;
-   require explicit approval before applying changes by default;
-   never commit secrets;
-   keep a local audit log of relevant agent and Git operations.

## Non-goals

Initially, DevReview is not a complete IDE, project-management platform,
autonomous product manager, production monitoring system, replacement
for Git, or replacement for normal coding-agent workflows.

Keep the interaction focused:

``` text
See problem → mark problem → keep moving.
```

## Roadmap

### Phase 0 --- Proof of concept

-   browser element picker;
-   QA comment popup;
-   local task API;
-   one agent integration;
-   one Git worktree per task;
-   manual Apply.

### Phase 1 --- Usable daily tool

-   persistent SQLite queue;
-   live task statuses;
-   diff viewer;
-   configurable validation;
-   retry/conflict flow;
-   screenshot capture;
-   Docker example.

### Phase 2 --- Context intelligence

-   React/Vue/Svelte adapters;
-   component-to-source mapping;
-   console/network context;
-   affected-file prediction;
-   related-task detection.

### Phase 3 --- Multi-agent orchestration

-   configurable worker pool;
-   dependency-aware scheduling;
-   task grouping;
-   automatic rebase/retry;
-   parallel validation;
-   optional visual regression checks.

## Contributing

This project should be developed in public. Useful contribution areas
include browser instrumentation, Git/worktree safety, agent adapters,
framework integrations, task scheduling, validation, UI/UX, security and
documentation.

Before the first stable release, APIs should be considered experimental.

## Open design questions

-   Should the context menu replace native right-click or require a
    modifier key?
-   How much DOM context is enough without creating noisy prompts?
-   What is the safest cross-platform strategy for applying patches?
-   How should tasks be rebased when the active branch changes during
    QA?
-   Can source-component mapping be framework-independent?
-   Should screenshots be opt-in or enabled by default locally?
-   How should adapters declare capabilities such as image input or tool
    use?
-   When should two QA requests automatically become one task?

Open issues and experiments are encouraged instead of prematurely
locking these decisions down.

## License

Recommended starting point: **Apache License 2.0** or **MIT**. Choose
and add the corresponding `LICENSE` file before accepting external
contributions.

## Working name

**DevReview Agent** is a placeholder. Other possible names include
`Patchloop`, `ClickFix`, `DevMark`, `LocalQA`, or `Fixflow`.

The name should be checked for existing projects and trademarks before
publication.

------------------------------------------------------------------------

### One-line vision

> **Turn every issue you spot on localhost into an agent-ready code task
> without leaving the page you are testing.**
