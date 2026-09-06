---
name: elysiajs
description: Implement or debug Elysia routes, validation, lifecycle hooks, and plugins in Automator's API.
---

# Elysia in Automator

Start with the relevant handler in `apps/api/src/app.ts` and the shared schemas in `packages/contracts/src/index.ts`. Follow the API/data boundary in `AGENTS.md`; request and response contracts stay independent of Elysia and database implementation details.

For API-specific behavior, query Context7 for the installed Elysia version. If unavailable or insufficient, use [official documentation](https://elysiajs.com/llms.txt) to locate the relevant page rather than loading a full framework tutorial.

When composing routes and plugins, check type inference through chaining, hook registration order, and lifecycle scope. A hook's presence in source does not prove it reaches the intended routes. Keep dependencies explicit where an instance needs a decorator or schema supplied by another instance.

Extend existing route and contract-validation tests for changed HTTP behavior. Include relevant invalid input and failure responses; inspect `apps/api/src/app.test.ts` for the current local test setup. When a shared endpoint changes, update its consumers in `packages/api-client` as needed.
