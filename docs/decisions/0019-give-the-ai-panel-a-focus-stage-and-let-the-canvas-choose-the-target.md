# Give the AI panel a focus stage and let the canvas choose the target

Status: Accepted

## Context

The AI panel shipped with the tool-calling agent (decision 0018) and kept the shape the old one had: a fixed 360 px column on the right, sharing a tab strip with the screen preview, with the context above the conversation, every tool call and check printed in full, and a menu that asked the reader whether the next turn should edit this flow or start a new one. A conversation that builds a flow is the widest thing in the builder and it had the narrowest column; the panel also told the reader, in a control they had to find, something the canvas already knows.

## Decision

- **The panel has two stages and the reader moves between them.** Narrow is the 360 px column beside the canvas. Focus puts the conversation left of the canvas at `clamp(420px, 42%, 720px)` and hides the left panel and both rails; the canvas keeps its header, so Run and Publish stay reachable, and it carries the flow's name while the panel that usually shows it is hidden. Focus mode is the chat alone: the screen preview is not offered there.
- **The switch is a layout change, never a different tree.** The panel keeps its place in the DOM and changes only its flex order and width, so React Flow is never remounted and the viewport, selection and undo history survive. Entering and leaving is manual — a header button, `⌘⇧A`, or Escape once nothing is selected — and nothing enters or leaves on its own.
- **A wide panel does not widen its text.** The thread and the composer hold a 620 px measure; the rules and the background span the panel.
- **The canvas decides what a turn produces.** An empty canvas gets a new flow, a canvas with nodes gets an edit. The mode selector is gone. A reader who wants an unrelated flow starts one from the workspace; the `replace` flag stays in the contract and is still sent for the empty canvas, so the API is unchanged.
- **A finished turn states its result, not its workings.** Tool calls are live while they happen and fold to one line when the turn ends; the proposal is a headline, one sentence about the checks and the two buttons, with the change list behind Details. The exception is the rule 0018 established and this keeps: a draft whose checks failed never folds, opens with its detail showing, and offers Apply as a secondary button.

## Consequences

The conversation gets the room it needs without the canvas leaving the screen, and without a second canvas or a second React Flow instance to keep in step. The panel says what the agent did in one line and keeps the evidence a click away, so a long session stays readable. Removing the mode selector costs the ability to ask for an unrelated flow on a canvas that already has nodes — accepted on 2026-09-11 — and buys a composer that asks nothing before the first message. Anything added to the panel now has to work at 360 px and at 720 px, and to declare whether it belongs to the chat or to the narrow stage's tab strip.
