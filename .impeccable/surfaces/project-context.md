# Project context

Mode: Operate. Target: `packages/overlay/src/project-context.ts`, shared by the
dashboard and overlay; picker and snapshot integration in `review.ts` and
`index.ts`, editor entry in `packages/server/public/app.ts`.

Boundary: an ordinary extension of the incumbent application. All interface copy
is English. Preserve saved appearance preferences and shadow DOM isolation.
The approved blue Reference desk identity now applies; this feature establishes no
new global visual rules and does not replace `DESIGN.md` or a design sidecar.

Purpose: maintain a local library of instructions, text skills and reference
documents, select context for a conversation, and inspect what accompanied a
specific version. Keep editing, selection and historical evidence distinct.

Inherited appearance: follow `appearance.ts` and `review.ts`. Use `--dr-page`,
`--dr-surface` and `--dr-border` for regions; `--dr-text` and `--dr-muted` for
hierarchy; `--dr-accent`/`--dr-onAccent` for Save and focus;
`--dr-accentSoft` for selection; `--dr-danger` for errors. Inherit body and heading
font tokens, `--dr-size` and `--dr-radius`. The editor repeats the appearance
dialog's 22px/600 heading, body line-height 1.5, proportional secondary text,
one-pixel borders, control radius at 0.6 times the saved radius, and a two-pixel
accent focus outline. Modal depth uses the inherited backdrop at 65%.

Layout: a dialog up to 920px wide, bounded by viewport gutters and height.
Desktop uses a 240px library beside a flexible editor. At 640px and below these
stack, the library becomes a horizontally scrollable row, and content padding
reduces to 16px. Actions wrap; long titles and snapshot text wrap. Native dialog
scrolling exposes content and actions below the initial mobile viewport. Review
tabs wrap; snapshot bodies have their own bounded scrolling.

States: empty library, current item, default-for-new-conversations marker,
unsaved draft, loading/saving with disabled controls, saved confirmation and
readable errors. A failed save retains the draft; Reload saved explicitly
replaces it. Cancel/Close dismiss without saving. The picker shows selected
count, types, library revisions and changed or removed saved items. An unloaded
picker blocks sending with a reload instruction.

Snapshot semantics: new conversations start from library defaults. Existing
conversations preserve recorded context until selection is explicitly changed
or the library reloaded; reloading adopts current defaults. Context used and
archived history render the version's captured timestamp, library revision,
item revisions and exact plain text. An older version without a snapshot is
distinguished from a snapshot with no selected items. Library edits do not
rewrite recorded history.

Text-only scope: imports accept UTF-8 Markdown/text up to 16 KiB per item;
the library supports up to 32 items. Importing `SKILL.md` marks reusable
instructions; it does not install scripts, tools or assets. Documents are
reference material. Content is rendered as text, including HTML-like input.

Verification: source compared with incumbent appearance and review components;
desktop light, desktop dark, mobile editor and Context used captures inspected.
`nudgethis-project-context-checks.json` records create/import/default/save,
selection and current/archived snapshots, stale-save recovery, Cancel and overlay
integration checks with no errors or violations. The new-module detector reports
`[]`. Reviewer disposition: ship, with no material fixes. Captures demonstrate
the supplied themes and viewports, not every possible user palette or font.

Identity update: the approved blue redesign replaces earlier green defaults, review
heading eyebrows and glyph controls. Shared tokens and the current DESIGN.md govern
those components; the context library semantics and persistence contract are unchanged.
