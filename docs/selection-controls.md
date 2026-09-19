# Selection controls

Open **Selection controls** from the dashboard toolbar, the page overlay's **Controls**
button, or its conversations window. Selection only opens a request; it never starts an
agent or applies a code change.

## Select a group

1. Choose **Select multiple** in the page overlay, then click or tap each element.
   Selecting it again removes it. Nested text or icons inside a control select that control.
2. Or choose **Select area** and drag a rectangle in either direction. Fully enclosed,
   visible elements are added to the group. Nested button contents and ancestor containers
   are collapsed to avoid redundant targets. On touch screens, drag with one finger.
3. Inspect the numbered outlines and selection list. Remove individual targets, clear the
   group, or choose **Review selection**. **Add more elements** returns to picking while
   preserving your request.
4. Describe the shared change, then copy the context, save a draft or start one conversation.
   The same group appears under **Context used** and in saved task revisions. My Style can
   also prepare a request for the selected group.

**Add to selection modifier** controls an extra key used with your existing mouse gesture
or keyboard shortcut. The default is Shift: with the default mouse gesture, use
Alt + Shift + right-click. If a shortcut already uses the extra key, it remains a single
selection shortcut; choose a different extra modifier or use **Select multiple**.
Choosing **Off** disables only the extra-key gesture. Saved controls synchronize across windows.

Escape or leaving the window cancels picking or an unfinished rectangle; the existing
group remains available for review. **Cancel** in the selection list clears the group.
Selection gestures consume their associated clicks so they do not activate the inspected app.

Groups contain up to 20 unique targets from one page, with at most 48 KiB of minimized
browser context. Area discovery inspects at most 5,000 elements. An oversized area is
rejected with an explanation; narrow it or pick individual elements. Area selection uses
the visible viewport and does not enter iframe contents or shadow roots. Scroll between
selections as needed. Changed or ambiguous targets must be selected again or removed
before sending. Passwords, field values and private DOM content follow the same capture
rules as individual selections.

## Mouse and keyboard preferences

- Choose left, middle, right, Back or Forward mouse button, or turn the mouse gesture off.
- Combine the button with any combination of Ctrl, Alt/Option, Shift and Meta/Command/Windows.
  The combination must match exactly. With no modifiers, the selected button replaces its
  normal action on the inspected page. Other gestures keep their normal behavior.
- Record a keyboard shortcut, or turn it off. Focus an element with Tab, then press your
  shortcut to select it. Plain typing keys (including Shift combinations) are ignored in
  editable fields. Escape and Tab cannot be assigned; repeated keys and IME composition
  do not select elements.
- Use the gesture test area before saving. Browser/OS-reserved shortcuts and side buttons
  may not reach the page. Additional hardware buttons work only if the device maps them to
  a supported browser mouse button or keyboard shortcut.
- Use **Pick element** for one-time selection with a left click or touch. It highlights the
  hovered target and returns to normal browsing after selection. Escape, Cancel picking or
  leaving the window cancels this mode.

**Save controls** persists preferences in the local repository database and updates its
connected overlays without a reload. Preferences are shared by windows connected to this
repository, not synced to a cloud account or across repositories. Unsaved changes can be
cancelled. Concurrent edits are rejected rather than overwriting another window's save;
close and reopen the editor to load the latest values. **Reset defaults** restores
Alt + right-click and Alt + Shift + D after saving.

The matched mouse gesture is intercepted before target handlers and its follow-up click,
context menu or auxiliary click is consumed. Earlier document-level capture handlers,
browser extensions and OS-reserved actions remain outside the overlay's control.
NudgeThis's own controls and modal dialogs do not become selection targets. Cross-origin
frames require their own enabled overlay; this setting does not bypass browser isolation.

## Integration defaults

Existing `modifier: 'alt' | 'none'` initialization remains supported. A more detailed default
can be supplied before a preference is saved (also useful in copy-context-only mode):

```ts
NudgeThis.init({
  enabled: true,
  server: 'http://127.0.0.1:7331',
  token,
  selection: {
    pointer: { button: 0, modifiers: ['alt', 'shift'] },
    keyboard: { code: 'KeyE', modifiers: ['alt'] }
  }
});
```

Mouse button values are 0 (left), 1 (middle), 2 (right), 3 (Back), 4 (Forward), or `null`
(off). Modifier names are `control`, `alt`, `shift` and `meta`. Keyboard codes refer to
physical keys; the character printed on a key can differ with the keyboard layout.
Saved repository preferences take precedence over integration defaults. Persistent editing
requires a connection to the local NudgeThis server.

## Local API

Authenticated `GET /api/selection-controls` returns `null` before the first save. `POST`
accepts `{version: 1, revision, pointer, keyboard}`; use revision 0 initially, then the
revision returned by the server. Invalid bindings return 400 and stale saves return 409.
Successful saves emit a `selection-controls` event on the authenticated event stream.

## Verification

`npm test` checks preference validation, authentication, concurrent saves and restart
persistence with execution disabled. To also exercise real mouse, keyboard and touch
events, set `NUDGETHIS_TEST_BROWSER` to a Chrome/Chromium executable and run
`node --test tests/selection-browser.safe.test.js`. CI runs this check on Linux. These
tests use disposable local pages and never run agents, models or project commands.
