import {
  isScreenNodeType,
  type FlowDocument,
  type FlowNode,
  type ScreenNodeType,
  type WorldRequest,
} from "@automator/contracts";

/** The part of a flow the mini-app reads. */
export type MiniAppDocument = Pick<FlowDocument, "nodes" | "edges">;

/**
 * A node whose type is one of the screen types. A World ID screen served by the API also
 * carries the signed request context IDKit needs; the in-browser preview never has one.
 */
export type ScreenNode = FlowNode & { type: ScreenNodeType; world?: WorldRequest };

export function isScreenNode(node: FlowNode): node is ScreenNode {
  return isScreenNodeType(node.type);
}

/** The node a visitor's session starts from, or null when the flow is not a mini-app. */
export function findEntry(document: MiniAppDocument): FlowNode | null {
  return document.nodes.find((node) => node.type === "trigger.miniapp-open") ?? null;
}

export { screenPorts } from "@automator/contracts";
