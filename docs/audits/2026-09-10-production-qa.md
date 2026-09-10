# Production QA — 2026-09-10

End-to-end QA of the deployed app in Chrome with the owner's own signed-in account, covering every one of
the 46 node types in `packages/contracts/src/flows.ts` plus the workspace, builder, mini-app runtime and
machine surfaces. Main was at `0426725` when the run started; three fix batches landed during it.

Hosts: web `app.automator.ardasari.co`, runtime `run.automator.ardasari.co`, API
`api.automator.ardasari.co`, landing `automator.ardasari.co`. Chain: Base Sepolia, server signing on,
wallet holding ~0.063 ETH / 19 test USDC.

## Findings

Severity is the effect on someone using the product, not the size of the fix.

### HIGH

**1. The landing page renders nothing.**
`https://automator.ardasari.co` is a blank dark page — no header, no copy, no call to action.
Not a deploy failure: the served RSC payload contains `["$","main",null,{}]`, and the source matches —
`apps/landing/src/app/page.tsx` is `export default function LandingPage() { return <main />; }`.
Metadata and OG tags are complete and correct, so link previews look healthy while the page is empty,
which makes it easy to miss. `docs/plans/2026-09-10-landing-page*.md` exist but none of the implementation
is on main. Known: the landing page is being built separately.

### MEDIUM

**2. Node search ranked a description substring above an exact label match.** (fixed on `fix/production-qa`)
Typing `Form` in the palette, the connect-drop picker or ⌘K put Logic › **Run code** first, because its
description "Trans**form** data with a small JavaScript function." matched, with Screens › Form second.
Since the first result is the Enter target, typing a node's exact name and pressing Enter added the wrong
node — I hit this for real while building and had to undo. `searchCatalog`
(`apps/web/src/builder/catalog.ts:732`) scored nothing and emitted in `catalogGroups` order, so Logic
preceded Screens on position as well as on matching.

**3. Flows list read "No trigger" for a flow that starts at an API call trigger.** (fixed, verified live)
A regression from the API-publishing merge: `describeTrigger`
(`packages/contracts/src/flow-triggers.ts`) had no `case "trigger.api"` and fell through to
`default: return null`, so `documentTriggers` filtered it out. It was the only one of the nine
trigger-category types missing. Now reads "When something calls its endpoint".

