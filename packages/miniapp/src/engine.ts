import {
  isScreenNodeType,
  type FlowDocument,
  type FlowNode,
  type ScreenNodeType,
  type WorldRequest,
} from "@automator/contracts";

export type MiniAppDocument = Pick<FlowDocument, "nodes" | "edges">;

export type ScreenNode = FlowNode & { type: ScreenNodeType; world?: WorldRequest };

export function isScreenNode(node: FlowNode): node is ScreenNode {
  return isScreenNodeType(node.type);
}

export function findEntry(document: MiniAppDocument): FlowNode | null {
  return document.nodes.find((node) => node.type === "trigger.miniapp-open") ?? null;
}

export { screenPorts } from "@automator/contracts";
