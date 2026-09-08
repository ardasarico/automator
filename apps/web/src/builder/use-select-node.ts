"use client";

import { useCallback } from "react";
import { useBuilderStore } from "./store-provider";

/** Selects exactly one node on the canvas, through the same change path React Flow uses. */
export function useSelectNode() {
  const onNodesChange = useBuilderStore((state) => state.onNodesChange);
  const onEdgesChange = useBuilderStore((state) => state.onEdgesChange);
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  return useCallback(
    (id: string) => {
      onEdgesChange(
        edges
          .filter((edge) => edge.selected)
          .map((edge) => ({ type: "select" as const, id: edge.id, selected: false })),
      );
      onNodesChange(
        nodes
          .filter((node) => node.selected !== (node.id === id))
          .map((node) => ({ type: "select" as const, id: node.id, selected: node.id === id })),
      );
    },
    [edges, nodes, onEdgesChange, onNodesChange],
  );
}
