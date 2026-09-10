# Landing page

> **Status:** implemented. `apps/landing` was scaffolded in `adbd7a8`, deployed on its own Railway service in `05f9298`, and pointed at its hosts in `ded029b`. It serves `automator.ardasari.co` on port 3004. Do not re-execute this plan.

A public marketing page for Automator at `automator.ardasari.co`, serving both the ETHOnline
jury and a developer visitor. Decided 2026-09-10.

## Why a new app

`apps/web` owns `/` as the signed-in workspace home, so the landing needs its own place. It is a
static page with no API, database or auth dependency: it must stay up and fast even when the API
is down, and it must not pull the workspace's client bundle. A separate app also keeps its Railway
build small and lets it deploy on its own watch patterns.

## The idea

Every automation tool's landing says "connect your apps and save time". Automator's real
difference is that the money is real, and you get to watch it before it moves. The page argues
**visibility**, not "you can build automations".

So the page's spine is **one real flow, shown in three states**. The same nodes stay in place as
the visitor scrolls; only their state changes:

1. **Drawn** — the flow as it is built on the canvas.
2. **Rehearsed** — the same nodes carrying dry-run badges and estimated gas, with nothing
   broadcast.
3. **Read** — the same nodes after a run: fired edges, per-node outputs, a transaction hash.

This demonstrates "simulate before it spends" and "read every run" instead of describing them.

The flow, built from node types that exist in the product (`apps/web/src/builder/catalog.ts`):

| Node | Type               | Label on the diagram   |
| ---- | ------------------ | ---------------------- |
| 1    | `trigger.schedule` | Every morning at 9:00  |
| 2    | `usdc.balance`     | Check treasury balance |
| 3    | `logic.condition`  | Below 500 USDC?        |
| 4    | `usdc.payout`      | Top up from treasury   |
| 5    | `notify.discord`   | Post to Discord        |

## The app

`apps/landing`, package `@automator/landing`. Scaffolded from `apps/ui-lab`, which is the smallest
Next app in the repo and already wires the shared design system.

- Next 16 App Router, port **3004** (`dev`, `start`), matching the 3000/3001/3002/3003 sequence.
- Dependencies: `@automator/ui`, `@remixicon/react`, `next-themes`, `motion`. Dev dependencies
  mirror `apps/ui-lab` (`@automator/tailwind-config`, `@automator/typescript-config`,
  `@tailwindcss/postcss`, `postcss`, `typescript`, types).
- No `@automator/api-client`, no `@automator/contracts`, no `@xyflow/react`, no Privy.
- Routes: `/` (the page) and `/health` (a route handler for the Railway healthcheck, like the
  other apps).
- `next.config.ts` sets `transpilePackages: ["@automator/ui"]`; `globals.css` imports the shared
  `styles.css` files and declares `@source ".."`, both copied from `apps/ui-lab`.
- `turbo.json` extends the root config with the same Next `build`/`typecheck` outputs as
  `apps/ui-lab`.

## Styling

Tailwind-first, on the shared tokens: `text-page`/`text-panel`/`text-section`/`text-body`/
`text-caption` from `packages/tailwind-config/typography.css`, the colour tokens from
`colors.css`, and `@automator/ui` primitives (`Button`, `Badge`, `Separator`, `Logo`) for anything
that already exists.

CSS modules are used only where Tailwind expresses the intent badly — layered
`linear-gradient` + `mask-image` backgrounds, pseudo-elements and keyframes — which is exactly
what the modules in `apps/web` carry. Expect at most one, for the hero background.

This matches `packages/ui`, which is entirely Tailwind utilities through `cva` and contains no CSS
module.

## The flow diagram

Built inside the landing from `div`s and one `<svg>` for the edges — **not** React Flow. Reasons:
it stays crisp in both themes, reflows on a phone, animates cheaply, and keeps canvas
dependencies out of the app. Node cards reuse the product's own labels and Remix icons
(`RiTimeLine`, `RiWallet3Line`, `RiGitBranchLine`, `RiSendPlaneLine`, `RiDiscordLine`) so the page
and the product look like the same thing.

