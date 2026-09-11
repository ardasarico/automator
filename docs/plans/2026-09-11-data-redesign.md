# Data section redesign (second pass)

**Goal:** Make `/data` navigate like the rest of the workspace and make the record grid read and
behave like a real data grid — one shared table grammar across Flows, Runs and Data, a grid that
carries selection and column management, and cells that show their type.

**Why again:** the 2026-09-09 pass (`docs/plans/2026-09-09-workspace-redesign.md` tasks 14–18) gave
Data a second navigation rail beside the workspace sidebar, and the rail's table list duplicated the
card gallery at `/data`. Arda's complaints on 2026-09-11: information architecture, the grid itself,
and visual parity with the rest of the workspace.

**Measured parity gap:** `flows.module.css`, `runs.module.css` and `data.module.css` each carry their
own table. Flows and Runs share one grammar (`border-collapse: separate`, 12/16 padding, `--muted`
sticky header with `box-shadow: 0 1px var(--border)`, row hover, `aria-current` on the open row).
Data's grid diverges on every one of those: `border-collapse: collapse`, 6/12 padding, a
`--background` header, no row hover, no edge padding. Runs' column header carries `data-active` /
`data-filtered`; Data's does not, so a filtered column is invisible in the grid.

## Decisions (Arda, 2026-09-11)

- Navigation: **hierarchical + table switcher**. The second rail goes; `/data` is the index;
  the table name in the title bar opens a switcher. Rejected: keeping the rail (two rails),
  tables as tabs (breaks past ~10 tables), rail plus an overview screen.
- Record editing (panel, dialogs, column editor) is **not** in scope — Arda excluded it.
- Out of scope, offered and declined: keyboard cell-to-cell navigation (roving tabindex), and
  "used by N flows" on the index cards (`FlowSummary` carries no graph — `outline` has node types
  only — so it needs a new contract field and a JSONB query).

## Global constraints

- Run every command from the repository root. `bun run lint` is `oxlint --deny-warnings`; format
  with `bun run format` (**oxfmt**, never prettier).
- Icons from `@remixicon/react`, line variants only.
- No API or contract change. Bulk delete uses the existing per-record `DELETE`; hidden columns and
  column widths are per-viewer preferences in `localStorage`.
- Keep everything uncommitted until Arda asks for a commit.

---

## Spec

### A. Information architecture

```
┌─sidebar─┬──────────────────────────────────────────┐
│ Home    │ Data ›  Applicants ▾        [⋯] [+ Add]  │  title bar: breadcrumb + switcher
│ Flows   ├──────────────────────────────────────────┤
│ Runs    │ status is open ✕   Sorted by name ✕      │  toolbar: chips only
│ ▸ Data  ├──────────────────────────────────────────┤
│ Conn.   │ ☐ │ name    email    status   …   │  +   │  grid, full width
│ Wallet  │ 1 │ Ada     a@…      open            ⤢   │
│         ├──────────────────────────────────────────┤
│         │ 24 records                  Older ›      │  grid footer
└─────────┴──────────────────────────────────────────┘
```

- `table-rail.tsx`, its tests, the `.rail*` / `.split` / `.main` rules and `DATA_RAIL_COOKIE` are
  removed. `data/layout.tsx` keeps only the `@panel` parallel route composition.
- The table name in `PageFrame`'s `title` renders a `Menu` of every table plus "New table". The
  breadcrumb "Data ›" stays, so the section is a hierarchy and not a tab strip.
- `/data` stays the schema-led card gallery (search + sort), now the only table list.

### B. Shared table grammar

`apps/web/src/components/workspace-table.module.css` holds the grammar Flows and Runs already
share, including the heading control with its `data-active` / `data-filtered` states. Flows, Runs
and Data compose it and keep only their own column proportions in their own modules. (A shared
heading _component_ was considered and dropped — see the outcome below.)

### C. Grid

1. **Selection gutter.** The gutter shows the row number, and a checkbox on hover or when selected.
   A selection bar replaces the toolbar while rows are selected: "N records selected · Delete".
   Delete issues one `DELETE` per record, reports partial failure by count, and refreshes.
2. **Column management in the grid.** A trailing `+` header opens the column editor on a new column.
   The header menu gains Rename…, Hide and Delete… beside sort and filter. Hidden columns and widths
   persist per table in `localStorage`; a "N hidden" chip in the toolbar restores them.
3. **Widths.** The grid is `table-layout: fixed`: every column carries a width — the one this
   viewer dragged, or the default for its type and name — the trailing column takes the slack, and
   text truncates at its own column rather than at a fixed 40ch. A drag handle on each heading's
   edge sets a width, and the handle is a `separator` the arrow keys move.
