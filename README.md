![Automator](/github-banner.png)

# Automator

Automator makes onchain automation visible: build a flow from nodes or from a sentence, dry-run it before it spends anything, publish it as a link, and read every run step by step. Built for ETHOnline 2026.

<!-- TODO: link the demo video and the ETHOnline submission once they exist. -->

[Live app](https://automator.ardasari.co) · Demo video · ETHOnline submission

## How it works

1. **Design** — drag nodes onto the canvas and wire them, or describe the flow and let the AI composer draft it.
2. **Simulate** — run it on the canvas with onchain calls in dry-run mode and screens answered for you.
3. **Run and inspect** — activate a trigger, then read the run node by node, with every output kept and an explanation when one fails.

<!-- TODO: replace with a screenshot of a flow open in the builder. -->

![A flow on the Automator canvas](docs/media/flow-canvas.png)

_A flow is built, simulated, and inspected on the same canvas._

## Features

- **Visual builder** — logic, screen, AI, and onchain nodes on a React Flow canvas, with undo, saved versions, and validation before a run.
- **AI composer** — describe a flow and the model proposes one; the API validates it and test-runs it against sample scenarios before you can apply it.
- **Simulation** — dry-run mode simulates each onchain write as your wallet, reporting gas and decoded reverts without broadcasting.
- **Triggers** — webhook, schedule, onchain event, and price or balance watchers run an activated flow on their own.
- **Mini-apps** — publish a flow as a link visitors open, with Privy login and World ID verification screens.
- **Run history** — every run is stored with its trigger, per-node outputs, and transaction hashes.

## Built with

Bun, Turborepo, Next.js App Router, Elysia, and Postgres. React Flow for the canvas, Coss and Tailwind for the interface, Privy for accounts and embedded-wallet signing, viem for chain access on Base Sepolia and World Chain Sepolia with Circle's testnet USDC, World ID for proof-of-human screens, Chainlink feeds and The Graph's Token API for watch triggers, OpenRouter with an OpenAI fallback for AI nodes, and Railway for deploys.

## Getting started

Bun 1.3.13 and Node 22 or newer.

```
bun install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/runtime/.env.example apps/runtime/.env.local
bun run dev
```

Web runs on 3000, the API on 3001, the runtime on 3002, and UI Lab on 3003; `bun run dev --filter=@automator/web` starts a single app.

The API needs `DATABASE_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, and `SECRETS_KEY`; the web app needs `NEXT_PUBLIC_PRIVY_APP_ID`. Keys for AI, World ID, The Graph, and server-side signing are optional — without them those nodes fail their run as unconfigured and the rest of the app works. Each `.env.example` explains the remaining variables.

## Workspace

- `apps/web` — the dashboard and the flow builder.
- `apps/api` — the Elysia service; it owns Postgres and executes every flow run.
- `apps/runtime` — published mini-apps at `/a/[flowId]`.
- `apps/ui-lab` — a local preview of the UI primitives.

Shared code lives in `packages/`: contracts, api-client, flow-engine, db, ui, miniapp, and the Tailwind and TypeScript configs. Only the API reaches the database; `web` and `runtime` go through the typed API client.

## Verification

```
bun run lint
bun run typecheck
bun run test
bun run build
bun run format:check
```

`bun run e2e` runs the Playwright suite.
