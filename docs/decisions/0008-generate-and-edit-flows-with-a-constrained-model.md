# Generate and edit flows with a constrained model

Status: Accepted

## Context

AI has to help people create and edit flows without producing documents the builder or engine cannot use, and without a model provider leaking into the engine or the browser. The hackathon budget favours free models, whose answers are less reliable than paid ones.

## Decision

- One seam, `LanguageModel` in `packages/flow-engine`, describes a chat request (messages, optional tools, response format) and its answer (text, tool calls). The API implements it over OpenRouter's chat completions with plain `fetch` (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`); tests script it turn by turn. Without a key the API passes no model, AI nodes fail as unconfigured, and the AI routes answer 503.
- Flow generation is a server endpoint (`POST /ai/flows`): the model is told the usable node types, their handle ids and config fields, and answers nodes and edges only. The API lays the graph out, cleans configs through their schemas, and validates the result against the document schema, the referential checks, the type allowlist, handle ids, single edges per input, a trigger, no orphans and no cycles. One invalid answer is sent back with its problem; a second failure is a 422.
- The builder never applies a generated flow on arrival: the AI panel shows a preview (summary and a node-by-node diff) and the user applies or discards it; applying is an undoable store change.
- The model never receives credentials: secrets such as webhook URLs are left blank for the user to fill in, and the `ai.agent` node is a constrained tool loop with a fixed tool allowlist, capped steps, and an audited `steps` output.

## Consequences

Generated flows are always valid documents and use only nodes that can run, at the cost of a second model round trip on bad answers. Swapping providers or models is a configuration change. Users keep control over what lands on the canvas. Free-model quality limits how ambitious prompts can be; the validation, not the model, guarantees the shape.
