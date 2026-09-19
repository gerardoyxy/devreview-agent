# My Style

My Style turns your design choices into reusable instructions for project changes. Open
**My Style** from the dashboard, conversations toolbar, or selected-element panel. This
feature is included in the current source and the `v0.4.0-alpha.1` preview archives.

## Build a style visually

Choose **Quiet**, **Editorial**, or **Expressive**. Each direction opens a different question
about spacing, typography, or emphasis. Choose an example, then adjust colors, installed
font family names, text size, spacing, corners and heading weight. The example components
update with your choices. Contrast notices flag combinations that may be hard to read.

Use **Rules** for scoped preferences: buttons and links, form fields, headings, containers,
or the base style. Add plain-text guidance for preferences that cannot be expressed by the
controls. Scoped rules override base preferences in their scope. The preview illustrates
those choices; it is not a render of your actual website or a guarantee of accessibility.

Name and save up to 12 profiles per repository. **Appearance** controls NudgeThis itself;
**My Style** supplies guidance for the projects you develop. Saving a profile does not
restyle your project or automatically make it the default.

## Learn from applied corrections

**Suggestions** looks for the same supported CSS value in at least three distinct applied
changes among the latest 200 applied tasks. It reads recorded patches locally in Rust:
no model, training job, chat analysis or external service is involved. Refresh the list
after applying changes. Opening My Style also loads the latest suggestions.

Each suggestion shows its value, supporting change IDs and a suggested scope. Open a
supporting change to inspect its history, choose where the rule belongs, and select
**Accept rule**. Nothing becomes a style rule merely because it repeats. Dismiss patterns
you do not want; dismissed suggestions can be shown again.

The initial detector deliberately handles a narrow subset:

- Single-property declaration corrections in `.css` and `.scss` patches, with one distinct
  supported old value and one distinct new value per property in each task.
- Hex colors, pixel sizes/spacing/corners, numeric weight/line-height, and font family names.
- Existing values that changed; additions alone, ambiguous values, pending/rejected/undone
  changes and unchanged values do not count. Patch scanning is bounded to 256 KiB and 10,000 lines.

Tailwind/utility classes, CSS variables, shorthand lists, inline styles, natural-language
feedback, selector intent and semantic layout techniques are not inferred yet. Similar
values can serve different purposes, so review the evidence and scope before accepting.
Undoing a task removes its support from future suggestions. Previously accepted rules
remain explicit user preferences and can be edited or deleted independently.

## Apply and reuse

**Apply my style** prepares a frontend change for the selected element, a page path, or the
project. It attaches the saved profile as a Project context instruction and opens the normal
composer. Review the request, save a draft or explicitly start the change, then review any
proposed patch before applying. Execution-disabled mode supports the builder and drafts.

**Use for new changes** adds one profile to default Project context. Other default project
instructions remain selected. Applying a different profile selects that profile instead of
the default style for that request. You can adjust the context selection in the composer.
Style instructions use the existing context/adapter path; they do not certify that every
agent will interpret them identically.

Every conversation records the style text and version it used. Editing or deleting a
profile does not rewrite those snapshots. **Stop using by default** affects future changes.
Generated context entries are named `Style: <name>`; publishing or activating a profile
refreshes its generated entry. Edit the profile in My Style to keep it as the source of truth.

**Export style** downloads a versioned JSON file you can import into another repository.
Imports create a new profile and validate its values. Exports contain preferences and notes,
without local task IDs or evidence history. **Export rules** produces readable Markdown
instructions for another workflow. Font files are not included; install/provide the fonts
in the receiving project. There is no account-level or cloud synchronization.

## Storage and limits

Rust stores profiles in the local `.nudgethis` SQLite database. Mutations use a revision check;
a stale window must reload before saving. Updating an active profile and its generated
Project context is one transaction. Public APIs require the normal local token and origin checks.

Profiles allow 32 rules and 4,000 bytes of notes each; the library is limited to 256 KiB and
imports/requests to 64 KiB. Generated instructions also count toward the existing Project
context limits: 32 items, 16 KiB per item, 128 KiB library and 48 KiB selected snapshot.
Unsupported values or a full context library fail visibly without partially saving a style.

See [API](api.md#my-style), [project context](../README.md#project-context), and
[foundation evidence](foundations.md).
