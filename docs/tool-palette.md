# Tools & elements

Open **Palette** in the page overlay, or **Tools & elements** in a selected element's
request. The floating workbench helps describe changes without writing CSS or knowing
component names. It uses your NudgeThis appearance settings.

## Make an adjustment

1. Use **Pick element**, **Select multiple** or **Select area** to choose a target.
2. Open the palette's **Tools** tab and choose a visual action.
3. Adjust its values, then choose **Prepare request**.
4. Edit the prepared text, copy its context, save a draft or explicitly start a conversation.
5. Review the proposed code before applying it.

| Tool | What it prepares |
| --- | --- |
| Change color | A background, text or border color request with contrast guidance. |
| Make bigger | A percentage increase while preserving proportions and surrounding layout. |
| Add spacing | Extra room using the appropriate gap, margin or padding. |
| Round corners | A corner radius in pixels. |
| Same size | Consistent dimensions for two or more selected elements. |
| Change text | Replacement text for one selected element. |

Prepared requests append to existing request text. They never silently replace it. If the
combined request exceeds 8,000 characters, shorten it before adding another action.
Changed or missing targets must be selected again. The palette preserves the same
selection, minimized context and privacy rules as manual requests.

## Add a component

**Elements** shows visual examples of a button, text block, image, card, form field and
section. Select one reference element on the page, choose a component, then set
**Placement** to before, after or inside it. Optional details describe its content or purpose.
Use **Pick a reference element** if nothing is selected; reopen the palette from the
request panel to continue with your choices.

**Prepare request** asks the coding agent to use the project's existing framework,
components and design conventions. The examples illustrate intent; they are not a
framework-specific component library or a drag-and-drop DOM editor. If the reference
cannot contain the new element, the request asks for a suitable alternative before changing
it. Images use an existing asset or a clearly identified placeholder.

Opening the palette, choosing a sample or preparing a request does not modify the inspected
page, save a task, run an agent or apply code. Drafts and Copy context work in the normal
execution-disabled workflow. Actual code generation still requires a configured agent.

## Arrange your workbench

- Choose **Left** or **Right** under **Dock side**. The palette and selection dock follow
  that edge on wider screens; narrow screens keep the expanded palette within the viewport.
- Star tools or components to put favorites first in their tab.
- Collapse the palette with its close button or Escape. Escape closes the palette without
  discarding your selected targets or request.
- Use arrow keys, Home and End to change tabs. Other controls use normal Tab navigation.
- **My Style** opens reusable design preferences; **Review changes** opens conversations.

Dock side and favorites are saved in browser storage for the preview's origin. They are
not synced to other origins, devices or repositories. No project content or access token is
stored with these preferences. When storage is unavailable, preferences last for the page's
current lifetime and the palette explains this.

At narrow widths, the selection dock uses named icons to leave room for the preview.
Mouse, keyboard and touch keep their existing selection behavior. See
[selection controls](selection-controls.md) and [My Style](my-style.md).
