# AI chat redesign

> **Status:** implemented on branch `feat/ai-chat` (worktree `Automator-ai`), 2026-09-11. Decided
> 2026-09-11 with Arda; the implementation plan is
> `2026-09-11-ai-chat-redesign-implementation.md`, whose tasks are all done. Live check: OpenAI
> `gpt-5.6-luna` answered "Every hour, check my USDC balance and post it to Discord" in 11.3 s
> with 8 tool calls, 0 rejected, and checks of 1 skipped and 4 warnings. What shipped differs
> from this document in two places, marked **As built** below. The left panel and node settings are being redesigned in parallel on
> `feat/node-settings-redesign` by another session; the seams between the two are listed under
> "Coordination".

The builder's AI panel is rewritten from scratch, and the way the model produces flows changes
with it: instead of answering one JSON document that the API validates and sends back once for
repair, the model calls small tools that build the flow step by step on a working copy, each
step validated as it lands, the whole thing streamed to the browser and drawn on the canvas as
a preview. The conversation is stored per flow. Assistant text renders through
[Streamdown](https://streamdown.ai), a streaming Markdown renderer.

Decision 0008 keeps its core: nothing lands on the canvas until the user applies a proposal, the
model never sees a credential, generated flows are validated before they are offered. What
changes is the granularity of the model's output and the fact that the user watches it happen.

## Why

- Whole-document answers are the weakest point of the current design. The most common failure
  (an edge into a config key instead of a handle) is only caught after the model has produced
  the entire flow, and one repair round is all it gets. A tool call is validated the moment it
  is made and the error goes straight back to the model, which fixes that one thing.
- Small edits are cheap: "add a condition before the last step" is two tool calls, not a
  re-emitted document.
- Nothing streams today. A wait of 30 to 100 seconds shows a counter and a sentence. With tools,
  the panel shows each step as it happens and the canvas grows with it.
- The conversation lives in memory and dies on reload. A flow's conversation is part of how it
  was made; it should come back.

## Server

### Endpoints

All under the flow, ownership enforced by the API as for every `/flows/:id/*` route. Contracts in
`packages/contracts/src/ai.ts`; the old `POST /ai/flows` and `POST /ai/runs/explain` contracts,
routes and modules are removed.

| Method   | Path                                | Purpose                                           |
| -------- | ----------------------------------- | ------------------------------------------------- |
| `GET`    | `/flows/:id/ai/messages`            | The conversation, oldest first.                   |
| `POST`   | `/flows/:id/ai/messages`            | Send a user message; answers `text/event-stream`. |
| `PATCH`  | `/flows/:id/ai/messages/:messageId` | Set a proposal's state (`applied`, `discarded`).  |
| `DELETE` | `/flows/:id/ai/messages`            | Start over.                                       |

`POST` body: `{ text, document?, context? }`. `text` is the user's message (1 to 4000
characters). `document` is the canvas's current document when it has unsaved changes, secret
fields blanked by the builder (`redactFlowSecrets`) and blanked again by the route; without it
the API reads the saved flow. `context` is optional and carries what the panel's context strip
shows: `selection` (node ids), `problems` (the builder's `FlowProblem[]`, formatted for the
model with node labels, as the left panel now words them), and `run` (the same redacted run
shape the old explain endpoint took: status, trigger, node results, error, and the node to
explain). **As built:** the existing per-user AI rate limit (10 a minute) applies only to `POST`, and is checked after the ownership lookup, so a mistyped or foreign flow id costs nothing; `GET`, `PATCH` and `DELETE` are unlimited.

### The canvas agent

`apps/api/src/ai/canvas-agent.ts` replaces `generate-flow.ts` and `explain-run.ts`. The model
works on a working copy of the document through tools:

