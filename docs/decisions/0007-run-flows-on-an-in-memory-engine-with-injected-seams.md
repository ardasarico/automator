# Run flows on an in-memory engine with injected seams

Status: Accepted

## Context

The same flow document has to run in several places: the API for Simulate, saved runs, webhooks, schedules and mini-app sessions; tests without any network; and the builder's in-browser preview. Each place has different access to the outside world (models, chains, secrets, a code sandbox), and a run must be inspectable node by node on the canvas and in the run history.

## Decision

- `packages/flow-engine` exposes one pure `runFlow(document, options)` that executes a `FlowDocument` in memory and answers a `FlowRun`: one result per node (`succeeded`, `failed`, `skipped`, `waiting`) with timestamps, outputs keyed by output handle, and an error message, plus the final `vars` and a run-wide error for problems no node owns.
- Scheduling follows the edges: a node runs once every incoming edge has fired or gone dead and at least one fired; unconnected triggers start the run; a failure stops it and the rest is reported skipped; the graph must be acyclic.
- Node behaviour lives in an executor registry keyed by node type, with three kinds: `trigger` (hands its payload to its output), `step` (runs and produces outputs), and `screen` (a visitor pause; the engine either stops with `waiting`, resumes from a visitor's answer, or auto-answers it for Simulate). Two constructs are the engine's own rather than executors: `logic.for-each` runs the nodes downstream of its `item` handle once per item as sequential sub-runs (capped at 100, no screens inside) and then fires `done`; `logic.run-code` executes only through the sandbox seam below.
- Everything that touches the outside world is injected through `RunOptions` and handed to executors on their context: `fetch`, `sleep`, `now`, the `LanguageModel`, the `ChainProvider`, the `SecretsResolver`, the `Sandbox` (QuickJS in WebAssembly in the API, absent in the browser), and an `AbortSignal` that cancels the run at the next node and aborts the node in flight. Tests script these seams; the browser omits what it cannot provide, and the affected nodes fail with a message that says so.
- The API owns persistence: `runFlow` stores nothing, and the run routes, triggers and sessions record finished runs in `automator_runs`.

## Consequences

The engine is browser-safe and fully testable without network, database or credentials. Node semantics are explicit in one place, and the canvas can show exactly what happened. Executors cannot run other nodes, so control flow beyond branching (loops, screens) has to be added to the engine itself. Long runs are bounded by the per-node limits (waits, timeouts, item caps) rather than by a job system; runs are synchronous requests, cancelled by disconnecting.
