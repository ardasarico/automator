# Publish flows as an HTTP API and as MCP tools

Status: Accepted

## Context

A flow could be started by a schedule, a webhook, a chain event or a visitor opening a mini app, but nothing let a person's own code — or an AI agent — call a flow, hand it typed arguments and read an answer back. The webhook came closest and was the wrong shape for it: it takes whatever body arrives, answers 202 with a run id and nothing else, and authenticates with a token in the URL that stands for one flow rather than for the owner.

## Decision

- A flow that starts at `trigger.api` declares what a caller sends: a `description` and an `inputs` array of `{ name, type: text | number | boolean | address, description, required }`. `logic.return` declares what it answers with, and the engine records the first Return a run reaches as `FlowRun.output`; the run carries on, so a Return in the middle of a flow does not end it.
- `packages/contracts/src/api-publishing.ts` derives everything from that declaration — `flowApiSchema`, `validateFlowApiInput`, `describeFlowApiProblems` — so the endpoint, the builder's curl example and an MCP tool's description are read off the same document and cannot drift from the canvas.
- `enabled` is the publish switch, exactly as it is for webhooks. There is no second publish flag: a flow is callable when it is active, and the existing activation blockers already stop a broken one.
- Machines authenticate with an API key (`ak_` plus 32 random bytes; only a SHA-256 hash and an 11-character head are stored, migration `0017_api_keys`), never with a Privy session. A key is refused on the dashboard routes and a session is refused on `/v1`, so neither can be replayed as the other, and a key reaches only its owner's published flows.
- `GET /v1/flows` lists the caller's callable flows with their schemas; `POST /v1/flows/:id/invoke` validates the body (422 with per-field problems), runs the flow synchronously with `screens: "wait"` and answers `{ runId, status, output }`. A missing, inactive, foreign or non-API flow is one flat 404.
- The MCP server is stateless and reuses that path rather than paralleling it: `invokeApiFlow` returns `not_found`, `invalid_input`, `waiting_on_screen` or `ok` for either transport to map, so an agent and an HTTP caller cannot disagree about what a flow accepts or what went wrong.
- Machine callers reach the API host directly rather than through the web app, which keeps a synchronous run off the browser proxy's timeout and is why the API gets a public domain of its own.

## Consequences

A flow becomes a typed endpoint and an agent tool without a second publish step or a second definition of its interface, and the run history shows those calls under a new `api` source. A run that stops at a screen cannot be answered by a machine, so an API flow with screens is a warning on the canvas and a 409 at the endpoint. The synchronous invoke holds a connection for the length of the run, which suits a quote and not a long job; nothing polls a run id yet. Keys are shown once and cannot be recovered, only revoked.