| Tool           | Arguments                                          | Effect                                                             |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| `add_node`     | `id`, `type`, `label`, `config`                    | Adds a node; the API lays it out.                                  |
| `update_node`  | `id`, `label?`, `config?` (merged)                 | Changes a node.                                                    |
| `remove_node`  | `id`                                               | Removes it and its edges.                                          |
| `connect`      | `source`, `sourceHandle`, `target`, `targetHandle` | Adds an edge.                                                      |
| `disconnect`   | same                                               | Removes it.                                                        |
| `set_flow`     | `name?`, `description?`, `chainId?`                | Flow settings.                                                     |
| `add_test`     | one `aiFlowTestSchema` scenario                    | A behavioral scenario for the checks; required for form mini-apps. |
| `ask_user`     | `question`, `options` (1 to 4 short strings)       | Ends the turn with a question.                                     |
| `suggest_next` | `items` (1 to 3 short strings)                     | Follow-up chips shown after the answer.                            |

Every mutating tool validates immediately: node type in the generatable allowlist, handle ids
from `flowNodePorts`, config cleaned through the node's schema (`parseNodeConfig`), one edge per
input handle, no self-edge, no cycle. A failed call returns its problem to the model as the tool
result and changes nothing; the loop continues. The system prompt is the current one from
`generate-flow.ts` (node types with handles and config schemas, template rules, data tables,
execution limits) rewritten for tools: it describes the tools, says that a turn should end with
a short Markdown answer for the user, and asks for `suggest_next` at the end of a turn that
changed the flow. The tool loop is capped at 40 calls and the whole request keeps the current
`requestBudgetMs` deadline shared across model hops and checks.

The model's text output is the assistant message. Prose-only turns (a question, an explanation,
"what does this flow do") make no tool call and produce no proposal; an `ask_user` call ends the
turn before any proposal is built, so a question is never paired with a draft.

### End of turn

When the working copy differs from the starting document, the API runs the document checks
(`findFlowDocumentProblem`, orphans, cycles, a trigger) and then `verifyFlow` with the existing
verification budget, and emits a `proposal` event with the full document and the verification
report. Document checks that fail here are sent back to the model once as a final "fix this"
message inside the same turn (one repair, as today); if the second pass still fails, the draft is
offered anyway with a failed check, exactly as the current code does, because a visible fault on
the canvas beats a lost draft.

Secrets: as today, the model never receives one. Applying an edit restores the canvas's own secret
values into nodes it kept (`restoreFlowSecrets`); a new flow inherits nothing.

### Stream events

`text/event-stream`, one JSON object per `data:` line, each a TypeBox schema in contracts under a
`type` discriminator:

| Event         | Payload                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| `message`     | `{ id }` — the assistant message's id, first.                                                 |
| `text.delta`  | `{ delta }`                                                                                   |
| `tool.call`   | `{ id, name, args }`                                                                          |
| `tool.result` | `{ id, ok, detail, document? }` — `document` is the working copy after a successful mutation. |
| `status`      | `{ phase: "thinking" \| "checking" \| "repairing", detail? }`                                 |
| `question`    | `{ text, options }`                                                                           |
| `proposal`    | `{ document, verification, replaces }`                                                        |
| `suggestions` | `{ items }`                                                                                   |
| `error`       | `{ error, detail? }` — the existing `aiErrorSchema`.                                          |
| `done`        | `{}`                                                                                          |

The same shapes are what a message stores as `parts`, so a reloaded conversation renders from
`parts` exactly as the live stream did. Text deltas are merged into one `text` part when stored.

### Persistence

`packages/db`: migration `0020_flow_ai_messages` creates `automator_flow_ai_messages` (`id`
text primary key, `flow_id` referencing `automator_flows` on delete cascade, `role` `user` or
`assistant`, `parts` jsonb, `created_at`), indexed on `(flow_id, created_at)`. A user message
stores `[{ type: "text", text }]` plus the context it carried (so a reload shows which nodes it
was about); an assistant message stores its parts in event order and a proposal part carries
its `state` (`pending`, `applied`, `discarded`, `stale`). `PATCH` changes only that state;
sending a new message marks every pending proposal `stale`.

The model's history is rebuilt from the last twelve messages: user text, assistant text, and
each assistant turn's tool calls and results as chat tool messages, cut to the current
per-turn length. Proposal documents are not replayed; the current document is.

## Client

### Files

`apps/web/src/builder/ai/` replaces `ai-panel.tsx`, `ai-store.ts`, `ai-client.ts` and
`use-explain-run.ts`:

