import { querySubgraphConfigSchema } from "@automator/contracts";
import type { ExecutorRegistry } from "./executor";
import { parseSubgraphVariables, querySubgraph } from "./graph";

export const graphExecutors: ExecutorRegistry = {
  "graph.query-subgraph": {
    kind: "step",
    async run(context) {
      const { subgraph, query, variables } = context.config(querySubgraphConfigSchema);
      const data = await querySubgraph(
        context.fetch,
        context.graph,
        { subgraph, query, variables: parseSubgraphVariables(variables) },
        context.signal,
      );
      return { data };
    },
  },
};
