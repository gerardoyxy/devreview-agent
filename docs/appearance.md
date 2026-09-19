# Appearance

The landing and application share an ultramarine palette, cool pale surfaces,
navy text, Archivo typography and fine borders. See [DESIGN.md](../DESIGN.md)
for the complete design system.

The landing illustrates the workflow with a connected browser and conversation.
The application adapts the same identity to a compact queue, review dialogs and
context/appearance editors. The dashboard and overlay share Conversation, Changes,
History and Context used. The public brand is NudgeThis; existing DevReview
commands, contracts and integration identifiers remain compatible.

Archivo is served locally under the OFL license: weights 400/700 in the application
and 400/700/900 in the landing. Application fonts are embedded as bytes in the
bundle and registered through FontFace, without external requests. The blue theme
is an editable default; previously saved themes retain their colors and fonts.

## Appearance schema v1

- Each palette has 18 color roles: page, surface, elevated, text, muted, border,
  accent, onAccent, accentSoft, success, successSoft, danger, dangerSoft, warning,
  warningSoft, info, infoSoft and backdrop. Values use `#RRGGBB`.
- `mode`: light, dark or system. System mode follows operating-system changes.
- `fonts`: body, heading and mono. Use installed font families with fallbacks or
  upload WOFF/WOFF2 files.
- `fontSize`: 12–20 px. `radius`: 0–24 px, while functional circles remain circular.
- Up to three uploaded fonts, totaling at most 1 MiB. Fonts are stored with the
  theme in SQLite and included in exports; no external font service is used.

The editor previews changes without saving them until Save. Cancel/Escape discards
the preview. Network errors remain visible and preserve the draft. Import validates
the format and fonts before previewing. Reset restores the defaults as a draft.

Contrast notices compare text/surface, muted text/surface, text/accent and text/page,
using 4.5:1 as a reference for normal text. They do not certify every possible
combination in a custom theme. The user's choices take precedence over defaults.

Overlay styles stay inside their container and Shadow DOM. Uploaded fonts receive
DevReview-specific names without replacing font families in the host application.
The interface respects reduced-motion preferences and uses native controls and
visible keyboard focus.
