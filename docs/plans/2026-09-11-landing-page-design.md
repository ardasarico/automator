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
   again. On 2026-09-11 three more were drawn on a throwaway `/preview` route and rejected too:
   the run panel walking one run ("Proof"), five strata bands with node cards ("Map"), and six
   verb-pill sentences ("Feeling"); do not redraw those. Partners and where they live: Privy (`privy.*`), World (`world.*`), The Graph
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

## Metadata

`apps/landing/src/app/layout.tsx` carries the title, description, canonical, the icon set copied
from `apps/web/public/meta`, and Open Graph / Twitter cards pointing at `public/meta/og.png`
(1200×630). The card is a static PNG: it was screenshotted with Playwright from a throwaway
`/og` route drawn with the page's own tokens (statement ground, dot grid, the wordmark, the hero
line, the three canvas feature marks), so it needs no build-time font fetching; redraw the route
and re-screenshot when the hero line changes. `robots.ts` allows everything but `/health`;
`sitemap.ts` lists the one page.

## Files

`apps/landing/src/hero/{backdrop,prompt}.tsx`, `nav.tsx`, `app-url.ts`, `container.ts`,
`build/{illustrations,what-you-build,features,canvas-section}.tsx`, `statement/statement.tsx`,
`footer/{footer,theme-toggle}.tsx`,
`vendor/web-threads/`,
`components/agentation-toolbar.tsx`, `app/globals.css`.

## Verification

`bun run --filter=@automator/landing lint | typecheck | build` and `bun run format:check` pass
as of the end of the 2026-09-11 session. No unit tests: the page is presentation.

### Browser pass 2026-09-11

Playwright headless, full page at 1280 and 400 wide, light and dark as the system scheme, the
footer toggle in both directions, `prefers-reduced-motion`, frames a few seconds apart, the
prompt hand-off on a phone, and the console. No horizontal scroll
at 400 (`scrollWidth` is 400); the console carries only WebGL performance notices from the shader.
Four defects, all fixed:

- **Light theme:** the mini-app button label was `text-background`, near-white on the bright
  green; it is now the dark page's ink mixed with the accent, in both themes
  (`build/illustrations.tsx`).
- **Footer toggle:** switching themes on the page left the shader on the previous theme's
  ground, so the headline sat on a black field in light. The backdrop read the tokens from
  `useTheme`, a render before next-themes writes the class; it now reads the scheme off the root
  class through a MutationObserver (`hero/backdrop.tsx`).
- **Reduced motion:** the phone's tap ripples rested opaque over the button labels; they now
  rest at opacity 0. The phone rested on the first screen with all three step bars full; it now
  rests on the last screen with the tick drawn. The segmented control's slider rested on HTTPS
  with the label still muted; the first label now reads as current (`app/globals.css`).

Left as designed: the canvas mock scales to 352px on a phone, so its card text is about 4px; the
hero is a plain field under reduced motion because the shader never mounts.
