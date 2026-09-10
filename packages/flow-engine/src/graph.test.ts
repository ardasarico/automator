import type { FlowDocument, FlowEdge, FlowNode, FlowNodeType } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow, type RunOptions } from "./engine";
import { graphGatewayUrl, subgraphUrl } from "./graph";
import { scriptedModel, type ChatResponse } from "./language-model";

function node(id: string, type: FlowNodeType, config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}
function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): FlowEdge {
  return { id: `${source}-${target}`, source, sourceHandle, target, targetHandle };
}
function flow(nodes: FlowNode[], edges: FlowEdge[]): FlowDocument {
  return { version: 1, id: "flow-1", name: "Graph", description: "", nodes, edges };
}

const subgraphId = "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV";
const deploymentId = "QmWmyoMoctfbAaiEs2G46gpeUmhqFRDW6KLg1y6XLsm4ne";
const graph = { apiKey: "studio-key" };

function fetchStub(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function queryFlow(config: Record<string, unknown>): FlowDocument {
  return flow(
    [node("t", "trigger.manual"), node("q", "graph.query-subgraph", config)],
    [edge("t", "run", "q", "params")],
  );
}

const poolQuery = "query Pool($id: ID!) { pool(id: $id) { token0Price } }";
const pool = { pool: { token0Price: "4012.5" } };

async function runQuery(config: Record<string, unknown>, options: RunOptions = {}) {
  const run = await runFlow(queryFlow(config), { graph, ...options });
  return run.nodes[1]!;
}

describe("subgraphUrl", () => {
  test("routes a subgraph id, a deployment id and a full URL", () => {
    expect(subgraphUrl(subgraphId)).toBe(`${graphGatewayUrl}/api/subgraphs/id/${subgraphId}`);
    expect(subgraphUrl(deploymentId)).toBe(`${graphGatewayUrl}/api/deployments/id/${deploymentId}`);
    expect(subgraphUrl("https://api.studio.thegraph.com/query/1/pools/v1")).toBe(
      "https://api.studio.thegraph.com/query/1/pools/v1",
    );
    expect(subgraphUrl(` ${subgraphId} `, "https://gw.example/")).toBe(
      `https://gw.example/api/subgraphs/id/${subgraphId}`,
    );
  });
});

describe("graph.query-subgraph", () => {
  test("posts the query and templated variables with the API key and outputs data", async () => {
    const { fetcher, calls } = fetchStub(200, { data: pool });
    const result = await runQuery(
      { subgraph: subgraphId, query: poolQuery, variables: '{"id": "{{trigger.pool}}"}' },
      { fetch: fetcher, trigger: { payload: { pool: "0xpool" } } },
    );
    expect(result.status).toBe("succeeded");
    expect(result.outputs).toEqual({ data: pool });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${graphGatewayUrl}/api/subgraphs/id/${subgraphId}`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe("Bearer studio-key");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      query: poolQuery,
      variables: { id: "0xpool" },
    });
  });

  test("sends no variables when the field is blank and honours a custom gateway", async () => {
    const { fetcher, calls } = fetchStub(200, { data: pool });
    const result = await runQuery(
      { subgraph: deploymentId, query: "{ pools { id } }", variables: "" },
      { fetch: fetcher, graph: { apiKey: "k", url: "https://gw.example" } },
    );
    expect(result.status).toBe("succeeded");
    expect(calls[0]!.url).toBe(`https://gw.example/api/deployments/id/${deploymentId}`);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ query: "{ pools { id } }" });
  });

  test("fails as unconfigured without a gateway key", async () => {
    const { fetcher, calls } = fetchStub(200, { data: pool });
    const result = await runQuery(
      { subgraph: subgraphId, query: poolQuery },
      { fetch: fetcher, graph: undefined },
    );
    expect(result.error).toBe("Subgraph queries need a Graph API key on the server");
    expect(calls).toHaveLength(0);
  });

  test("refuses a blank subgraph, a blank query, and variables that are not an object", async () => {
    const { fetcher } = fetchStub(200, { data: pool });
    const errorOf = async (config: Record<string, unknown>) =>
      (await runQuery(config, { fetch: fetcher })).error;
    expect(await errorOf({ subgraph: " ", query: poolQuery })).toBe(
      "Subgraph query needs a subgraph",
    );
    expect(await errorOf({ subgraph: subgraphId, query: " " })).toBe(
      "Subgraph query needs a query",
    );
    expect(await errorOf({ subgraph: subgraphId, query: poolQuery, variables: "[1]" })).toBe(
      "Subgraph query variables must be a JSON object",
    );
    expect(await errorOf({ subgraph: subgraphId, query: poolQuery, variables: "{oops" })).toBe(
      "Subgraph query variables must be a JSON object",
    );
  });

  test("reports a rejected key, a gateway error, and GraphQL errors", async () => {
    const config = { subgraph: subgraphId, query: poolQuery };
    const errorOf = async (status: number, body: unknown) =>
      (await runQuery(config, { fetch: fetchStub(status, body).fetcher })).error;
    expect(await errorOf(401, { message: "invalid key" })).toBe(
      "The Graph gateway rejected the API key",
    );
    expect(await errorOf(502, "bad gateway")).toBe("The Graph gateway answered 502");
    expect(
      await errorOf(200, {
        errors: [{ message: "Type `Pool` has no field `nope`" }, { message: "second" }],
      }),
    ).toBe("The subgraph answered an error: Type `Pool` has no field `nope`; second");
    expect(await errorOf(200, { ok: true })).toBe("The subgraph answered without data");
  });
});

describe("the agent's query_subgraph tool", () => {
  const text = (content: string): ChatResponse => ({ content, toolCalls: [] });

  function agentFlow(config: Record<string, unknown>): FlowDocument {
    return flow(
      [
        node("t", "trigger.manual"),
        node("a", "ai.agent", {
          task: "Find the pool price",
          tools: ["query_subgraph"],
          maxSteps: 3,
          ...config,
        }),
      ],
      [edge("t", "run", "a", "prompt")],
    );
  }

  test("queries the configured subgraph and hands the data back to the model", async () => {
    const { model, requests } = scriptedModel([
      {
        content: null,
        toolCalls: [
          {
            id: "c1",
            name: "query_subgraph",
            arguments: { query: poolQuery, variables: { id: "0xpool" } },
          },
        ],
      },
      text("The pool price is 4012.5."),
    ]);
    const { fetcher, calls } = fetchStub(200, { data: pool });
    const run = await runFlow(agentFlow({ subgraph: subgraphId }), {
      model,
      graph,
      fetch: fetcher,
    });
    expect(run.status).toBe("succeeded");
    expect(calls.map((call) => call.url)).toEqual([
      `${graphGatewayUrl}/api/subgraphs/id/${subgraphId}`,
    ]);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      query: poolQuery,
      variables: { id: "0xpool" },
    });
    expect(run.nodes[1]!.outputs).toEqual({
      result: "The pool price is 4012.5.",
      steps: [
        {
          step: 1,
          tool: "query_subgraph",
          arguments: { query: poolQuery, variables: { id: "0xpool" } },
          result: JSON.stringify(pool),
        },
      ],
    });
    expect(requests[0]!.tools?.map((tool) => tool.name)).toEqual(["query_subgraph"]);
    expect(requests[1]!.messages.at(-1)).toEqual({
      role: "tool",
      content: JSON.stringify(pool),
      toolCallId: "c1",
    });
  });

  test("answers the model with an error when no subgraph is configured", async () => {
    const { model } = scriptedModel([
      {
        content: null,
        toolCalls: [{ id: "c1", name: "query_subgraph", arguments: { query: "{ pools { id } }" } }],
      },
      text("I could not query the subgraph."),
    ]);
    const { fetcher, calls } = fetchStub(200, { data: pool });
    const run = await runFlow(agentFlow({ subgraph: "" }), { model, graph, fetch: fetcher });
    expect(run.status).toBe("succeeded");
    expect(calls).toHaveLength(0);
    expect(run.nodes[1]!.outputs).toMatchObject({
      steps: [{ tool: "query_subgraph", result: "Subgraph query needs a subgraph", error: true }],
    });
  });
});
