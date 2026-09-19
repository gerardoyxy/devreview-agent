# Product

<!-- impeccable:product-schema 1 -->

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
- Early alpha built from source. No packaged downloads are currently published. The deterministic demo does not call a model.
- GitHub Pages is intended for the static landing only. The local Rust service is not hosted by Pages.
- Public repository belongs to gerardoyxy. Development authentication must remain separate from hejoirsys.

## Brand Commitments

NudgeThis is the public name. All product interface and marketing copy is English. Existing `devreview` CLI commands and technical integration names remain compatible. The user owns nudgethis.click at Namecheap and prefers free GitHub hosting for the landing. The user selected the blue Reference desk direction for both landing and application: ultramarine, pale surfaces, bold Archivo typography, precise borders and lemon selection markers. User color/font customization remains supported.

## Evidence on Hand

Source code, deterministic local demo, protocol/runtime tests, and genuine application screenshots. MIT-licensed project. No customer counts, testimonials, adoption statistics, commercial promises, or benchmarks have been supplied.

## Product Principles

- Let people point and describe in ordinary language.
- Keep context, conversation, and versions attached to the same change.
- Make the user's review and apply decision explicit.
- Keep the agent connection replaceable and the interface personalizable.
