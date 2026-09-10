import type { FlowDocument, FlowDocumentInput, FlowEdge, FlowNode } from "@automator/contracts";

/** What a draft does to one node or one connection. */
export type DraftKind = "added" | "changed" | "removed" | "kept";
export type Change = { kind: DraftKind; id: string; label: string; type: string };

export function diffNodes(current: readonly FlowNode[], next: readonly FlowNode[]): Change[] {
  const before = new Map(current.map((node) => [node.id, node]));
  const changes: Change[] = next.map((node) => {
    const previous = before.get(node.id);
    if (!previous) return { kind: "added", id: node.id, label: node.label, type: node.type };
    const same =
      previous.type === node.type &&
      previous.label === node.label &&
      JSON.stringify(previous.config) === JSON.stringify(node.config);
    return { kind: same ? "kept" : "changed", id: node.id, label: node.label, type: node.type };
  });
  const after = new Set(next.map((node) => node.id));
  for (const node of current) {
    if (!after.has(node.id))
      changes.push({ kind: "removed", id: node.id, label: node.label, type: node.type });
  }
  return changes;
}

/** Edge ids are bookkeeping; a connection changes when an endpoint or handle changes. */
export function diffConnections(current: readonly FlowEdge[], next: readonly FlowEdge[]) {
  const key = (edge: FlowEdge) =>
    JSON.stringify([edge.source, edge.sourceHandle, edge.target, edge.targetHandle]);
  const remaining = [...current];
  const changes: { kind: "added" | "removed"; edge: FlowEdge }[] = [];
  for (const edge of next) {
    const index = remaining.findIndex((previous) => key(previous) === key(edge));
    if (index === -1) changes.push({ kind: "added", edge });
    else remaining.splice(index, 1);
  }
  return [...changes, ...remaining.map((edge) => ({ kind: "removed" as const, edge }))];
}

/**
 * What the canvas draws for a draft, by node id and edge id. Removed nodes and edges come from
 * the current document, so a proposal's deletions can be shown alongside what it keeps. An edge
 * that survives with a moved endpoint reads as added, since the connection itself is new.
 */
export function previewKinds(
  current: Pick<FlowDocument, "nodes" | "edges">,
  next: Pick<FlowDocumentInput, "nodes" | "edges">,
): Map<string, DraftKind> {
  const kinds = new Map<string, DraftKind>();
  for (const change of diffNodes(current.nodes, next.nodes)) kinds.set(change.id, change.kind);
  const connections = diffConnections(current.edges, next.edges);
  for (const change of connections) {
    if (change.kind === "removed") kinds.set(change.edge.id, "removed");
  }
  // The draft's own edges win over a removed one that happens to carry the same id.
  const added = new Set(
    connections.flatMap((change) => (change.kind === "added" ? [change.edge.id] : [])),
  );
  for (const edge of next.edges) kinds.set(edge.id, added.has(edge.id) ? "added" : "kept");
  return kinds;
}
