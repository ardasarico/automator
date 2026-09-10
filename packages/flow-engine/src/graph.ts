import { NodeExecutionError } from "./executor";

/** How a run reaches The Graph Network: the Subgraph Studio API key and, optionally, another gateway. */
export interface GraphGateway {
  apiKey: string;
  /** Origin of the gateway; the public one when absent. */
  url?: string;
}

export const graphGatewayUrl = "https://gateway.thegraph.com";

/** IPFS deployment hashes, the form Subgraph Studio shows next to a version. */
const deploymentId = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;

/**
 * Where a subgraph is queried. A full URL is used as given (a Studio development endpoint,
 * say); an id goes through the gateway, deployments and subgraphs on their own paths.
 */
export function subgraphUrl(subgraph: string, gateway: string = graphGatewayUrl): string {
  const name = subgraph.trim();
  if (/^https?:\/\//i.test(name)) return name;
  const base = gateway.replace(/\/+$/, "");
  return deploymentId.test(name)
    ? `${base}/api/deployments/id/${name}`
    : `${base}/api/subgraphs/id/${name}`;
}

export interface SubgraphQuery {
  subgraph: string;
  query: string;
  variables?: Record<string, unknown> | undefined;
}

/** The `variables` config field: blank means none, anything else has to be a JSON object. */
export function parseSubgraphVariables(text: string): Record<string, unknown> | undefined {
  if (!text.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new NodeExecutionError("Subgraph query variables must be a JSON object");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new NodeExecutionError("Subgraph query variables must be a JSON object");
  return parsed as Record<string, unknown>;
}

/**
 * Runs one GraphQL query and returns its `data`. Errors are the node's own words: a missing key
 * is a server setup problem, a rejected key or a gateway status is the provider's, and GraphQL
 * errors are the query's.
 */
export async function querySubgraph(
  fetcher: typeof fetch,
  gateway: GraphGateway | undefined,
  { subgraph, query, variables }: SubgraphQuery,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!subgraph.trim()) throw new NodeExecutionError("Subgraph query needs a subgraph");
  if (!query.trim()) throw new NodeExecutionError("Subgraph query needs a query");
  if (!gateway?.apiKey)
    throw new NodeExecutionError("Subgraph queries need a Graph API key on the server");
  const response = await fetcher(subgraphUrl(subgraph, gateway.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${gateway.apiKey}`,
    },
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
    ...(signal ? { signal } : {}),
  });
  if (response.status === 401 || response.status === 403)
    throw new NodeExecutionError("The Graph gateway rejected the API key");
  if (!response.ok) throw new NodeExecutionError(`The Graph gateway answered ${response.status}`);
  const answer = (await response.json().catch(() => null)) as {
    data?: unknown;
    errors?: { message?: unknown }[];
  } | null;
  if (Array.isArray(answer?.errors) && answer.errors.length > 0) {
    const messages = answer.errors
      .map((error) => (typeof error?.message === "string" ? error.message : ""))
      .filter(Boolean);
    throw new NodeExecutionError(
      `The subgraph answered an error${messages.length > 0 ? `: ${messages.join("; ")}` : ""}`,
    );
  }
  if (typeof answer !== "object" || answer === null || answer.data === undefined)
    throw new NodeExecutionError("The subgraph answered without data");
  return answer.data;
}
