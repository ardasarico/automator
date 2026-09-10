## How we work

- **Harnesses:** this file is the single instruction source for every coding agent. Codex reads it natively; Claude Code reads it through `CLAUDE.md` (`@AGENTS.md`). Put shared guidance here, never in a harness-specific file. Local, untracked context lives in `AGENTS.override.md` (Codex) and `CLAUDE.local.md` (Claude, imports the same file).
- **Skills:** project skills live in `.agents/skills/`; `.claude/skills` is a symlink to that directory. Review the available skill descriptions and read and follow the skills relevant to the task.
- **Library docs:** use Context7 first; fall back to official documentation when it is unavailable or insufficient.
- **Verification:** use the repository's existing checks for the affected code. Report what passed and what remains unverified.
- **Per-app agent files:** `apps/*/AGENTS.md` and `apps/*/CLAUDE.md` are written by Next.js (`next dev`), ignored by Git, and not edited by hand.

## Commands

Bun workspaces with Turborepo; run everything from the repository root.

- `bun install`, then `bun run dev` starts web (3000), API (3001), runtime (3002), UI Lab (3003), and landing (3004). Use `--filter=@automator/web` for one app; auth and health need the API running separately. UI Lab and landing need no env file or backend.
- Verification: `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, `bun run format:check` (`bun run format` fixes).
- Single test file: `bun test apps/api/src/auth/privy.test.ts` from the root, or `bun test <pattern>` inside the package. Any test file runs from the root, e.g. `bun test apps/web/src/auth/provider.test.tsx`.
- `packages/db`'s integration tests are the only ones that reach Postgres and skip themselves without a database, so run them before anything that changes the schema: `TEST_DATABASE_URL="postgres://localhost:5432/automator_test" bun test packages/db`.
- Env files: copy each app's `.env.example` to `apps/api/.env`, `apps/web/.env.local`, and `apps/runtime/.env.local`. Only the API gets `DATABASE_URL` and `PRIVY_APP_SECRET`.

## Architecture

Read `docs/architecture.md` for the full picture. The parts that span packages:

- **Boundary:** `web/runtime → api → db`. Frontends call the API through `@automator/api-client/server` (server-only, given `API_URL` explicitly); the API owns Postgres via `@automator/db` (Bun SQL, no ORM, startup migration). Oxlint enforces this with restricted imports.
- **Contracts:** `packages/contracts` holds TypeBox schemas, inferred types, and endpoint paths. Elysia validates responses against them; the API client validates incoming JSON against the same schema and status.
- **Auth:** Privy authenticates in the browser; Next.js route handlers under `apps/web/src/app/api/auth` forward bearer tokens to the API and mirror the session into the `automator-session` cookie. Server code reads the user through `apps/web/src/auth/server.ts`. The cookie is a rendering mirror, not authorization; every private API handler enforces its own.
- **UI:** `packages/ui` wraps Coss (Base UI) primitives imported via explicit subpaths such as `@automator/ui/button`; tokens and fonts come from `packages/tailwind-config`. `apps/ui-lab` previews them.
- **Deploy:** Railway autodeploys `web`, `api`, `runtime` and `landing` from GitHub `main`, each on its own `*.automator.ardasari.co` host; `.railway/railway.ts` is the infrastructure definition and changes there need `railway config plan` / `apply`.

## Docs

- **Architecture:** consult `docs/architecture.md` for architectural work; keep it aligned with the implemented system.
- **Decisions:** consult `docs/decisions/` before revisiting established choices. Write records only when the user wraps up the session, covering durable decisions agreed during it. Small tasks and tentative ideas do not need records.

## Conventions

- **Icons:** use Remix Icons (`@remixicon/react`) exclusively for UI icons, including imported Coss components. Prefer line variants by default. Do not add other icon libraries.

- **Language:** use English for all internal work, planning, working notes, subagent instructions and communication, and repository content (code, comments, docs, commit messages). Only user-facing communication follows the language of the user's prompt.
- **Keep it lean:** favor simple code and short, useful docs. Add structure when the current work needs it.
- **Grounded documentation:** document implemented behaviour and agreed decisions; never fill gaps with assumed stack choices, commands, or architecture.

## Data and database

- **Shared contracts:** define API request/response schemas in `packages/contracts` and infer TypeScript types from them. API handlers and web consumers must use these contracts, with runtime validation at HTTP boundaries. Keep contracts independent of backend implementations; do not duplicate DTO types in apps.
- **API-only access:** all database reads and writes go through `apps/api`. This applies to all Next.js code in `apps/web`, including Server Components, Server Actions, and Route Handlers. Keep database packages, drivers, ORM code, and credentials out of the web app and its shared dependencies; never give the web service `DATABASE_URL` or other database credentials. Share API contracts through database-independent packages.
- **Development data:** the project has no real users. Data resets and schema redesigns are acceptable when needed; backward compatibility and data preservation are not requirements unless the user says otherwise.
- **Critical operations:** before broad data deletion, dropping databases, or destructive changes to shared or live environments, explain the exact target and impact and ask for confirmation.

## Git

- **Required skill:** read and follow `.agents/skills/committing/SKILL.md` for commit, amend, or push requests and before changing Git history or remotes.
- **Approval:** keep work uncommitted until requested. Before committing or amending, show the staged files and proposed messages and obtain fresh approval. Push only when explicitly requested.
- **Before push or deployment:** run the repository's lint and build commands against the final changes; both must pass before pushing or deploying. If either check is unavailable or blocked, report it and ask before proceeding.
- **Deployments:** deploy applications through the connected GitHub repository and Railway autodeploys. Do not upload local application files with `railway up`.
