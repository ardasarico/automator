# AI chat panel redesign

> **Status:** decided 2026-09-11 with Arda, implementation started the same day. The agent, its
> tools, the streaming protocol, the contracts and the server are untouched; this is the panel's
> surface. The functional redesign it sits on is `2026-09-11-ai-chat-redesign.md`.

The builder's AI panel keeps everything it does and changes how it says it. Decisions were taken
against a throwaway demo in UI Lab (`apps/ui-lab/src/app/patterns/ai-chat/`, deleted when this
lands) that drew the panel with the real tokens in every state a turn passes through.

## Layout: two stages

The panel has a narrow stage and a focus stage, and only the reader moves between them.

- **Narrow** is today's placement: a 360 px panel on the right of the builder, sharing its tab
  strip with the screen preview.
- **Focus** puts the conversation on the left of the canvas and gives it `clamp(420px, 42%, 720px)`.
  The left panel and both icon rails are hidden; the canvas keeps its own header, so Run and
  Publish stay reachable. The screen preview does not exist in this stage — focus mode is the
  chat alone — so the tab strip is replaced by the panel's name, and leaving focus brings the
  strip back with the AI tab selected.

The panel stays where it is in the DOM and only changes its flex order and width, so React Flow
is never remounted: the viewport, the selection and the undo history survive the switch.

Entering and leaving is manual: the button in the panel header, `⌘⇧A` (`mod+shift+a`, free in
the registry), the command menu, or Escape. Nothing enters or leaves focus on its own. Below
1024 px the panel is already a full-width overlay, so focus mode is not offered there.

A wide panel must not stretch the text with it: in focus mode the thread and the composer keep a
620 px measure, centred, while the rules and the background span the panel.

## Context

The context strip moves from the top of the panel to just above the composer, where it says what
the next message carries while it is being typed. The flow-name chip is dropped — the canvas
header already names the flow. What stays: the selection pill, the problem count, the run, and
the quick actions ("Fix problems", "Explain this flow"). When there is nothing to show, the row
is not rendered.

## A turn

- While the turn runs, its tool calls are listed as they happen, under the message that asked for
  them, with the wait line beneath: what it is doing, how long it has taken, and Stop.
- When the turn ends, the calls fold into one line (`5 steps`, and `· 1 rejected` when something
  was refused), which unfolds on click.
- The proposal is a card of a headline, one sentence about the checks, and the two buttons.
  `Details` holds what used to be printed in full: the check lines, the change list, the
  connection changes and the flow-settings changes.
- A proposal whose checks failed never folds: the card opens with its details showing, states the
  failure, and Apply steps back to a secondary button. This is the one rule of the old panel that
  the redesign must not soften.
- A proposal that was applied, discarded or superseded is one muted line, not a card.

## Empty state

One sentence and three starters. The sentence says what the panel will do with the answer
(a new flow when the canvas is empty, a change to this flow when it is not); the starters follow
the same split and are written as things someone would actually ask for.

## Composer

The mode selector is removed. Whether a turn replaces the canvas or edits it is decided by the
canvas alone: an empty canvas gets a new flow, a canvas with nodes gets an edit. The `replace`
flag stays in the contract and is still sent for the empty canvas, so the API is unchanged.

**Consequence:** on a canvas that already has nodes there is no longer a way to ask for an
unrelated flow in place; the agent edits what is there, or the reader starts a new flow from the
workspace. Accepted on 2026-09-11.

What remains in the composer: the prompt field, the "…" menu with Start over, and Send.

## Scope

`apps/web` only, plus the deletion of the UI Lab demo. No change to `packages/contracts`,
`apps/api`, the agent's tools, the stream, the stored conversation, or the rule that nothing
reaches the canvas until a proposal is applied.

## Verification

`bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, `bun run format:check`;
`apps/web/src/builder/ai/panel.test.tsx` reworked for the folded turn, the context's new home and
the removed mode, a new test for the focus toggle, and `apps/web/e2e/ai-chat.e2e.ts` checked
against the moved controls.
