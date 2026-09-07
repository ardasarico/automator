"use client";

import { useCallback } from "react";
import { useBuilderStore } from "./store-provider";

/** Selects exactly one node on the canvas, through the same change path React Flow uses. */
export function useSelectNode() {
  const onNodesChange = useBuilderStore((state) => state.onNodesChange);
  const nodes = useBuilderStore((state) => state.nodes);
  return useCallback(
    (id: string) => {
      onNodesChange(
        nodes
          .filter((node) => node.selected !== (node.id === id))
          .map((node) => ({ type: "select" as const, id: node.id, selected: node.id === id })),
      );
    },
    [nodes, onNodesChange],
  );
}
