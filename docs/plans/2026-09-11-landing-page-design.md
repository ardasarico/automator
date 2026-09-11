# Landing page design

> **Status:** in progress. Hero, "What you build" and "A canvas that runs" are on main (82c9ee1);
> the statement band, the features grid and the footer are on the page, uncommitted; "Built
> with" is not, and Arda wants one more section before the footer. This supersedes the section list and
> the shader ban in `2026-09-10-landing-page.md`; the app, hosting and deploy parts of that plan
> stand.

Decided with Arda on 2026-09-10 and 2026-09-11, section by section, in the browser
(`localhost:3004`, feedback through Agentation).

## Positioning

The page is a product page first; jury evidence sits lower. The product is two things on one
canvas — automations that run on a trigger, and mini-apps people open with a link — plus a third
door, endpoints and MCP tools. The hero says the README's own line.

## Page order

1. **Hero** — done. Lovable-style: the workspace home's WebThreads shader behind a single
   headline and the prompt box. No subhead, no example chips. The prompt hands off to
   `app.automator.ardasari.co/?prompt=…` (`NEXT_PUBLIC_APP_URL`); nothing is drafted on the
   landing. Fixed island nav: coloured logo mark, GitHub / X (follow intent) / ETHGlobal links, primary
   `Open the app`.
2. **What you build** (`#build`) — done. Three columns, no cards, hairline dividers, illustration
   on top, title + one line under it, one accent per column (`--brand`, `--success`,
   `--warning`). Illustrations are drawn in the product's own node-card language
   (`apps/web/src/builder/flow-node.tsx`): a three-node vertical canvas whose run passes through
   with the product's status pills; a phone paging sideways through sign-in / World ID / pay with
   a three-step bar and a congratulations screen; a segmented HTTPS / MCP / Agent panel whose
   indicator and panes slide.
3. **Features** (`#features`) — done. The canvas section's three feature lines at six and a size
   up: a 3×2 grid with hairlines between cells, coloured line icon, title, one sentence. Triggers,
   AI agents, Onchain actions, Data tables, Versions, Secrets and guardrails; the same three
   `--chart-*` accents cycled. Heading "Everything a flow needs, on the canvas." with the subline
   "What starts a flow, what it can touch, and what keeps it in check."
4. **Statement** — done. One sentence between the features grid and the canvas, centred at
   heading size, edge to edge on a ground darker than either theme's page (`oklch(0.11 0.003 220)`, no token): "Every automation signs on your behalf. This one
   shows its work first." The two verbs are the product's status pills (quill on `--warning`,
   eye on `--success`). Chosen over a scroll-lit block and a two-clause centred version, and
   over three other sentences. The band carries the `dark` class and names its text colour by
   palette step, because semantic tokens such as `--foreground` resolve once at the root and do
   not re-scope.
5. **A canvas that runs** (`#canvas`) — done. Only the canvas: a fixed 1056px stage scaled to the
   container (`scale(tan(atan2(100cqw, …)))`) so it never overflows, framed by a `foreground/12`
   hairline and no shadow; four uniform node cards on
   one line with straight edges, a `False` branch to a `Post to Discord` node that goes
   `skipped`; a 14s run clock. Under it three feature lines with coloured inline icons and
   dividers: Describe it · Simulate first · Read every run. These replace the separate
   "Describe" and "Rehearse/Read" sections.
6. **Built with** (`#built-with`) — open. Seven directions were rejected: card grid with node-id
   chips, a row of names, partners annotated on a flow, a ledger table, bento cards with live
   proofs, the receipt of one run, catalog tiles. Arda wants something more creative; the next
   session starts by asking what the section is for and what it should feel like before drawing
   again. Partners and where they live: Privy (`privy.*`), World (`world.*`), The Graph
   (`graph.query-subgraph`, agent tool), Circle USDC (`usdc.*`), Base (`onchain.*`), OpenRouter
   (`ai.*`).
7. **Footer** — done, deliberately small: one hairline, the logo, "Built at ETHOnline 2026.",
   GitHub and ETHGlobal showcase links, `Open the app`, the theme toggle (the workspace's,
   repeated in `footer/theme-toggle.tsx` because the landing cannot import from `apps/web`).
   No separate closing CTA. A demo video link is added once the video exists.

Dropped: the technology marquee under the hero, the examples section, the triggers row.

## Rules that came out of the work

- Every animation runs on one shared clock per illustration, generated as per-element keyframes
  (`apps/landing/src/app/globals.css`, python-generated blocks) so the whole scene resets
  together; per-element `animation-delay` on a shared keyframe drifts. Everything stops under
  `prefers-reduced-motion`.
- Illustrations copy the product's real chrome (node bars, category colours from `--chart-*`,
  handles, status pills, the canvas dots) rather than inventing a style.
- Content sections breathe `py-24 md:py-32`; the statement band uses the same inside its ground.
- Layouts are computed from a grid (`col(i)`, `rowY`), not hand-placed, so they stay symmetric.
- Tailwind only; the one exception is the vendored shader's own stylesheet.
- The landing may carry the WebThreads shader (`ogl`) after all; it mounts one frame after
  first paint and never under reduced motion. Agentation is loaded in development only.

## Files

`apps/landing/src/hero/{backdrop,prompt}.tsx`, `nav.tsx`, `app-url.ts`, `container.ts`,
`build/{illustrations,what-you-build,features,canvas-section}.tsx`, `statement/statement.tsx`,
`footer/{footer,theme-toggle}.tsx`,
`vendor/web-threads/`,
`components/agentation-toolbar.tsx`, `app/globals.css`.

## Verification

`bun run --filter=@automator/landing lint | typecheck | build` and `bun run format:check` pass
as of the end of the 2026-09-11 session. No unit tests: the page is presentation. The statement,
the features grid and the footer were checked in both themes and at 400px; the rest of the page is not yet checked in the light theme,
at 400px, or under reduced motion.
