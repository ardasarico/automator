"use client";

import { createContext, useContext, useMemo } from "react";
import { serializeFlow } from "./document";
import { useBuilderStore } from "./store-provider";
import { findFlowProblems, type FlowProblem } from "./validation";

/** The problems of the document on the canvas, recomputed when the graph or configs change. */
export function useFlowProblems(): FlowProblem[] {
  const meta = useBuilderStore((state) => state.meta);
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  return useMemo(() => findFlowProblems(serializeFlow(meta, nodes, edges)), [meta, nodes, edges]);
}

/** Problems by node id, provided once above the canvas so every card reads its own. */
export const NodeProblemsContext = createContext<ReadonlyMap<string, FlowProblem[]>>(new Map());

export function groupProblemsByNode(problems: readonly FlowProblem[]): Map<string, FlowProblem[]> {
  const byNode = new Map<string, FlowProblem[]>();
  for (const problem of problems) {
    if (!problem.nodeId) continue;
    byNode.set(problem.nodeId, [...(byNode.get(problem.nodeId) ?? []), problem]);
  }
  return byNode;
}

export function useNodeProblems(id: string): FlowProblem[] {
  return useContext(NodeProblemsContext).get(id) ?? [];
}
