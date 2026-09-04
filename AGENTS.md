## How we work

- **Skills:** review the available skill descriptions, including `.agents/skills/`, and read and follow the skills relevant to the task.
- **Library docs:** use Context7 first; fall back to official documentation when it is unavailable or insufficient.
- **Verification:** use the repository's existing checks for the affected code. Report what passed and what remains unverified.

## Docs

- **Architecture:** consult `docs/architecture.md` for architectural work; keep it aligned with the implemented system.
- **Decisions:** consult `docs/decisions/` before revisiting established choices. Write records only when the user wraps up the session, covering durable decisions agreed during it. Small tasks and tentative ideas do not need records.

## Conventions

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
