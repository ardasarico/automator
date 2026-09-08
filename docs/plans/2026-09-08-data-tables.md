# data-tables — plan

**Sources:** context.md: `/Users/ardasari/Documents/GitHub/Automator/.prova/tasks/data-tables/context.md` · approved artifact: the `final-summary` decisions document stored under that task.

**Constraints (translated from the user's decisions):**
`appetite: Large — full data management` ·
`column-types: Text; Number; Checkbox; Date & time; Single select; Wallet address` ·
`find-semantics: B — found / empty branches` ·
`update-delete-matching: B — a record id or a filter's first match` ·
`table-reference: B — a table picker field kind plus a missing-table warning` ·
`simulate-writes: C — no writes at all (dry-run)` ·
`simulate-reads: A — reads are real, writes are simulated` ·
`ai-table-authoring: A — the composer may only use existing tables` ·
`csv-scope: C — drop CSV entirely` ·
`record-editing-ui: B — a record list plus a dialog generated from the column schema`

**No-gos (from the approved summary):** no relations/joins/JSON column · no CSV import or export or any other file import · no inline spreadsheet grid editing · no AI-authored tables or columns · no bulk update/delete inside one node · no column type migration once records exist · no visitor-facing table access from published mini-apps · no record version history, audit trail or undelete · no cross-account or public tables · no runtime-dynamic table names via templates.

> Approved by the user in the terminal on 2026-09-08 (the prova tab was disconnected at the
> plan round), with the instruction to implement it end to end.
>
> Executors: deviating from any decision in Sources requires re-asking it under its
> decision id before acting.

## Goal

An account owns tables with typed columns and records. A `Data` section in the workspace lists tables, edits their columns, and lists/creates/edits/deletes records through a dialog generated from the column schema. Four flow nodes — `data.create-record`, `data.find-records`, `data.update-record`, `data.delete-record` — read and write those records during a run, reaching the database only through a new owner-bound `data` seam on the engine, in the same shape as the existing `chain` seam. In Simulate the nodes read real data and report the writes they would make without performing them.

## Success criteria

- A signed-in user can create a table, define columns of all six approved types, add a record through the dialog, edit it, delete it, and delete the table — every step through the UI at `/data`.
- A flow with `data.create-record` run live creates exactly one record, visible at `/data/<table>`; the same flow run in Simulate creates none and its run panel shows the write as simulated.
- `data.find-records` fires its `found` handle when the filter matches and `empty` when it does not, and `{{input.found.first.values.<column>}}` resolves in a downstream node. (Corrected during Phase 4: a record is `{id, tableId, values, createdAt, updatedAt}`, so columns live under `values.`; flattening them would let a column named `id` shadow the record id.)
- A data node whose table id no longer resolves shows the "!" problem badge on the canvas and names the missing table; forking a marketplace flow that contains data nodes produces a flow whose data nodes have no table selected and carry that badge.
- The AI composer, asked to build a flow that stores something, emits data nodes referencing one of the requesting user's existing tables and never invents a table id.
- A node executed with no `data` seam configured fails with a clear message instead of throwing an unhandled error.
- `bun run lint`, `bun run typecheck`, `bun run test` (with `TEST_DATABASE_URL` set), `bun run build` and `bun run format:check` all pass.

## Out of scope

Everything in the No-gos list above, plus:

- No change to `packages/api-client` beyond using its existing generic `request()`.
- No change to the marketplace listing format; the only fork-path change is clearing data-node table references.
- No per-table or per-record permission model; ownership is the only access rule.
- No mobile-specific layout work beyond what the existing workspace shell already provides.

## Phase 1 — Contracts and persistence

### Tasks

- [x] `packages/contracts/src/data-tables.ts`: `dataColumnTypes = ["text", "number", "checkbox", "datetime", "select", "address"]`; `dataColumnSchema` (`id`, `name`, `type`, `required`, `options` for `select` only); `dataTableSchema` (`id`, `name`, `description`, `columns`, `recordCount`, `createdAt`, `updatedAt`); `dataRecordSchema` (`id`, `tableId`, `values` as a record of column id → value, `createdAt`, `updatedAt`); input schemas with `additionalProperties: false`; `isDataTableInput` / `isDataRecordInput` guards built with `Check`, mirroring `flows.ts`.
- [x] In the same file: `dataColumnOperators`, a map from column type to the subset of `conditionOperators` that applies (text: equals/not_equals/contains/is_empty/is_not_empty; number and datetime: equals/not_equals/greater_than/less_than/is_empty/is_not_empty; checkbox, select, address: equals/not_equals/is_empty/is_not_empty). Exported for both the node config UI and the API filter validation.
- [x] In the same file: `validateRecordValues(columns, values)` returning `{path, message}[]` problems — address must match `/^0x[0-9a-fA-F]{40}$/` and is stored lowercased, number must be a finite JSON number, datetime must parse as an ISO string and is stored as UTC ISO, select must be one of `options`, checkbox must be a boolean, required columns must be present and non-empty. Used by the API for both UI writes and node writes.
- [x] Endpoint contracts in the same file, following `flows.ts` / `flow-versions.ts`: `listDataTablesContract` (`GET /data/tables`), `createDataTableContract` (`POST /data/tables`), `getDataTableContract` (`GET /data/tables/:id`), `updateDataTableContract` (`PATCH /data/tables/:id`), `deleteDataTableContract` (`DELETE /data/tables/:id`), `listDataRecordsContract` (`GET /data/tables/:id/records`, keyset `cursor` + `limit` query like `listAllRunsContract`, response `{records, nextCursor?}`), `createDataRecordContract` (`POST`), `updateDataRecordContract` (`PATCH /data/tables/:id/records/:recordId`), `deleteDataRecordContract` (`DELETE …`).
- [x] Add `invalid_table` and `invalid_record` to `apiErrorCodeSchema` in `packages/contracts/src/contract.ts`; add `export * from "./data-tables";` to `packages/contracts/src/index.ts`.
- [x] `packages/contracts/src/data-tables.test.ts`: schema accept/reject cases per column type, the operator map covering every column type, and `validateRecordValues` for each rule above.
- [x] `packages/db/src/migrations.ts`: append `0014_data_tables` — `automator_data_tables (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT, columns JSONB NOT NULL, created_at, updated_at)` and `automator_data_records (id TEXT PRIMARY KEY, table_id TEXT NOT NULL REFERENCES automator_data_tables(id) ON DELETE CASCADE, owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE, values JSONB NOT NULL, created_at, updated_at)`, plus `CREATE INDEX automator_data_tables_owner ON automator_data_tables (owner_id, created_at)` and `CREATE INDEX automator_data_records_keyset ON automator_data_records (table_id, created_at DESC, id DESC)`. Never edit an existing entry.
- [x] `packages/db/src/data-tables.ts`: `createDataTableStore(sql)` with owner-scoped `list`, `get`, `create`, `update`, `remove`, following `flows.ts` — tagged templates only, `${json}::jsonb` casts, `FOR UPDATE` on the table row before a column change. `create` enforces 50 tables per owner under the owner row lock (`payment-policies.ts` `lockOwner` pattern); `update` rejects a column type change when the table has at least one record, and rejects more than 50 columns. Removing a column drops it from the schema and leaves its values in place inside each record's JSONB — no rewrite pass, and re-adding a column with the same id shows them again.
- [x] `packages/db/src/data-records.ts`: `createDataRecordStore(sql)` with `list` (keyset paging copied from `runs.ts`, cursor `{createdAt, id}` base64url, `limit + 1` probe, `DataRecordCursorError` on garbage), `get`, `find(tableId, ownerId, {filters, sort, limit})` evaluating the approved operators in SQL over the JSONB `values`, `create` (50,000 records per table enforced under the table row lock; 100 KB per record rejected before insert), `update`, `remove`. Every method takes `ownerId` and scopes on it.
- [x] Wire both stores into `createDatabase()` in `packages/db/src/index.ts` as `dataTables` and `dataRecords`, exporting `DataTableStore`, `DataRecordStore`, `DataRecordCursorError` and the limit constants.
- [x] `packages/db/src/data.integration.test.ts` following `integration.test.ts`: `describe.skipIf(!TEST_DATABASE_URL)`, `did:privy:test-%` cleanup, covering CRUD, owner scoping (another owner's id returns nothing), cascade on user delete and on table delete, keyset paging across a page boundary, each operator in `find`, the per-owner table cap, the per-table record cap and the rejected column type change.

### Automated verification

- `bun test packages/contracts/src/data-tables.test.ts` — schemas, operator map and value validation behave as specified.
- `TEST_DATABASE_URL=postgres://…/automator_test bun test packages/db/src/data.integration.test.ts` — migration applies and every store rule holds against real PostgreSQL.
- `bun test packages/db/src/migrations.test.ts` — migration names stay unique and ordered.

### Manual verification

- Connect to the local test database and confirm `\d automator_data_records` shows the keyset index and both cascading foreign keys.

## Phase 2 — API surface

### Tasks

- [x] `apps/api/src/data/routes.ts`: `createDataRoutes({ dataTables, dataRecords, identity, callsPerMinute })` using `createAuthGuard`, one Elysia route per contract from Phase 1, owner taken from `claims.id` only. Body typed `Type.Unknown()` at the Elysia level and validated with the Phase 1 guards so a bad payload maps to 422 `invalid_table` / `invalid_record`; store limit errors map to 409; unknown table or record maps to 404.
- [x] Record writes call `validateRecordValues` against the table's current columns before touching the store, and reject values for column ids the table does not have.
- [x] `GET /data/tables/:id` returns the table with its `recordCount`; `DELETE /data/tables/:id` returns the names of the owner's flows whose documents reference the table id (scan the owner's flow documents through `flows.list`) so the UI can warn before deleting, and deletes when the request repeats with `?confirm=1`.
- [x] Decide the rate limit in this phase, not later: add `data` to `RateLimits` / `defaultRateLimits` in `apps/api/src/rate-limit.ts` with the same per-minute budget as `runs`, and apply it in `beforeHandle` on the write routes only.
- [x] Mount in `apps/api/src/app.ts` conditionally (`dataTables && dataRecords ? createDataRoutes(...) : new Elysia()`), extend `AppDependencies`, and pass `database.dataTables` / `database.dataRecords` in `apps/api/src/index.ts`.
- [x] `apps/api/src/data/routes.test.ts` following `flows/routes.test.ts` with an in-memory fake store: 401 without a token, 404 for another owner's table, 422 for a bad column type and for a value that violates its column, 409 at the caps, 429 past the rate limit, and the keyset paging response shape.

### Automated verification

- `bun test apps/api/src/data/routes.test.ts` — status codes and payload shapes as specified.
- `bun run --cwd apps/api typecheck` — routes match the contracts.

### Manual verification

- With the API running locally and the e2e token, create a table, post two records and page through them with `curl`, confirming `nextCursor` advances and stops.

## Phase 3 — Engine nodes and the data seam

### Tasks

- [x] `packages/flow-engine/src/data.ts`: `DataProvider` interface — `mode: "live" | "dry-run"`, `table(tableId)`, `find(tableId, query)`, `create(tableId, values)`, `update(tableId, target, values)`, `remove(tableId, target)`, where `target` is `{recordId}` or `{filters}`. No database import; the engine declares the interface only.
- [x] `packages/flow-engine/src/executor.ts`: add `data?: DataProvider` to `ExecutionContext`; `packages/flow-engine/src/engine.ts`: add `data?: DataProvider` to `RunOptions` and pass it into the context next to `chain`.
- [x] `packages/contracts/src/data-node-configs.ts`: config schemas for the four node types. Shared fields: `tableId` (string, marked `tableRef: true`), filter rows as an array of `{column (marked columnRef: true), operator (union of conditionOperators), value (string)}`, value rows as an array of `{column (columnRef), value (string)}`. `data.find-records` adds `sortColumn` (columnRef), `sortDirection` (`asc`/`desc`) and `limit` (integer, default 25, max 100). `data.update-record` / `data.delete-record` add `target` (`record`/`filter`, default `record`) and `recordId` (string, default `{{input.record.id}}`). Register all four in `flowNodeConfigSchemas`.
- [x] `packages/contracts/src/flows.ts`: add `data.create-record`, `data.find-records`, `data.update-record`, `data.delete-record` to `flowNodeTypes`. `packages/contracts/src/flow-ports.ts`: `"data.create-record": ports(["values"], ["record"])`, `"data.find-records": ports(["query"], ["found", "empty"])`, `"data.update-record": ports(["record"], ["record"])`, `"data.delete-record": ports(["record"], ["record"])`.
- [x] `packages/contracts/src/flow-config-problems.ts`: for the four data types, report a problem when `tableId` is empty, and (given the table list passed in by the caller) when the referenced table id is unknown to the owner or a referenced column id is not in that table. Extend `findFlowConfigProblems` with an optional `tables` argument; callers without it keep today's behaviour.
- [x] `packages/flow-engine/src/data-executors.ts`: the four executors, `kind: "step"`. Each reads its config with `context.config(schema)`, requires `context.data` (else `NodeExecutionError("No data store is configured for this run")`), and:
  - create → `{ record }`; in `dry-run` returns a synthetic record (`id: "simulated"`, the resolved values) without writing;
  - find → `{ found: { records, count, first } }` or `{ empty: { records: [], count: 0, first: null } }`, reading real data in both modes;
  - update / delete → resolve the target by `recordId` or by the filter's first match, and in `dry-run` return the record that would have been changed, marked `simulated: true`, without writing.
- [x] Spread `dataExecutors` into `defaultExecutors` in `packages/flow-engine/src/executors.ts`; export the provider types from `packages/flow-engine/src/index.ts`.
- [x] `apps/api/src/data/provider.ts`: `createDataFactory({ dataTables, dataRecords })` returning `{ forOwner(ownerId, mode): DataProvider }`, mirroring `ChainFactory.forUser`. The provider closes over `ownerId`; every call passes it to the store, so a table id belonging to another account resolves to nothing. Writes throw in `dry-run` only if an executor calls them — the executors are responsible for not calling them, and the provider asserts the mode as a second guard.
- [x] Inject it wherever `chainFactory.forUser` is used today: `apps/api/src/runs/routes.ts` (both run paths, mode from `body.mode ?? "dry-run"`), `apps/api/src/scheduler.ts` (three call sites, mode `"live"`), `apps/api/src/sessions/routes.ts` (mode `"live"`).
- [x] `packages/flow-engine/src/data-executors.test.ts`: a fake provider covering each node in live and dry-run mode, the `found`/`empty` split, filter-target resolution, the missing-seam error, and that dry-run performs no write calls.

### Automated verification

- `bun test packages/flow-engine/src/data-executors.test.ts` — executor semantics including dry-run.
- `bun test packages/contracts/src/flow-ports.test.ts packages/contracts/src/flow-config-problems.test.ts` — handles stay unique and the new problems fire.
- `bun run typecheck` — the seam threads through engine, API and scheduler.

### Manual verification

- Run a two-node flow (manual trigger → create record) locally in live mode and confirm the record appears through `GET /data/tables/:id/records`; repeat in simulate mode and confirm the count is unchanged.

## Phase 4 — Builder integration

### Tasks

- [x] Extract `ConfigField`, `ObjectFields`, `ArrayField`, `Group`, `JsonField`, `StringListField` and their helpers out of `apps/web/src/builder/node-settings.tsx` into `apps/web/src/components/schema-form/` with named exports, leaving `node-settings.tsx` importing them. Behaviour unchanged — the existing node-settings tests must pass untouched.
- [x] Add the two new field kinds to the extracted `ConfigField`: a `tableRef` string field rendering a `Select` of the user's tables (fetched once through a `useDataTables()` hook over `apps/web/src/data/client.ts`, cached in a context provider mounted by the builder) with a "create a table" link to `/data`; and a `columnRef` string field rendering a `Select` of the columns of the table named by the sibling `tableId` value, disabled with a hint when no table is selected. Both store ids, never names.
- [x] `apps/web/src/builder/catalog.ts`: a new `data` catalog group and four entries — `Create record` ("Add a record to one of your tables."), `Find records` ("Look up records that match a filter."), `Update record` ("Change the values of one record."), `Delete record` ("Remove one record from a table.") — with Remix line icons and port labels matching Phase 3 exactly.
- [x] `apps/web/src/builder/variables.ts`: for an upstream data node, list the selected table's columns as pickable variables (`{{input.found.first.<columnId>}}`, `{{input.record.<columnId>}}`), the same way `identityFields` exposes identity sub-fields.
- [x] `apps/web/src/builder/use-flow-problems.ts` (and whatever calls `findFlowConfigProblems`): pass the user's tables so a missing table or column raises the canvas badge.
- [x] Fork hygiene: add `clearDataTableReferences(document)` to `packages/contracts/src/data-tables.ts` (blank `tableId` and drop column-bound rows on the four data node types) and apply it in `packages/db/src/listings.ts` `fork()` before the insert, so a forked flow never points at the publisher's tables.
- [x] AI awareness: give `systemPrompt()` in `apps/api/src/ai/generate-flow.ts` an optional table list (id, name, columns with ids and types) and pass the requesting owner's tables from the AI route; state in the prompt that data nodes may only use these ids and must never invent one. Extend the existing generated-flow validation so a proposal referencing an unknown table id is rejected and repaired like any other invalid wiring.

### Automated verification

- `bun test apps/web/src/builder` — existing node-settings, catalog and variables tests plus new cases for the two field kinds.
- `bun test packages/contracts/src/data-tables.test.ts` — `clearDataTableReferences` empties exactly the four node types and leaves other nodes untouched.
- `bun test apps/api/src/ai` — the prompt carries the table list and an unknown table id is rejected.

### Manual verification

- In the builder, drop a `Find records` node, pick a table from the Select, pick a column in a filter row, then delete that table in another tab and confirm the node shows the "!" badge naming the missing table.

## Phase 5 — Data workspace section

### Tasks

- [x] `apps/web/src/data/server.ts` (`"server-only"`, `sessionToken()`, `DataApiError`, `redirect("/login")` on 401) and `apps/web/src/data/client.ts` for dialog mutations, both following `apps/web/src/flows/server.ts` / `client.ts`.
- [x] Add `{ href: "/data", label: "Data", icon: RiTableLine }` to `pages` in `apps/web/src/components/workspace-shell.tsx`, between Runs and Marketplace.
- [x] `apps/web/src/app/(workspace)/data/page.tsx`: server component listing tables inside `WorkspacePage` + `WorkspaceBreadcrumbs current="Data"`, with a client `data-browser.tsx` modelled on `flow-browser.tsx` (search + sort in local state). Empty state uses `EmptyStateIllustration` plus a single "Create a table" action — no start-card grid, since CSV and templates are out of scope.
- [x] "New table" dialog modelled on `publish-dialog.tsx` (`pending` ref + `busy` state, `onOpenChange` cancel while pending, inline validation): name, optional description, and the column editor.
- [x] Column editor: the extracted `ArrayField` over a column schema — name, type Select, required switch, and an options list shown only for `select`. Adding a column mints a stable id; renaming never changes it; the type Select is disabled with an explanatory hint when the table already has records.
- [x] `apps/web/src/app/(workspace)/data/[tableId]/page.tsx`: server component with a `cache()`-wrapped loader, `notFound()` when missing, breadcrumbs `parents={[{label:"Data", href:"/data"}]}`, a records table (semantic `<table>` reusing `flows.module.css`), server-rendered keyset paging through `searchParams.cursor` exactly as `/runs` does, and "Edit columns" / "Delete table" actions.
- [x] Record dialog: create and edit a record with fields generated from the column schema through the extracted schema-form — text input, number input, switch, datetime input, select, address input with the format hint. Delete asks for confirmation.
- [x] Delete-table confirmation lists the flows that reference the table, from the Phase 2 response, and only then calls the confirming request.
- [x] Error handling matches the section conventions: a fatal failure throws `DataApiError` into the route-group `error.tsx`; a records-only failure renders the `<form action="/data/…" method="get">` "Try again" panel used by `wallet-transactions.tsx`.

### Automated verification

- `bun test apps/web/src/data` — server/client modules map statuses and errors as specified.
- `bun run --cwd apps/web build` — the new routes compile.

### Manual verification

- Walk the whole section in the browser at 1440 px and at 390 px: create a table with one column of each type, add a record, edit it, delete it, page through 30+ records, delete the table from a flow that uses it and read the warning.

## Phase 6 — Verification and documentation

### Tasks

- [x] `apps/web/e2e/data.e2e.ts` following `workspace.e2e.ts`: seed a table and records through direct API calls with the e2e token, then drive create-table → add column → add record → edit → page → delete through role-based locators, and assert the empty state.
- [x] Add `/data` to the signed-out redirect loop in `apps/web/e2e/workspace.e2e.ts`.
- [x] One end-to-end flow check in the same suite: build a flow with `trigger.manual` → `data.create-record`, simulate it and assert no record was created, run it live and assert exactly one.
- [x] Update `docs/architecture.md`: the data tables/records store, the `data` seam on the engine alongside `chain`, and the `/data` section. Grounded in what was built, nothing more.
- [x] Run the full verification set and report what passed and what stayed unverified.

### Automated verification

- `bun run lint` · `bun run typecheck` · `TEST_DATABASE_URL=… bun run test` · `bun run build` · `bun run format:check` — all pass.
- `bun run --cwd apps/web e2e` — the new spec and the amended workspace spec pass.

### Manual verification

- Read `docs/architecture.md` against the shipped code and confirm every sentence about data is true of the merged tree.

## Outcome — 2026-09-08

Built in one session by parallel agents, reviewed independently, fixed, and verified. Left **uncommitted** pending the user's approval.

**Verification on the final tree**

- `bun run lint` — 12/12 tasks · `bun run typecheck` — 10/10 · `bun run format:check` — clean, 662 files
- `TEST_DATABASE_URL=postgres://localhost:5432/automator_test bun run test` — 18/18 tasks, 0 failures (contracts 259, flow-engine 159, db 47 + 2 skipped no-DB sentinels, API 500, web 430, runtime 23, miniapp, api-client)
- `bun run build` — 4/4 tasks
- Playwright, full suite: **22 passed, 1 failed**. The failure is `workspace.e2e.ts:231 compact viewport › flow settings keeps Apply reachable on a small screen`, confirmed pre-existing by running that spec in a clean worktree at `663bc0f`, where it also fails. At 390 px the flow-name heading sits inside the left panel, which is hidden while the panel is closed, so the closing `expect(heading).toBeVisible()` cannot pass. Untouched by this work; needs its own decision (fix the test, or show the flow name in the canvas header on compact viewports).
- The five new `data.e2e.ts` specs pass, including "writes nothing in simulate and one record live".

**Deviations from the plan as written**

1. **Record columns are addressed under `values.`** — `{{input.found.first.values.<column>}}`, not `{{input.found.first.<column>}}`. A record is `{id, tableId, values, createdAt, updatedAt}`; flattening would let a column named `id` shadow the record id. The success criterion above was corrected to match.
2. **The column editor does not use `ArrayField`.** `ArrayField` renders every row from one schema, so it cannot disable the type control on existing columns while leaving it live on a column added in the same session. It reuses `Group` + `ConfigField` with `ArrayField`'s chrome instead. Every other form in the feature goes through the shared engine.
3. **Webhook runs also received the `data` seam** (`apps/api/src/hooks/routes.ts`). It is a live-run site the plan's list missed; without it a webhook-triggered flow with data nodes fails with "No data store is configured".
4. **`apps/web/playwright.config.ts` sets `RATE_LIMIT_DATA: "600"`** for the test API. The 30-writes-per-minute budget cannot seed the 30-record paging fixture. Test harness only; the shipped default is unchanged.

**Findings from the independent review, and what happened to them**

Fixed: filter values now go through the write path's normalization (a checksummed address or a differently-formatted datetime used to match nothing); `data.update-record` no longer fails on a record that predates a newly-required column; the column type lock can no longer be bypassed by dropping and re-adding a column while records hold values under it; column ids are minted from the finished name at save time instead of the first keystroke (which also fixes the row losing focus mid-word); `dataColumnOperators` is now load-bearing — the node settings offer only the operators a column's type supports and the executors refuse the rest; a datetime column renders a real datetime control.

Accepted as designed, not defects: a published mini-app writes records **as the flow owner** through its flow, which approved assumption 10 states explicitly — the no-go covers direct visitor access to tables, which does not exist. `is_empty` on a checkbox matches only a record with no stored value, because `false` is a value, matching the blank rules in contracts.

Accepted with a known cost: each record insert runs a `COUNT(*)` under the table row lock to enforce the 50,000 cap, so a loop writing 100 records pays it 100 times; bounded by an index scan of at most 50,000 entries. `DELETE /data/tables/:id` reads the owner's flows one by one to build `usedBy`. Both are fine at this scale and would need a cheaper probe only if the caps grow.

**Added after the plan, at the user's request:** a ninth curated example, `applicant-intake` ("Applicant intake") — form → set variable → `data.find-records` → `empty` → `data.create-record` → page, with the `found` branch greeting a returning applicant. It ships with no table selected, the way the Discord examples ship with no webhook, and its test picks a table and runs both branches against a fake provider.

**Not done:** nothing from the plan. The parked items in the approved summary (upsert, bulk update/delete in one node, AI-proposed tables, CSV, relations) remain parked by decision.
