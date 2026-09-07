import {
  isScreenNodeType,
  type FlowDocument,
  type FlowNode,
  type ScreenNodeType,
} from "@automator/contracts";

/** The part of a flow the mini-app reads. */
export type MiniAppDocument = Pick<FlowDocument, "nodes" | "edges">;

/** A node whose type is one of the screen types. */
export type ScreenNode = FlowNode & { type: ScreenNodeType };

export function isScreenNode(node: FlowNode): node is ScreenNode {
  return isScreenNodeType(node.type);
}

/** The node a visitor's session starts from, or null when the flow is not a mini-app. */
export function findEntry(document: MiniAppDocument): FlowNode | null {
  return document.nodes.find((node) => node.type === "trigger.miniapp-open") ?? null;
}

export { screenPorts } from "@automator/contracts";
