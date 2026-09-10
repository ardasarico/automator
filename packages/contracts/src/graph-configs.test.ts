import { describe, expect, test } from "bun:test";
import { flowNodeCategory } from "./flow-categories";
import { findFlowProblems } from "./flow-checks";
import { agentTools, flowNodeConfigSchemas } from "./flow-node-configs";
import { flowNodePorts } from "./flow-ports";
import { flowNodeTypes, type FlowNode } from "./flows";
import { querySubgraphConfigSchema, sampleSubgraphQuery } from "./graph-configs";
import { parseNodeConfig } from "./node-config";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

const query = (config: Record<string, unknown>) => ({
  nodes: [node("start", "trigger.manual"), node("q", "graph.query-subgraph", config)],
  edges: [{ id: "e", source: "start", sourceHandle: "run", target: "q", targetHandle: "params" }],
});

const agent = (config: Record<string, unknown>) => ({
  nodes: [node("start", "trigger.manual"), node("a", "ai.agent", { task: "Look", ...config })],
  edges: [{ id: "e", source: "start", sourceHandle: "run", target: "a", targetHandle: "prompt" }],
});

describe("graph.query-subgraph", () => {
  test("is an integration node with a params input and a data output", () => {
    expect(flowNodeTypes).toContain("graph.query-subgraph");
    expect(flowNodeCategory["graph.query-subgraph"]).toBe("integration");
    expect(flowNodePorts["graph.query-subgraph"]).toEqual({
      inputs: ["params"],
      outputs: ["data"],
    });
  });

  test("defaults to a sample query with no variables", () => {
    expect(flowNodeConfigSchemas["graph.query-subgraph"]).toBe(querySubgraphConfigSchema);
    expect(parseNodeConfig(querySubgraphConfigSchema, {})).toEqual({
      subgraph: "",
      query: sampleSubgraphQuery,
      variables: "{}",
    });
    expect(querySubgraphConfigSchema.properties.query.contentMediaType).toBe("application/graphql");
    expect(querySubgraphConfigSchema.properties.variables.contentMediaType).toBe(
      "application/json",
    );
  });

  test("needs a subgraph and a query, and variables that are a JSON object", () => {
    const messages = (config: Record<string, unknown>) =>
      findFlowProblems(query(config)).map((problem) => problem.message);
    expect(messages({ subgraph: "", query: "", variables: "{}" })).toEqual([
      "“q” needs a subgraph.",
      "“q” needs a GraphQL query.",
    ]);
    expect(messages({ subgraph: "abc", query: "{ pools { id } }", variables: "[1]" })).toEqual([
      "“q” needs its variables to be a JSON object.",
    ]);
    expect(messages({ subgraph: "abc", query: "{ pools { id } }", variables: "" })).toEqual([]);
    expect(
      messages({ subgraph: "{{vars.subgraph}}", query: "{ pools { id } }", variables: "{}" }),
    ).toEqual([]);
  });
});

describe("the agent's query_subgraph tool", () => {
  test("is on the allowlist and reads the subgraph from the agent's config", () => {
    expect(agentTools).toContain("query_subgraph");
    expect(parseNodeConfig(flowNodeConfigSchemas["ai.agent"], {}).subgraph).toBe("");
  });

  test("needs a subgraph only when the tool is enabled", () => {
    const messages = (config: Record<string, unknown>) =>
      findFlowProblems(agent(config)).map((problem) => problem.message);
    expect(messages({ tools: ["query_subgraph"], subgraph: "" })).toEqual([
      "“a” needs a subgraph for its query tool.",
    ]);
    expect(messages({ tools: ["set_variable"], subgraph: "" })).toEqual([]);
    expect(messages({ tools: ["query_subgraph"], subgraph: "abc" })).toEqual([]);
  });
});