- `transport.ts` — list, send (reads the body as a stream, parses SSE frames, validates each
  event against the contracts schema, aborts through an `AbortController` with the request
  budget as its ceiling), patch, clear. A malformed event ends the stream with an error the
  panel shows. **As built:** every call goes to the app's own same-origin route handlers under
  `/api/flows/:id/ai/messages`, never to the API directly; those handlers add the bearer token,
  and the streaming `POST` one relays the API's SSE body untouched and carries the client's
  abort upstream.
- `chat-store.ts` (zustand, provided like today's `AiStoreProvider`) — `messages`, the
  streaming assistant message, `pending`, `context` (selection, problems, run) and the reducer
  that applies events: `text.delta` grows the text, `tool.call` opens a step, `tool.result`
  closes it and writes its `document` into the builder store's `preview`, `question` and
  `suggestions` set their chips, `proposal` adds the card, `error` ends the turn with an error
  part. Loading a conversation replays `parts` through the same reducer.
- `use-ask-ai.ts` — `askAboutNode(nodeId)`, `askToFix(problems)`, `askToExplainRun(run,
nodeId?)`. Each opens the right panel on the AI tab, sets the context, and focuses (or, for
  explain, sends) the message. The run panel's "Explain with AI" and the node settings header's
  "Ask AI" button call this hook.
- `panel.tsx`, `message.tsx`, `steps.tsx`, `proposal-card.tsx`, `composer.tsx`,
  `context-strip.tsx`, `markdown.tsx` and `panel.module.css` — the UI below.

### Canvas preview

The builder store (`store.ts`) gains `preview: FlowDocumentInput | null` and `setPreview()`.
While `preview` is set:

- The canvas renders the preview's nodes and edges instead of the document's, laid out by the
  API. Each node and edge carries `data-draft` = `added`, `changed`, `removed` or `kept`
  (computed by the existing `diffNodes` / `diffConnections`, moved next to the store): added
  nodes have a dashed border, changed ones an accent border, removed ones are drawn faded with
  the label struck through, kept ones look normal.
- The canvas is read-only: no dragging, connecting, deleting or palette drops; selection works
  so a node's settings can be read. `left-panel.tsx` passes `readOnly={preview !== null}` to
  `NodeSettings`, which the node-settings redesign supports.
- `fitView` follows the draft as it grows (debounced, animated, respecting reduced motion).

`preview` is set by the reducer during a stream and by opening a pending proposal; it is cleared
by Apply, Discard, sending a new message, or clearing the conversation. Apply calls the builder's
`applyDocument` (one undo entry), clears `preview`, fits the view and sends the `PATCH`.

### Home hand-over

The Home hero prompt no longer asks the model itself. It creates the flow (`createFlowAction`
with `ai: true`), stores the prompt in `pending-prompt` as today, and the builder's panel sends
it as the first message on mount, so the stream is visible from the first second.
`storeAiAnswer` / `takeAiAnswer` go away. A first turn that fails leaves a flow with a
conversation in it, not a dead end; this reverses the earlier "no empty flow on failure" rule
on purpose.

## Panel

Inside the existing right panel chrome (tabs "AI agent" / "Screen preview", the minimize
control, compact-mode dialog behaviour), top to bottom:

1. **Context strip.** Small chips: the flow's name always; "N nodes selected" when there is a
   selection; "N problems" when the builder reports any; a run chip when explaining a run. Each
   removable except the flow. Under it, two conditional quick actions: "Fix problems" and
   "Explain this flow".
2. **Conversation** (`role="log"`, scrolls to the bottom on new content). User messages are
   right-aligned soft boxes. An assistant turn is a flat column: Markdown text (Streamdown with
   the `code` plugin, `isAnimating` while streaming), then **Steps** (one row per tool call:
   icon, "Add node · Discord message", a check or the error text; the list collapses to a
   one-line summary when the turn ends and expands on click), then question chips, then the
   proposal card, then suggestion chips.
3. **Proposal card.** "N changes", the verification heading and checks in the current honest
   wording (failed, not tested, no checks), the node and connection diff, `Apply` / `Discard`.
   Once acted on the card shows "Applied", "Discarded" or "Superseded".
4. **Status row** while streaming: the phase ("Drafting", "Checking the flow"), elapsed time,
   `Stop`.
5. **Composer.** Auto-growing textarea, Enter sends, Shift+Enter breaks a line (as Home). A
   `Menu` on the left holds "Start over" and, when the canvas has nodes, the "Edit this flow /
   Start a new flow" choice that replaces today's checkbox. Send button on the right.
6. **Empty state.** One sentence and three suggestion chips (today's lists); a chip sends
   immediately.

Question chips send their option text as the user's message; "Something else" focuses the
composer. Suggestion chips send immediately.

Components come from `@automator/ui` (Button, Badge, Menu, ScrollArea, Tooltip, Textarea), icons
from Remix. Streamdown is installed in `apps/web` (`streamdown`, `@streamdown/code`) with the two
`@source` lines in `globals.css` and its stylesheet imported for the animation; its output is
wrapped in one `.markdown` class that maps links, inline code, code blocks and list spacing to
the workspace tokens so it reads like the rest of the panel in both themes. No mermaid, math or
CJK plugin.

Accessibility: streaming text is not a live region; the turn's end is announced once. Stop,
Apply and Discard are reachable by keyboard. Reduced motion disables Streamdown's animation and
the canvas fit animation.

## Coordination

The node-settings redesign (`feat/node-settings-redesign`) owns `left-panel.tsx`, the palette,
node settings, outline, history, variables and `components/schema-form`. This work owns
`right-panels.tsx`, `builder/ai/`, `store.ts` (only `preview`), `flow-canvas.tsx` and
`flow-node.tsx` (only the draft rendering), `home/prompt.tsx`, `run-panel.tsx` (only the explain
button), `apps/api/src/ai/*`, `packages/contracts/src/ai.ts`, and the db migration. Agreed seams:

- `NodeSettings` takes `actions?: ReactNode` and `readOnly?: boolean`. This work adds one line
  to `left-panel.tsx`: `actions={<AskAiButton nodeId={node.id} />}` and
  `readOnly={preview !== null}`, announced to the other session when made.
- `.sidePanel`, `.rail` and `.panelHeader` in `flow-builder.module.css` stay untouched by both.
- `FlowProblem` gained an optional `path`, and config-problem messages now start with the node
  label; the API's problem formatting for the model uses the message as given.

## Testing

- API: the agent loop with `scriptedModel` (a rejected tool call returns its problem and the
  loop continues; the call cap; `ask_user` ends the turn without a proposal; the end-of-turn
  checks and the one repair; the failed-checks draft is still offered); the SSE encoder writes
  events that validate against the contracts; the routes enforce ownership, rate limits, stream
  the body, patch a proposal's state and clear a conversation. Unit tests inject the model as
  the app already allows.
- DB: an integration test for the messages table (append, list in order, cascade on flow
  delete), run against the local test database.
- Web: the chat reducer (event application, stale rule, replay from `parts`), the SSE reader
  (split frames, abort), the proposal diff (today's tests moved), the panel (empty state,
  question chip sends, Apply calls `applyDocument` and clears `preview`, Stop aborts), the Home
  hand-over (a flow is created, the first message is sent).
- Playwright: one smoke test from Home to an applied node on the canvas. The API has no way to
  fake a model today (only `E2E_TEST_TOKEN`), so `config.ts` gains `AI_SCRIPTED_MODEL=1`,
  refused in production like the test token, which makes `index.ts` build the app with a
  scripted model that answers any first message with a two-node flow.
- Manual: one live turn against the configured models before the branch is offered, with the
  measurement noted in the plan. If tool-calling quality on the free OpenRouter models is poor,
  plan B is fewer tools: fold `add_node` + `connect` into one `add_step` that takes the upstream
  handle.

## Documentation

`docs/architecture.md`'s AI section is rewritten for the agent, the stream, the messages table
and the removed endpoints. Decision 0008 gets a superseding record for the tool-calling agent and
the persisted conversation when the session wraps up.
