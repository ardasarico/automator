# Overnight quality-of-life round

> **Status:** built overnight on 2026-09-11 on branch `feat/qol-overnight` (worktree `.claude/worktrees/qol`), uncommitted at the time of writing. Arda asked for "quality-of-life improvements that would not break anything, applied directly" and went to sleep; the list below was chosen without further input, so anything here is open to being reverted in the morning.

**Goal:** close the small gaps a careful engineer fixes without a product decision: consistency between sibling screens, accessibility names, confirmation before irreversible actions, dates that are right where the reader sits, and the states a page shows while it loads or fails.

**How the list was made:** four read-only surveys (docs and audits, `apps/web`, the API and packages, runtime and mini-app) looked for gaps against the documented behaviour in `docs/web-ui.md` and `docs/architecture.md`. Each finding was kept only if it was small, reversible, consistent with decisions 0015 to 0017, and outside the files another session was merging at the time (the AI chat branch: the builder store, canvas, panels, the AI routes, `docs/architecture.md`, `docs/web-ui.md`, `packages/db`). Those two docs therefore still describe the old behaviour for the items marked _doc_ below; the sentences to change are listed at the end so they can be applied after the merge.

## Decisions taken without Arda

- **One copy control.** Six copy buttons disagreed on the clipboard guard, whether "Copied" resets, and how the result is announced. `apps/web/src/components/copy-button.tsx` is now the only one: outline by default, icon-only when asked, a check for two seconds, a `role="status"` announcement, and a visible sentence when the clipboard refused (an insecure origin throws on the property access itself, so the guard sits inside the try).
- **Calendar dates follow the reader.** Four lists pinned their date to UTC, so a flow edited late in the evening west of UTC read as tomorrow. `components/local-date.tsx` renders UTC on the server and the reader's zone after hydration, the trade `LocalTime` already made for runs.
- **Irreversible actions confirm.** Deleting a secret, revoking an API key and unpublishing a mini-app link now confirm, the way flows, tables, records and listings already did. Nothing else gained a confirmation.
- **Shortcut hints are platform-aware everywhere.** The command menu showed ⌘ on Windows; it now uses the same formatter as the header tooltips, and lists the four canvas shortcuts it was missing (duplicate, group, ungroup, select all).
- **The canvas route gets loading and error boundaries** like the workspace group, and a flow's own name in the tab title.
- **Preview "Not now" on a payment screen takes the declined port**, whatever the screen is configured to simulate. This was a bug, not a decision.

## Work items

### Web

- [x] Shared `CopyButton` replaces the copies in flow settings, Use as API, MCP section, wallet, settings, marketplace; `copyToClipboard` helper.
- [x] Connections: section ids without spaces, guarded Copy key that resets, confirm before delete secret and revoke key, `autoComplete="off"` on the name field, `LocalDate` for Saved and Last used.
- [x] Settings: the usage window's date uses the shared formatter instead of the browser locale.
- [x] Account menu Settings is a Next link; Create page has a title.
- [x] Root and workspace error boundaries agree on `reset`; the root one logs the error.
- [x] Command menu: platform shortcut hints, duplicate/group/ungroup/select-all commands.
- [x] Share dialog: confirm before Unpublish.
- [x] `(canvas)` group: `loading.tsx`, `error.tsx`, `generateMetadata` with the flow name over a cached loader.
- [x] Data: destructive Delete table item, rail links are Next links, table dialog focuses Name, record panel loading skeleton, `LocalDate`.
- [x] Runs: explorer links say they open a new tab and carry the short hash; JSON blocks get a copy button.
- [x] Payment limits: `beforeunload` while dirty.
- [x] Login focuses the email field; onboarding focuses the name field once enabled.
- [x] Flows list and marketplace detail use `LocalDate`.

### Runtime and mini-app

- [x] Runtime metadata: description, Open Graph, viewport theme colour; per-app description; manifest colours.
- [x] `/a/[flowId]`: one cached flow read per request, a `loading.tsx`, the "App not found" copy in one place, a waiting line in the builder preview, proxy failures logged with their cause.
- [x] Payment screen: preview decline takes the declined port, sample uses the default chain, balance formatted, full address in a title, a warning when the balance is below the amount.
- [x] Screens: unknown screen types degrade to a note, an unencodable QR value says so, `LocalField` named truthfully, failed views move focus to their title.
- [x] Landing prompt ignores an empty submit.

