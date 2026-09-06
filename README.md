![Automator](/github-banner.png)

# Automator

A visual canvas for building, simulating, executing, and inspecting onchain workflows. Built for ETHOnline 2026.

Prerequisites: Bun 1.3.13, Node ≥22.

## Setup

```
bun install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/runtime/.env.example apps/runtime/.env.local
```

## Development

```
bun run dev
```

Starts web (3000), API (3001), runtime (3002), and UI Lab (3003). Run one app with a filter, e.g. `bun run dev --filter=@automator/web`.

## Verification

```
bun run lint
bun run typecheck
bun run test
bun run build
bun run format:check
```

## Docs

- [Architecture](docs/architecture.md)
- [AGENTS.md](AGENTS.md)
