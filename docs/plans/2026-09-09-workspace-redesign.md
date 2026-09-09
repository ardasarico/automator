# Workspace redesign — decisions

2026-09-09. Everything outside the flow canvas is being rebuilt. The canvas and
the builder layout stay as they are; they are the quality bar the rest has to
meet. Scope widened on 2026-09-09: nothing is off the table any more, including
the canvas, but each step is shown and approved before the next one starts.

The problem is structural, not a list of defects: today every workspace page
improvises inside `max-w-[1440px] px-4 pt-2` with a small `h1`, and the sidebar
carries chat-app proportions inherited from `arda.chat` (260 px, 44 px rows,
24 px icons). The builder is a full-bleed, dense, panel-based application. The
two do not read as one product.

Visual design of each screen is settled at implementation time, screen by
screen. What follows is structure, not styling.

## Colour

The neutrals keep hue 220 but carry 45% of their previous chroma — `neutral-500`
moves from 0.008 to 0.0036. Lightness is untouched, so every measured contrast
ratio holds; the UI Lab tokens page confirms it in both themes. Pure grey was
rejected as flat, the old ramp as visibly blue.

The accent retreats to a marker. The blue ramp drops to 60% of its chroma
(`blue-300` 0.147 → 0.0882), and the primary stops being blue at all: `--primary`
and `--sidebar-primary` alias `neutral-800`, their foregrounds `neutral-50`, so
the main button is near-black in light and near-white in dark and flips with the
theme on its own. Blue survives in links, focus rings, info and `chart-1`.
Status colours keep their chroma — they carry meaning. Measured after the change:
primary/primary-foreground 16.99:1 light, 15.49:1 dark; every other pair still
clears its threshold.

Corners lose half their radius, capped where it matters: `--radius-*` is
overridden once in `packages/tailwind-config/styles.css` as 1 · 2 · 3 · 4 · 6 ·
8 px (12 and 16 for the two unused larger steps), so the ~100 `rounded-*` call
sites stay untouched and `rounded-full` is unaffected. Buttons, inputs, cards and
canvas nodes all land on 4 px. Full square was rejected: it gives the canvas a
spreadsheet feel.

Tokens are mirrored into Figma as an 83-variable `Color` collection with Light
and Dark modes — primitives as ramps, semantics aliasing them, alpha tokens as
literals — plus a swatch sheet bound to those variables. Each variable carries
its CSS custom property as WEB code syntax.

## Shell

An application shell, not a document page. The 1440 px cap is gone; content
fills the viewport and lists scroll inside their own region.

- **Sidebar (built):** labelled and grouped, 240 px, collapsing to a 52 px icon
  rail with tooltips. The existing behaviour is kept — width spring,
  `Cmd/Ctrl+Shift+S`, cookie-restored state, reduced motion — and the proportions
  become 36 px rows, 20 px icons, 16 px labels, 12 px band labels. The selected
  row uses `--sidebar-accent`, repointed at `neutral-300` so it stops glowing in
  dark; the logo mark uses a new `--brand` token, because `--primary` is now
  monochrome.
- **Nothing moves when it collapses.** Every mark, icon and avatar is centred on
  x = 26 px, the centre of the rail: 8 px of nav padding plus 8 px of row padding
  against a 20 px icon, and 16 px of header padding against the 20 px mark. Band
  labels keep their row height while collapsed, so the icons hold their vertical
  positions too. Collapsing only takes width away from labels.
- **Top of the sidebar:** the brand row is 48 px and sits on the page heading's
  line. There is no search row — `⌘K` opens the command menu from anywhere.
- **One live number:** failed runs since midnight, on Runs. The layout reads a
  single page of failed runs and counts today's; an unreachable API just leaves
  the badge off. Settings and the account menu sit under a rule at the bottom.

## Information architecture

Nine destinations: eight in three bands, plus Settings beside the account menu
at the foot.

```
WORKSPACE   Home · Flows · Runs
RESOURCES   Data · Connections · Wallet
SHARE       Mini-apps · Marketplace
(foot)      Settings · account
```

Four are new, and all four are routed with placeholders until their own tasks
land:

- **Home** — the prompt-first entry page. Today it carries the route and the
  entry points that already exist.
- **Connections** — secrets and connected apps, to be moved out of the settings
  dialog. Existing APIs cover it.
- **Mini-apps** — flows shared as mini-apps, with their links and recent sessions.
  Needs one read endpoint.
- **Settings** — the dialog becomes a page once Connections has taken the secrets
  and connected apps out of it. Until then the dialog stays reachable from the
  account menu, so the two overlap on purpose.

`/` stops redirecting to `/flows` and becomes Home.

**Considered and left out.** Triggers — every armed webhook, schedule and watch
in one list — was the strongest candidate and needs a single `GET /triggers`;
worth revisiting. Contracts needs a new table and API. Approvals, Agents,
Scenarios and Audit log stay deferred as engine work.

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

Comparisons live in `apps/ui-lab/src/app/patterns/**` and are deleted as the
real thing lands — the colour and radius one already is, since both decisions
are in the tokens now. Judge each step in UI Lab before it reaches the app.
