# readme-redesign — plan

> **Status:** implemented. The README was first rewritten as a showcase in `2c6d73e` and rewritten again against the shipped product in `23e6321`, which is the version in the repository. Do not re-execute this plan.

**Sources:** context.md: `.prova/tasks/readme-redesign/context.md` · approved artifacts: `.prova/tasks/readme-redesign/screens/_general/10-decisions.md`
**Constraints (translated from the user's decisions):** `readme-route: 4 · Hybrid: showcase + developer guide` · `visual-format: Keep the existing image at the top and only one additional image explaining the system where needed below.` · `system-image: The user will supply a screenshot of an actual flow in the app.` · `demo-links: Live app; Demo video; ETHOnline submission` · `dev-depth: B · Medium` · `final-summary: Do not add a license section; the license already exists in the repository and GitHub displays it. Keep the page short.` · target length ~70 lines · language English · no badges, no Mermaid, no license section

> Executors: deviating from any decision in Sources requires re-asking it under its
> decision id before acting.

## Goal

`README.md` is rewritten as a hybrid page: a compact showcase (banner, pitch, demo line, three steps with one canvas screenshot, features, built with) over a tight developer half (getting started with env in prose, workspace map, verification, docs). Around 70 lines, English, two images only.

## Success criteria

- Section order exactly: banner → `# Automator` + pitch → demo line → `## How it works` (3 steps + screenshot slot) → `## Features` → `## Built with` → `## Getting started` → `## Workspace` → `## Verification` → `## Docs`.
- The file references exactly two images: `github-banner.png` and `docs/media/flow-canvas.png`.
- No license section, no badge row, no Mermaid block, no `<details>` block, no table.
- Total length ≤ 80 lines.
- Every claim in Features and Built with maps to code or `docs/architecture.md`; nothing named that the repo does not integrate.
- Every relative link resolves to a file that exists; `bun run format:check` passes.

## Out of scope

- Mermaid or drawn architecture diagrams; any image beyond the two above; GIF or embedded video.
- Environment variable table, deploy instructions, contributing guide, code of conduct, badges, license section, marketplace/examples showcase.
- Changes to `docs/architecture.md`, `docs/web-ui.md`, `AGENTS.md` or `docs/decisions/` — they are linked, not edited.
- Taking the canvas screenshot: the user takes it.

## Phase 1 — Showcase copy

Copy is drafted, then chosen with the user round by round in prova (`task: readme-redesign`, screen `readme-copy`) before it lands in the file.

### Tasks

- [ ] Draft three pitch paragraphs (one sentence each, ≤ 40 words) covering: visual canvas, onchain workflows, build → simulate → run → inspect on the same canvas. Present them under `decision: "pitch-copy"`; the picked one is written to the file.
- [ ] Write the demo line as three inline links on one line: `Live app` → `https://web-production-6245b.up.railway.app`, `Demo video` → `TODO-video-url`, `ETHOnline submission` → `TODO-ethglobal-url`. Ask the user for the two URLs in the terminal in one message; keep the `TODO-…` placeholders in the href only if the user has none yet.
- [ ] Write `## How it works` as three numbered lines, one sentence each: Design (drag nodes or describe the flow to the AI composer), Simulate (dry-run onchain calls, screens answered for you), Run & inspect (webhook/schedule/watch triggers, every run stored step by step). Present under `decision: "how-it-works-copy"`.
- [ ] Add the screenshot slot right under the three steps: `![A flow on the Automator canvas](docs/media/flow-canvas.png)` preceded by an HTML comment naming what to capture, plus a one-line italic caption. Create `docs/media/.gitkeep` so the directory exists.
- [ ] Draft `## Features` as six one-line bullets, each verified against code: canvas builder (`apps/web/src/builder/`), AI composer with validated proposals (`apps/api/src/ai/generate-flow.ts`, `verify-flow.ts`), simulation with dry-run chain mode (`packages/flow-engine`, `apps/api/src/chain/provider.ts`), triggers — webhook, schedule, onchain event, price and balance watchers (`apps/api/src/hooks/`, `scheduler.ts`, `watch/`), publish as a mini-app link (`apps/runtime/src/app/a/[flowId]`), run history with AI failure explanations (`apps/api/src/ai/explain-run.ts`). Present the six under `decision: "features-copy"` as a multi-select so the user can drop any.
- [ ] Write `## Built with` as one prose block or flat list, restricted to what `apps/*/package.json`, `packages/contracts/src/chains.ts` and `docs/architecture.md` prove: Bun, Turborepo, Next.js App Router, Elysia, Postgres, React Flow, Privy, viem, Base Sepolia and World Chain Sepolia, Circle USDC, World ID, The Graph Token API, Chainlink price feeds, OpenRouter with an OpenAI fallback, Railway.

### Automated verification

- `grep -c '^' README.md` — the file stays at or under 80 lines.
- `grep -n '!\[' README.md` — exactly two image references.
- `bun run format:check` — formatting matches the repo.

### Manual verification

- The user picked each copy round in prova; no unpicked draft reached the file.
- Read on GitHub's rendered view: banner, pitch and demo line fit above the fold on a laptop.

## Phase 2 — Developer half

### Tasks

- [ ] `## Getting started`: prerequisites line (Bun 1.3.13, Node ≥22), then one code block — `bun install`, the three `cp …env.example` lines from the current README, `bun run dev` — then one line naming the ports (web 3000, API 3001, runtime 3002, UI Lab 3003) and the `--filter=@automator/web` form.
- [ ] Add exactly two sentences on environment after that block: the API needs `DATABASE_URL`, `PRIVY_APP_ID`/`PRIVY_APP_SECRET` and `SECRETS_KEY` to run, and the web app needs `NEXT_PUBLIC_PRIVY_APP_ID`; the AI, World ID, The Graph and Privy signing keys are optional and their features report themselves as unconfigured without them. Point at the `.env.example` files for the rest.
- [ ] `## Workspace`: four bullets (`apps/web` builder and dashboard, `apps/api` Elysia service that owns Postgres, `apps/runtime` published mini-apps at `/a/[flowId]`, `apps/ui-lab` component preview) plus one sentence listing `packages/` (contracts, api-client, flow-engine, db, ui, miniapp, tailwind-config) and the `web/runtime → api → db` boundary rule.
- [ ] `## Verification`: one code block with `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, `bun run format:check`, and a following line naming `bun run e2e` for the Playwright suite.
- [ ] `## Docs`: three links — `docs/architecture.md`, `docs/decisions/`, `AGENTS.md`. Remove the old README's link list.

### Automated verification

- `bun run format:check` — passes.
- `for p in docs/architecture.md docs/decisions AGENTS.md docs/media/flow-canvas.png; do test -e "$p" || echo "missing $p"; done` — only the screenshot may be reported missing until the user adds it.
- `grep -nE 'License|badge|shields.io|```mermaid|<details>' README.md` — no output.

### Manual verification

- Copy the Getting started block into a clean shell and confirm the commands match the repo's actual scripts in `package.json`.

## Phase 3 — Close

### Tasks

- [ ] Read the finished README once against `.prova/tasks/readme-redesign/context.md`; every decision appears, every no-go is absent.
- [ ] Report to the user: the file, the two `TODO-…` link placeholders still open, and that `docs/media/flow-canvas.png` awaits their screenshot.

### Automated verification

- `git diff --stat README.md` — README is the only content change besides `docs/media/.gitkeep` and this plan.

### Manual verification

- The user reads the rendered README and confirms it, or asks for a copy revision under the copy decision ids.