**4. The contract ABI field marks a working human-readable ABI as "Invalid JSON".** (with the fix session)
Repro: Read contract, address `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, ABI
`function decimals() view returns (uint8)`, Function `decimals`. The field shows a red inline
"Invalid JSON" with `aria-invalid` and the help text says "as a JSON array" — but the run succeeds and
returns `6`. `docs/architecture.md` advertises "an ABI (JSON, or human-readable signatures one per line)".
Cause: `abi` goes through the `json()` helper (`packages/contracts/src/onchain-configs.ts:26`), which sets
`contentMediaType: application/json`, and the builder renders that as a checked JSON editor. The editor
tells people their correct input is wrong.

**5. Creating a table did not refresh the table rail.** (fixed)
/data → New table → Create: the app navigated to the new table and the content pane showed it, but the
left "Tables" rail still listed only the previously known tables, so the table you were looking at was
missing from the list of tables. A reload fixed it. Adding a _record_ did refresh the rail, which narrowed
it to the create path specifically.

**6. Runs list rows were not clickable outside the flow name.** (fixed, verified live)
The whole `<tr>` (1214×46.5 px) carried the hover highlight but the only link was the flow-name text at
130×21 px.

**7. Run detail said "No trigger node fired." for mini-app runs that had fired one.** (fixed, verified live)
The Trigger section read that directly above the payload `{"openedAt": …}` while the Steps list's first
row was "Mini-app opened / Succeeded". `run-detail.tsx:168` resolved the trigger only from
`run.trigger.nodeId`, which resumed session runs do not carry.

### LOW

**8. Builder minimap did not fit the flow.** (fixed) Nodes flush to the bottom edge, the rightmost node
clipped by the right border, the top ~60% empty, and the viewport rectangle disagreeing with the canvas.
Cause: `MiniMap` reads its size from the `style` prop and computes the svg and viewBox from it; sized only
in CSS it kept React Flow's default 200×150 inside a 160×100 frame with `overflow: hidden`, so it was
clipped rather than scaled.

**9. Use as API dialog: both copyable snippets were unreadable.** (fixed) The MCP command wrapped at its
spaces so it read `claude mcp add--transport … /mcp--header …` (the DOM text was correct and Copy worked,
but it was wrong to read); and the curl example neither wrapped nor scrolled, clipping the endpoint
mid-URL. The `overflow-x: auto` was already there but never engaged because the `pre` sized itself to its
longest line as a flex item — 665 px inside a 462 px parent.

**10. Builder History truncated the node count mid-word.** (fixed) "Sep 10, 9:57 PM · 10 no…" in a 310 px
panel with ~40 px of unused room.

**11. Runs chart: the tallest bar exceeds the top gridline.** The Sep 7 bar reaches ~122 runs while the
highest labelled gridline is 100, with no gridline or label above it. Readable, but the scale reads as if
the bar overflows.

**12. Wallet payment-limits table shows column headers with no rows.** The Chain / Asset / Per transfer /
Per UTC day / Reserved today header row with its per-column rules renders above "No limits yet.", which
reads as a broken grid rather than an empty state.

**13. Settings usage breakdown mixes capitalisation.** "30 Simulate · 1 webhook · 2 schedule · 41 mini-app
· 97 onchain event · 0 watch · 0 API".

### Withdrawn after investigation

- **"New flow" needing two clicks / 503s.** My browser captures showed `POST /flows` → 503 and RSC
  prefetches failing. Railway's edge logs for the same window showed every request from this IP as 200,
  including the POST the API answered 201. The 503s were generated before the edge — between Chrome and
  Railway, most likely the automation extension I was driving through — and the rest correlated with four
  API redeploys during the session. Not a product defect. (A visible failure state for a failed create
  landed anyway as fix batch 4.)
- **New table dialog height.** I reported a Type select opening ~230 px above its trigger. Measured
  properly, the dialog is 16→704 in a 720 viewport with the footer always visible and the columns in an
  internal scroll region; the popup flips upward only when a trigger genuinely has no room beneath it,
  which is correct. No change needed.

## Behaviour worth documenting

**A failing node aborts every branch, including parallel ones.** I fanned six nodes off a single trigger
output; when one failed on a missing secret, every other branch — an independent AI chain and a subgraph
query — reported "Skipped: The run stopped at an earlier node." That is the engine contract, but the
canvas makes parallel branches look independent. Now explained in the skip reason itself and in
`docs/web-ui.md`.

## Per-node results — all 46 types

Legend: **S** simulated green · **L** ran live against the real provider/chain · **P** settings panel
renders its full schema and validates · **C** correct palette entry (label, description, group, icon).

| #   | Node type                    | C   | P   | S   | L   | Evidence                                                              |
| --- | ---------------------------- | --- | --- | --- | --- | --------------------------------------------------------------------- |
| 1   | trigger.manual               | ✓   | ✓   | ✓   | ✓   | started every QA flow                                                 |
| 2   | trigger.api                  | ✓   | ✓   | ✓   | ✓   | invoked over HTTP and MCP                                             |
| 3   | trigger.webhook              | ✓   | ✓   | ✓   | ✓   | POST → 202 `{runId,status:"succeeded"}`; wrong token → flat 404       |
| 4   | trigger.schedule             | ✓   | ✓   | ✓   | ✓   | 30 s interval fired twice while active                                |
| 5   | trigger.price                | ✓   | ✓   | ✓   | ✓   | Watch run on the first poll                                           |
| 6   | trigger.balance              | ✓   | ✓   | ✓   | ✓   | Watch run on the first poll                                           |
| 7   | trigger.onchain-event        | ✓   | ✓   | ✓   | —   | polled with no logs (EOA, deliberately quiet)                         |
| 8   | trigger.miniapp-open         | ✓   | ✓   | ✓   | ✓   | opened real visitor sessions on the runtime                           |
| 9   | world.verification-completed | ✓   | ✓   | ✓   | —   | "This node has no settings yet." — correct, takes no config           |
| 10  | logic.condition              | ✓   | ✓   | ✓   | ✓   | fired `true` on `{{vars.n}}` = 5                                      |
| 11  | logic.switch                 | ✓   | ✓   | ✓   | ✓   | untaken branch reported Skipped, edges dashed                         |
| 12  | logic.wait                   | ✓   | ✓   | ✓   | ✓   | elapsed 1.0 s                                                         |
| 13  | logic.for-each               | ✓   | ✓   | ✓   | ✓   | 3 passes, `{count:3, items:[3,4,5], results:[null,null,null]}`        |
| 14  | logic.merge                  | ✓   | ✓   | ✓   | ✓   | ran with one dead input                                               |
| 15  | logic.filter                 | ✓   | ✓   | ✓   | ✓   | kept [3,4,5] / dropped [1,2]                                          |
| 16  | logic.set-variable           | ✓   | ✓   | ✓   | ✓   | vars carried to later nodes                                           |
| 17  | logic.run-code               | ✓   | ✓   | ✓   | ✓   | QuickJS sandbox, 10 ms                                                |
| 18  | logic.return                 | ✓   | ✓   | ✓   | ✓   | answered `{"total":"5"}`; "Answered the caller"                       |
| 19  | data.create-record           | ✓   | ✓   | ✓   | ✓   | dry-run `{"id":"simulated",…,"simulated":true}`; live real id         |
| 20  | data.find-records            | ✓   | ✓   | ✓   | ✓   | reads real data in both modes                                         |
| 21  | data.update-record           | ✓   | ✓   | ✓   | ✓   | merged `score:99`, kept `name`                                        |
| 22  | data.delete-record           | ✓   | ✓   | ✓   | ✓   | removed the record it was given                                       |
| 23  | onchain.read-contract        | ✓   | ✓   | ✓   | ✓   | USDC `decimals()` → 6                                                 |
| 24  | onchain.write-contract       | ✓   | ✓   | ✓   | ✓   | canonical USDC `transfer(address,uint256)`, success                   |
| 25  | onchain.transfer-token       | ✓   | ✓   | ✓   | ✓   | tx `0x3c505c…f016`, block 46650653                                    |
| 26  | onchain.sign-message         | ✓   | ✓   | ✓   | ✓   | real 65-byte signature `0x004381a3…031b`                              |
| 27  | privy.wallet                 | ✓   | ✓   | ✓   | ✓   | "This node has no settings yet." — correct                            |
| 28  | privy.login                  | ✓   | ✓   | ✓   | —   | screen renders for a real visitor on the runtime                      |
| 29  | privy.sign-transaction       | ✓   | ✓   | ✓   | ✓   | 689 ms, signed without broadcasting                                   |
| 30  | usdc.payout                  | ✓   | ✓   | ✓   | ✓   | tx `0x0bb99a4…0150`, block 46650654, 0.01 USDC                        |
| 31  | usdc.balance                 | ✓   | ✓   | ✓   | ✓   | read the owner's balance                                              |
| 32  | usdc.payment                 | ✓   | ✓   | ✓   | —   | Simulate + Screen preview only (visitor pays; limit)                  |
| 33  | screen.page                  | ✓   | ✓   | ✓   | ✓   | answered by a real visitor                                            |
| 34  | screen.form                  | ✓   | ✓   | ✓   | ✓   | real submitted value round-tripped                                    |
| 35  | screen.confirmation          | ✓   | ✓   | ✓   | ✓   | Confirm taken by a real visitor                                       |
| 36  | screen.qr-code               | ✓   | ✓   | ✓   | ✓   | rendered a real QR of the resolved template                           |
| 37  | world.id-verify              | ✓   | ✓   | ✓   | —   | Simulate + Screen preview only (no phone; limit)                      |
| 38  | world.selfie-check           | ✓   | ✓   | ✓   | —   | Simulate + Screen preview only (no phone; limit)                      |
| 39  | ai.generate-text             | ✓   | ✓   | ✓   | ✓   | 2.0 s against the real model                                          |
| 40  | ai.classify                  | ✓   | ✓   | ✓   | ✓   | 1.9 s, one label from the fixed list                                  |
| 41  | ai.extract                   | ✓   | ✓   | ✓   | ✓   | 1.6 s against a JSON Schema                                           |
| 42  | ai.agent                     | ✓   | ✓   | ✓   | ✓   | allowlist held; `steps` recorded the one `set_variable` call          |
| 43  | graph.query-subgraph         | ✓   | ✓   | ✓   | ✓   | live `{"_meta":{"block":{"number":25949238}}}`                        |
| 44  | notify.discord               | ✓   | ✓   | —   | —   | **delivery unverified** — no credential; secret-failure path verified |
| 45  | notify.telegram              | ✓   | ✓   | —   | —   | **delivery unverified** — no credential                               |
| 46  | notify.email                 | ✓   | ✓   | —   | —   | **delivery unverified** — no credential                               |

### The one real gap

The three notification nodes were never proven to deliver. The account has no discord / telegram / resend
secret, and sending a message on the owner's behalf was out of scope for this run. Their settings panels
render and validate, and the credential path is proven in the right direction — with
`{{secrets.qa_missing_webhook}}` the Discord node failed in 5 ms with `Secret "qa_missing_webhook" is not
defined`, shown on the card and in the run panel with "Explain with AI" offered. Someone with a real
credential should confirm one message actually arrives before the demo.

## Surfaces

**Pass:** Home (hero, examples, activity tape), Flows (grid/table, search, empty state, sort, delete
confirm), Runs (stats band, sort/filter links, panel, auto-paging then "Load older runs"), Data (rail,
gallery, grid, record panel, inline cell editing), Connections (secrets, API keys create/copy-once/revoke,
connected apps), Wallet (identity, balances per chain, payment limits, transactions), Settings (all three
sections), Marketplace (browse, categories, featured, sections, listing detail, publish, fork), root and
flow not-found screens, login page.

**Builder pass:** all 46 palette entries across 11 groups with correct labels, descriptions, groups and
icons; group navigation and search; connect-drop picker (filtered to nodes that can accept the connection,
new node arrives wired); tidy-up and fit view; undo/redo; ⌘S, ⌘K, ⌘↵; Outline; History with Restore; flow
settings including chain, Active, Send real transactions, wallet balances, server signing and "Automatic
run issues"; validation chip with error/warning severity and per-node messages; run panel with per-node
outputs, explorer links, skip reasons and Explain with AI; last-run value previews under each field with
the stale-evidence note; Screen preview walked screen by screen; Share menu (mini-app, Use as API,
marketplace).

**Machine surfaces pass:** `GET /v1/flows`; `POST /v1/flows/:id/invoke` with valid input, a coerced numeric
string, a missing required field and an unknown field (422 with per-field problems); 401 for bad/no key;
flat 404 for an unknown flow; 401 when an API key is used on a dashboard route; `GET /mcp` → 405 with a
JSON-RPC "stateless; use POST"; MCP `initialize`, `tools/list` (`list_flows` plus the slugged flow tool
with `additionalProperties: false`), `tools/call` returning `_meta`, text and `structuredContent`, and an
`isError` result for a misspelled argument; `claude mcp add` + `claude mcp list` reporting Connected.

**Mini-app runtime pass:** a published flow opens at `/a/<id>`, the API starts the session server-side,
runs to the first screen and renders it in the phone card; each visitor answer is a real session-answer
round trip that stores a run; edits to the flow reach the live app on save with no republish.

**Not verified:** onboarding (`/onboarding`) — reaching it needs a fresh account. Notification delivery,
as above. The World ID and Selfie Check QR flows on a phone.

## Method and limits

Every flow was built through the real builder UI, saved, and run through the real run paths — no direct
database or API document writes. Live runs moved 0.03 test USDC in total, all self-transfers to the
owner's own wallet, within the 0.1 cap. Server signing was never toggled. No flow, table or secret that
predated this run was renamed, unpublished or deleted. Eight QA flows, one QA table and one API key were
created and all were removed afterwards; the key was confirmed dead (`GET /v1/flows` → 401) and the
scratch MCP registration removed.

## Incidental: the in-progress landing code does not parse

Running `bun run format:check` at the end of this QA stopped on an uncommitted, untracked file:

```
apps/landing/src/build/alternatives.tsx:227:29  x Expected `}` but found `:`
      curl -d '{"amount":250}'
```

Line 227 puts `{"amount":250}` in raw JSX text, so the `{` opens an expression container and the contents
are not valid JavaScript. The very next lines in the same component already do it the right way
(`{'{ "eta": "2 blocks",'}`), so this looks like one spot the author missed rather than a design choice.
As written the file cannot parse, which fails lint, typecheck and build — and therefore blocks the landing
deploy that would resolve finding 1. This is live work in progress (`apps/landing/src/build/` is untracked),
so it may simply be mid-edit; flagging rather than fixing, since it is not this QA run's code to change.
