# Product

## Platform

web

## Users

People who build with coding agents, including vibe coders who can describe a visual problem without knowing an element's technical name.

## Product Purpose

Select something in a local web application, describe a desired change, discuss it with a coding agent, and review its proposed changes before applying them.

## Operating Context

The public landing introduces the project. The application runs locally alongside the user's development project and coding agent. The user works through an overlay conversation or a dashboard, with separate conversations and version history for each change.

## Capabilities and Constraints

- TypeScript browser interfaces; Rust runtime, local HTTP/SSE API, storage, command-line application, validation, and agent adapters.
- Codex CLI integration, compatible ACP/custom process adapters, and copyable context for agents accepting text. Arbitrary agents may require an adapter; universal out-of-the-box integration is not claimed.
- Project context: saved instructions, text skills and reference docs, selectable per change with immutable versioned snapshots. Markdown/text imports only; no automatic skill/tool installation.
- Isolated Git worktrees, explicit apply, follow-up messages, validation results, previous versions, and activity history.
- User-defined light/dark colors, body/heading/code fonts, uploaded WOFF/WOFF2 fonts, text size, and corner radius. Preserve saved themes and shadow DOM isolation.
- Experimental alpha available from source and as unsigned native preview archives. Agent/model testing remains a separate opt-in activity.
- GitHub Pages hosts the static landing only. The local Rust service runs on the user's machine.

## Brand Commitments

NudgeThis is the public name. Public documentation, product interface and marketing copy use English. The CLI uses `nudgethis`; browser integrations use `NudgeThis.init()`. The landing and application share ultramarine accents, pale surfaces, Archivo typography and precise borders. User color and font customization takes precedence over those defaults. See [the design system](DESIGN.md).

## Product status

NudgeThis is an MIT-licensed alpha with portable native archives and application tests. It is not a stable release or an installed background service. See [the roadmap](ROADMAP.md) for release requirements and remaining product work.

## Product Principles

- Let people point and describe in ordinary language.
- Keep context, conversation, and versions attached to the same change.
- Make the user's review and apply decision explicit.
- Keep the agent connection replaceable and the interface personalizable.