The three states are the same component with a `state` prop. Motion drives the edge draw-in and
the state changes on scroll, gated behind `prefers-reduced-motion` — the pattern
`apps/web/src/auth/auth-background.tsx` already uses.

## Sections

1. **Nav** — logo, section anchors, theme select, `Open app` → `https://app.automator.ardasari.co`.
2. **Hero** — headline in the _visibility_ register ("See what it will do before it does it"),
   a subhead naming draw-or-describe / rehearse / read, two CTAs (`Open app`, `Watch the demo`),
   the flow diagram in its **drawn** state over a layered gradient-and-mask background in the
   blue register the sign-in screen already uses. The background is CSS, not a WebGL shader:
   the landing must not carry `@paper-design/shaders-react` or pay its cost on first paint.
3. **Rehearse** — the diagram in its **rehearsed** state: dry-run badges, estimated gas, "nothing
   was broadcast".
4. **Read** — the diagram in its **read** state next to a real screenshot of the run panel, with
   per-node outputs and a transaction hash.
5. **Describe it instead** — the AI composer: a sentence becomes a flow, validated and test-run by
   the API before it can be applied.
6. **Triggers** — webhook, schedule, price and balance watchers, in one compact row.
7. **Ship it** — publish a flow as a mini-app link with login and World ID screens.
8. **Built with** — World ID, Chainlink, The Graph, Privy, Circle USDC, Base, OpenRouter, each
   with one line on where it is actually used. This is the section the jury reads.
9. **Closing CTA + footer** — demo video, GitHub, ETHOnline submission.

Copy is English, in the register the README already uses.

## Assets

`docs/media/` is empty, so no screenshot exists yet. The run-panel screenshot for section 4 is
captured locally against a real run and committed under `apps/landing/public/`. Everything else is
drawn in the page, so the flow diagram needs no asset.

The demo video and the ETHOnline submission link do not exist yet; both are placeholders the page
is built to accept.

## Domain and deploy

`automator.ardasari.co` does not resolve today and no Railway service carries a custom domain, so
nothing is being migrated:

| Host                        | Service |
| --------------------------- | ------- |
| `automator.ardasari.co`     | landing |
| `app.automator.ardasari.co` | web     |
| `run.automator.ardasari.co` | runtime |

Each is a Railway custom domain with a **DNS-only** CNAME in Cloudflare. The records stay
unproxied because Cloudflare's free universal certificate covers only one label
(`*.ardasari.co`), so the third-level hosts take their certificate from Railway. The
`ardasari.co` apex and `www` (Vercel, a personal site) are not touched.

`.railway/railway.ts` gains a `landing` service: GitHub source on `main`, RAILPACK,
`bun run build --filter=@automator/landing`, `bun run --filter @automator/landing start`,
healthcheck `/health`, `PORT` 3004, one `sfo` replica, and watch patterns covering
`/apps/landing/**`, `packages/ui`, `packages/tailwind-config`, `packages/typescript-config`, the
root manifests and `/.railway/**`.

Giving `web` and `runtime` real hosts changes two variables in the same file:
`web.NEXT_PUBLIC_RUNTIME_URL` → `https://run.automator.ardasari.co`, and `runtime.WEB_URL` →
`https://app.automator.ardasari.co`.

## Follow-ups that need the account owner

These are done by Arda in the respective dashboards, not by an agent:

- Privy: add the new web origin to the app's allowed origins and login redirect URIs.
- World developer portal: point the mini-app's URLs at `run.automator.ardasari.co`.
- README: replace the dead `automator.ardasari.co` app link with the landing, and add the app
  link.

## Verification

No new test infrastructure — the page is static and carries no logic worth a unit test. The
checks are the repository's own: `bun run lint`, `bun run typecheck`, `bun run build`,
`bun run format:check`, plus a browser pass on `localhost:3004` covering light and dark themes,
a 400 px viewport, and `prefers-reduced-motion`.

## Not doing

- No blog, docs site, pricing page, or changelog.
- No analytics, cookie banner or consent tooling.
- No newsletter capture or any form: the page has no backend.
- No user publishing or listing of flows — the marketplace stays curated inside the app.
