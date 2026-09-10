# Read chain data through The Graph Network

Status: Accepted

## Context

Automator's only Graph integration was `trigger.balance`, which reads wallet balances from the Token API. The Token API is a REST product operated by Pinax, and The Graph's ETHOnline "from scratch" tracks count only Subgraphs, the Subgraph MCP, or Substreams as the data source, queried with a Subgraph Studio key. The AI agent also had no real chain-data tool: only `http_get`, `set_variable`, and `discord_message`.

## Decision

- A `graph.query-subgraph` step runs one GraphQL query against a subgraph on The Graph Network through the gateway (`POST https://gateway.thegraph.com/api/subgraphs/id/<id>`, bearer `GRAPH_API_KEY` from Subgraph Studio; `GRAPH_GATEWAY_URL` overrides the origin). A subgraph id, a `Qm…` deployment id, or a full URL are all accepted; the node returns the response's `data` object.
- The same query is exposed to `ai.agent` as the `query_subgraph` tool, bound to the single subgraph named in the agent's config, so the model can only read the source the builder chose.
- The key is server configuration, not a per-user secret. Without it the node fails its run as unconfigured; the Token API balance trigger keeps working on its own key.
- The Subgraph MCP is not integrated.

## Consequences

Subgraph reads satisfy The Graph track's wording verbatim, and the Token API becomes a second, complementary product rather than the claim. A newly created Studio key takes roughly forty minutes to reach the gateway ("API key not found" until then), which the setup notes must say. Because a query's result shape is unknown ahead of time, the AI verification pass reports drafts as untested from that node on.