4. **Cells.** `checkbox` renders a real box, single `select` a badge; `address`, `datetime` and
   `number` keep what they have.
5. **Footer.** One footer strip carries the count, the "first 100 matches" sentence and the paging
   controls. The toolbar is left to filter and sort chips.
6. **Density.** Data is deliberately tighter than Runs: 8px block padding (≈32px rows),
   `--text-caption`. The first column is sticky while the grid scrolls sideways.

---

## Tasks

- [x] 1. Extract `workspace-table.module.css`; migrate Runs and Flows onto it with their tests
      still green.
- [x] 2. Remove the rail; add the title-bar table switcher; simplify `data/layout.tsx` and the CSS.
- [x] 3. Move Data's grid onto the shared grammar (hover, sticky header, `aria-current`, density,
      sticky first column).
- [x] 4. Selection gutter + selection bar + bulk delete.
- [x] 5. Column header menu (rename/hide/delete), trailing `+`, hidden-column chip, width drag,
      `localStorage` preferences.
- [x] 6. Cell renderers: checkbox box, select badge, column-width truncation.
- [x] 7. Grid footer strip; toolbar reduced to chips.
- [x] 8. Verify.

---

## Outcome

Built on 2026-09-11 and shipped the same day: `7d14cbc` carries the shared table grammar and
`7906c47` the redesign itself. Railway deployed `web` alone — no other service's watch paths were
touched.

**Deviations, and why:**

1. **The shared piece is the CSS, not a component.** Runs' column heading is link-based so the list
   stays server-rendered; Data's is callback-based. One component over both would have been an
   abstraction with two implementations inside it, so `workspace-table.module.css` holds the
   grammar (table, sticky header, row states, the heading control, the menu choice) and each
   section composes it with `composes:` and keeps its own proportions. `panel-split.module.css`
   came out of the same pass: Data's `.split`/`.main` were a copy of Runs'.
2. **Row hover is opt-in** (`.hoverRows` on the `tbody`). Flows' rows hold three separate targets,
   so a row-wide highlight there would promise a click the row does not have.
3. **The grid is its own scroll pane.** Letting the frame's content region scroll sideways carried
   the footer and the table description off to the left with the table, and a header sticky
   against that region cannot hold when the grid is what moves. The records now fill the pane,
   the grid scrolls on both axes inside it, and the footer keeps its place. A consequence worth
   knowing: `/data/<table>` no longer scrolls the page itself.
4. **The expand control moved into the name cell**, not a trailing column, so it stays reachable
   while the grid is scrolled sideways and the trailing column is free to be the `+`.
5. **Default widths fit the column's own name** (`76 + name.length * 8`, capped at 320), measured
   in characters rather than pixels. Without it "Verified" truncated in its own heading at the
   checkbox column's default width.
6. **Preferences read through `useSyncExternalStore`.** `localStorage` is an external store; an
   effect that called `setState` tripped `react(set-state-in-effect)`, and the server snapshot is
   what keeps the first client paint identical to the server's markup.
7. `Edit columns` left the title bar for the ⋯ menu: columns are now managed from the headings and
   the trailing `+`, so a button for the dialog no longer earns a place in the primary row.

**Two traps worth remembering:**

- `position: relative` on a heading cell silently un-sticks it. The resizer anchors against the
  sticky cell itself — a sticky element is a positioned element.
- A negative inline-start margin on a control inside `PageFrame`'s `h1` comes off the heading's own
  width, so the name truncated six pixels early with the whole title bar free.

**Verified:** `bun run lint`, `bun run typecheck`, `bun run test` (919 web tests, 0 failures — the
Data section's own went 50 → 59: the rail took six with it and fifteen arrived), `bun run build`,
`bun run format:check` all green. `e2e/data.e2e.ts` 8/8 green, including three new specs
(the switcher without a reload, selection with bulk delete, hiding a column from its heading).
Verification ran on an isolated config (`playwright.verify.config.ts`, ports 3120/3121, its own
Next dist dir and database) because another session held the shared dev-server lock — `next dev`
refuses a second server for the same project directory whatever port it is given.

**Two e2e failures left standing**, both outside this work and in files another session is editing
in this shared tree (`apps/web/src/builder/responsive-panels.tsx`, `right-panels.tsx`,
`flow-builder.tsx` were all modified by it while this ran): `builder-panels.e2e.ts:57` (Use as API
snippets) and `responsive-canvas.e2e.ts:7` at both widths. The specs covering the tables this work
touched pass: `workspace.e2e.ts:53` (the Flows table) and `:156` (every cell of a run row).

**Not fixed, pre-existing:** below ~500px the workspace sidebar keeps its 240px and the page title
truncates to nothing. `/flows` does the same at the same width, so it is the shell's, not this
work's.