### API and packages

- [x] Invoke's 409 `waiting_on_screen` carries the stalled run's id (contract widened with an optional `runId`).
- [x] Fixable input answers 422 with a specific code: `invalid_name` for API key names, `invalid_secret` for secrets, `invalid_flow` for a malformed ad-hoc run document; the web proxies and message maps follow, the sentences shown are unchanged.
- [x] The reserved-username check folds (trim, NFC, lower-case) before the lookup, so "Admin " is refused.
- [x] Trigger issues answer 503 before reading the store when the reader is unconfigured.
- [x] Table deletion finds dependent flows with one owner-scoped JSONB query (`listUsingTable`) instead of a list plus a find per flow.
- [x] One hex module in contracts (`hex.ts`: address and transaction-hash patterns) replaces the copies in contracts, the MCP tools, wallet transactions and sessions.
- [x] The health contract spreads the shared error responses, so a 500 is "down" rather than a thrown client error.
- Length caps on the API trigger input schema were tried and reverted: that schema also reads stored configs, so an existing long description would have made the flow unreadable.
- [x] `flowRunSources` is the exported tuple the schema, the account contract and the database counts derive from (the Settings page still lists them by hand; it sits in the peer's merge).
- [x] The API client separates "could not reach" (with the cause, timeouts named) from "answered <status> without a JSON body"; the auth client keeps the cause.
- [x] `findPublishedWithOwner` is typed as the columns it selects; the run-stats window falls back to the default for anything that is not a finite number.
- [x] Discord: `requireResolved`, trimmed URL, guarded JSON, provider detail in the error, and its own test file. Telegram, Resend, Discord and Graph fetches time out after 20 seconds and report transport failures as "Could not reach <provider>"; tokens, keys and transfer values are trimmed; `usdc.balance` parsing sits inside its guard; one `valueText` helper; `defaultInputHandle` shared with the screen scope.
- Skipped on purpose: new rate limiters (reads and deletes are documented as never limited, and new buckets need `config.ts`), health version/uptime and the `usdcAddress` ternary (`app.ts` and `config.ts` are in the merge), `touch()` (its only caller already catches), the marketplace and list paging, schema tightening on stored strings.

### Decided by Arda in the morning (2026-09-11)

- [x] The webhook trigger payload drops `authorization` and `cookie` and keeps every other header (`apps/api/src/hooks/routes.ts`).
- [x] A comparison error names the operand's shape only ("a string", "an array of 3 items"), never its content, so a condition on a resolved secret cannot write it into run history (`packages/flow-engine/src/compare.ts`).
- [x] A verified on-chain payment whose session claim is lost answers 409 `payment_claim_lost`, and the mini-app tells the visitor the payment went through and to keep the transaction hash (`apps/api/src/sessions/routes.ts`, `packages/miniapp/src/remote-mini-app.tsx`).
- The subgraph node keeps attaching the server's Graph API key to whatever URL the author names: Arda chose to leave it as is.
- Still open, not raised for a decision: the subgraph node's reply is uncapped in the run record while the agent's identical call caps at 4000 characters.

## Doc sentences to apply after the AI-chat merge

Applied to `docs/web-ui.md` and `docs/architecture.md` on 2026-09-11.

## Verification

- `bun run lint` 13/13, `bun run typecheck` 11/11, `bun run format:check` clean, `bun run test` 19/19 tasks with no failures, all on the tree fast-forwarded onto main `812bd35`.
- `TEST_DATABASE_URL=postgres://localhost:5432/automator_qol_test bun test packages/db`: 73 pass, including the new `listUsingTable` case.
- Playwright (`TEST_DATABASE_URL=…/automator_qol`, ports 3110/3111): 24 passed, 1 skipped, 3 failed, the three being the known pre-existing failures (builder-panels Share click intercepted by the right panel, responsive-canvas at 1280 and 390 px expecting the old 260 px panel).
- Chrome against local servers with the e2e user: Connections renders with valid section ids, the delete-secret dialog opens with its sentence, Cancel keeps the secret, confirm removes it; a flow page is titled by the flow name; the command menu lists Duplicate, Group, Ungroup and Select all with platform glyphs, holds Undo, Duplicate, Group and Ungroup until their precondition holds, and Select all enables Duplicate and Group.
- Three reviewer agents read the whole diff; their findings were fixed or reverted as recorded above.
