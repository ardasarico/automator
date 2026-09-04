# Automator Architecture

The repository uses Bun workspaces and Turborepo. Application code is TypeScript with strict checking.

- `apps/web`: Next.js App Router application on port 3000. The home page fetches API health on the server for every request and displays backend and database status separately. `API_URL` stays server-side; requests are uncached and time out after five seconds.
- `apps/api`: Elysia application running on Bun. Uses port 3001 by default, overridable with `PORT`, and listens on IPv6 for Railway private networking.
- `packages/db`: Bun SQL connection pool and database health query (`SELECT 1`). Connections use `DATABASE_URL`; health queries time out after three seconds. No ORM or schema has been selected yet.
- `packages/contracts`: database-independent TypeBox schemas, inferred TypeScript types, endpoint paths, and HTTP response validation. API and web consume the same contracts; the database package imports only its health status type.

The data access boundary is `web → api → db`. The web app has no dependency on `@automator/db` and receives only `API_URL` for backend access. The API owns database access, including the database health query; see the API-only access rule in `AGENTS.md`.

Define shared request/response shapes in `packages/contracts` and derive types from their schemas instead of duplicating interfaces. Elysia validates its responses against these schemas. Next.js validates unknown health response JSON against the same schema and HTTP status before consuming it. HTTP 200 requires a healthy database; HTTP 503 requires an unavailable or unconfigured database. Contracts have no dependency on Elysia, database drivers, or database schemas.

Development and production share one Railway PostgreSQL database. Local development uses its public TCP endpoint with TLS; the Railway API uses the private connection URL. Credentials belong in ignored environment files or Railway variables. Copy each app's `.env.example` to `apps/api/.env` and `apps/web/.env.local`, then supply the connection values.

API `/health` returns 200 when the database query succeeds and 503 when the database is unavailable or unconfigured. API `/health/live` and web `/health` only check their own process. The web page treats a reachable API with a failed database separately from an unreachable API. There is no authentication or workflow implementation yet.

Each application owns its dependencies, TypeScript configuration, and scripts. Root scripts delegate to Turborepo for development, builds, production startup, type checking, and tests. Build outputs are `.next/` for the web app and `dist/` for the API. Development and production servers are persistent, uncached tasks.

Railway's `automator` project contains `web`, `api`, and `Postgres` in the `production` environment. `.railway/railway.ts` defines service commands, variables, networking, readiness checks, and restart policies. Both app services build from the repository root with a Turbo package filter. The web service is public; it calls the API over Railway's private network. Infrastructure settings are applied, but application deployment is pending.

The configured application source is `ardasarico/automator` on GitHub, branch `main`; connecting it on Railway is pending the first application push. Deploy applications through GitHub pushes, with each service's watch patterns selecting relevant changes. Do not upload local application files with `railway up`.

Use Railway CLI 5.42.1 or newer to run `railway config plan` and review changes before `railway config apply`. Database credentials are kept in Railway, referenced by the API configuration. GitHub pushes deploy application code; changes to `.railway/railway.ts` require a separate config plan/apply.

Oxlint checks application packages and Railway configuration, with React, Next.js, and accessibility rules for the web app. Imports of the database package and configured database drivers from web or contracts are lint errors. Oxfmt formats repository sources and configuration; READMEs, licenses, installed skills, and generated files are excluded. The repository requires lint and build to pass before push or deployment.
