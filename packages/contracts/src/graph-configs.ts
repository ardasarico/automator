import { Type, type Static } from "@sinclair/typebox";

/** A query that runs unchanged against most subgraphs, so a fresh node shows a real shape. */
export const sampleSubgraphQuery = `{
  _meta {
    block {
      number
    }
  }
}`;

/**
 * A GraphQL query against a subgraph published on The Graph Network, answered through the
 * gateway with the API's Subgraph Studio key. `subgraph` names what to query; the gateway URL
 * and the key stay on the server, so a flow never carries them.
 */
export const querySubgraphConfigSchema = Type.Object({
  subgraph: Type.String({
    default: "",
    title: "Subgraph",
    description:
      "A Subgraph ID from Subgraph Studio or The Graph Explorer, a deployment ID (Qm…), or a full query URL.",
  }),
  query: Type.String({
    default: sampleSubgraphQuery,
    title: "Query",
    contentMediaType: "application/graphql",
    description: "The GraphQL query to send. Reference earlier steps with {{…}} templates.",
  }),
  variables: Type.String({
    default: "{}",
    title: "Variables",
    contentMediaType: "application/json",
    description: "A JSON object of query variables. Optional; templates work inside values.",
  }),
});
export type QuerySubgraphConfig = Static<typeof querySubgraphConfigSchema>;

export const graphConfigSchemas = {
  "graph.query-subgraph": querySubgraphConfigSchema,
} as const;
