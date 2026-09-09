# Workspace redesign — decisions

2026-09-09. Everything outside the flow canvas is being rebuilt. The canvas and
the builder layout stay as they are; they are the quality bar the rest has to
meet. The colour tokens stay too, with room for small adjustments later.

The problem is structural, not a list of defects: today every workspace page
improvises inside `max-w-[1440px] px-4 pt-2` with a small `h1`, and the sidebar
carries chat-app proportions inherited from `arda.chat` (260 px, 44 px rows,
24 px icons). The builder is a full-bleed, dense, panel-based application. The
two do not read as one product.

Visual design of each screen is settled at implementation time, screen by
screen. What follows is structure, not styling.

## Shell

An application shell, not a document page. The 1440 px cap is gone; content
fills the viewport and lists scroll inside their own region.

- **Sidebar:** labelled and grouped, ~208 px, collapsing to a ~52 px icon rail
  with tooltips. The existing behaviour is kept — width spring, `Cmd/Ctrl+Shift+S`,
  cookie-restored state, reduced-motion handling — only the proportions change:
  32 px rows, 16 px icons, 13 px labels.
- **Top of the sidebar:** a workspace row and a `⌘K` search row. Account menu
  stays at the bottom.

## Information architecture

Eight destinations in three bands:

```
Home · Flows · Runs
RESOURCES   Data · Contracts · Connections · Wallet
LIBRARY     Marketplace
```

Two are new:

- **Connections** — secrets and connected apps, moved out of the settings dialog
  onto their own page. Existing APIs cover it.
- **Contracts** — labelled contracts and addresses with their chain and ABI, so
  flows reference "Treasury" or "USDC (Base)" instead of a pasted `0x…`. A small
  new entity.

`/` stops redirecting to `/flows` and becomes Home.

## Page frame

One continuous surface with the page's own gutter; **no rule reaches the edge**.

- A 48 px title bar: `h1`, search, primary action.
- A 44 px toolbar: filters, view toggle.
- Content below with a 24 px gutter; row rules and column headers stop at the
  same line as the bars above them.

## Flows

- **Default view:** cards carrying a miniature of the flow's real shape, derived
  from the stored node positions — so every card is distinguishable instead of
  repeating one generic glyph. Name, state, last run, trigger.
- **Second view:** a table, kept as a toggle. Columns carry the trigger's detail
  ("Every Monday, 09:00", "ETH/USD below 2,000"), last run with its outcome, and
  node count.

## Runs

- The list stays full width; a run opens in a **~420 px side panel** on the
  right, closed with Escape. The same panel component serves Data records and
  Marketplace listings.
- The panel shows the step list and step outputs. **No canvas in the panel** — a
  plain link to the flow is enough.

## Home

A prompt-first entry page, in the shape of v0 / Lovable, over a dashboard.

- **Top:** a centred prompt (max 640 px) — heading, textarea, model name, send,
  and a few example prompts. Submitting drafts a flow.
- **Below:** a full-width chart, then a two-column row — stat tiles on the left,
  recent runs table on the right.
- Charts come from **Dither Kit**.

## Charts

Dither Kit is vendored into `packages/ui/src/dither-kit/`, alongside the avatar
the repo already took from the same source, and exported as
`@automator/ui/dither-chart`. It ships no npm dependencies of its own; the chart
pack added `d3-scale`, `d3-shape` and `motion`.

Two local adaptations: the registry's duplicate `cn` re-exports the package's
own, and a dev-only warning that read `process.env` was removed because
`typescript-config/react.json` deliberately excludes node types.

Open before the charts ship:

- Cap bars at 24 px instead of filling the slot.
- A 2 px surface gap between stacked segments.
- Re-seed the dither palette from `--success` / `--destructive` / `--chart-*` so
  light mode is right; today it carries the kit's fixed RGB seeds.

## Not in this redesign

Considered and deferred, each because it needs engine work rather than
interface work: **Approvals / Inbox** (a pause-for-human node plus a waiting run
state), **Agents** as first-class objects, **Scenarios / Tests**, **Simulations**,
**Audit log**. Worth revisiting once the interface has settled.

Address book, chains and notification routing are sections inside Connections
or settings, not pages.

## Still to design

Data, Contracts, Connections, Wallet, Marketplace, empty states, onboarding and
login, the settings dialog, and narrow-viewport behaviour — which
`docs/web-ui.md` still records as out of scope.

## Working notes

`apps/ui-lab/src/app/patterns/**` holds the throwaway comparisons behind these
decisions (sidebar, page frame, flow list, runs, home). Each one is deleted as
the real screen lands.
