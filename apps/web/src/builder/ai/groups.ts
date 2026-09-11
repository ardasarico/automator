import type { FlowDocument, FlowDocumentInput } from "@automator/contracts";

/**
 * Group frames are a drawing the AI never sees, so a draft always comes back without them. An
 * edit refers to the canvas's own nodes, so the frames and the memberships of the nodes it kept
 * are put back; a node the draft removed takes its membership with it, and one the draft added
 * belongs to no frame. The frames themselves are all kept: an empty one is still on the canvas.
 */
export function restoreFlowGroups(
  draft: FlowDocumentInput,
  current: Pick<FlowDocument, "nodes" | "groups">,
): FlowDocumentInput {
  const groups = current.groups ?? [];
  if (groups.length === 0) return draft;
  const frames = new Set(groups.map((group) => group.id));
  const memberships = new Map(
    current.nodes.flatMap((node) =>
      node.parentId !== undefined && frames.has(node.parentId)
        ? [[node.id, node.parentId] as const]
        : [],
    ),
  );
  return {
    ...draft,
    nodes: draft.nodes.map((node) => {
      if (node.parentId !== undefined) return node;
      const parentId = memberships.get(node.id);
      return parentId === undefined ? node : { ...node, parentId };
    }),
    groups,
  };
}
