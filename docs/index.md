# Make your next change.

NudgeThis connects visual feedback, a coding agent and your local project. Point at an
element or group, describe the change, and review the proposed code before applying it.

## Choose your starting point

| You want to… | Start here |
| --- | --- |
| Download an app and open it | [Portable downloads](install.md) |
| Install and work from a terminal | [Terminal installation](terminal-install.md) |
| Use a repository inside WSL | [Windows + WSL](wsl.md) |
| Begin without an existing project | [Create a project](project-starter.md) |
| Connect an existing application | [Project setup and overlay integration](../README.md#use-with-your-application) |

The compiled application does not need Node.js or Rust. Your project and coding agent may
have their own requirements. Git is needed for assisted code changes; GitHub is optional.

## A typical change

1. Open your project and its local preview.
2. [Select one or more elements](selection-controls.md), or create a workspace request.
3. Describe the change, or use [Tools & elements](tool-palette.md) to prepare it visually.
   Choose the [project context](../README.md#project-context) to share.
4. Start a conversation with your [configured agent](agents.md), or save a draft.
5. Review the replies, diff and checks, then explicitly apply the change.
6. [Save a version](saved-versions.md) and [publish to GitHub](branch-publish.md) when ready.

## Make it yours

Use [Appearance](appearance.md) to change NudgeThis's colors and fonts. Use
[My Style](my-style.md) to build reusable design preferences for your projects.
[Route review](route-review.md) helps track desktop and mobile checks.

## Before enabling an agent

The welcome starts with agents disabled. Configure your own agent locally and review the
project's setup and validation commands before enabling execution. Read
[Security and privacy](../SECURITY.md) for the local trust model and shared context.

NudgeThis is an unsigned alpha. The [roadmap](../ROADMAP.md) lists current limits and
planned work; [recovery](recovery.md) explains how to handle interrupted changes.
