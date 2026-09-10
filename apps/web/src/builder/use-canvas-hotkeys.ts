"use client";

import { useHotkey } from "../lib/hotkeys";
import { useBuilderStore } from "./store-provider";

export function useCanvasHotkeys({ save, run }: { save: () => void; run: () => void }) {
  const undo = useBuilderStore((state) => state.undo);
  const redo = useBuilderStore((state) => state.redo);
  const duplicateNodes = useBuilderStore((state) => state.duplicateNodes);
  const selectAll = useBuilderStore((state) => state.selectAll);
  const groupNodes = useBuilderStore((state) => state.groupNodes);
  const ungroup = useBuilderStore((state) => state.ungroup);
  const selectedGroupId = useBuilderStore(
    (state) => state.nodes.find((node) => node.selected && node.type === "group")?.id ?? null,
  );
  const clearSelection = useBuilderStore((state) => state.clearSelection);
  const selectedIds = useBuilderStore((state) =>
    state.nodes
      .filter((node) => node.selected)
      .map((node) => node.id)
      .join(","),
  );

  useHotkey("mod+z", (event) => (event.preventDefault(), undo()), { scope: "canvas" });
  useHotkey("mod+shift+z", (event) => (event.preventDefault(), redo()), { scope: "canvas" });
  useHotkey("mod+s", (event) => (event.preventDefault(), save()), {
    scope: "canvas",
    allowInEditable: true,
  });
  useHotkey("mod+enter", (event) => (event.preventDefault(), run()), {
    scope: "canvas",
    allowInEditable: true,
  });
  useHotkey("mod+a", (event) => (event.preventDefault(), selectAll()), { scope: "canvas" });
  useHotkey("escape", () => clearSelection(), { scope: "canvas" });
  useHotkey(
    "mod+g",
    (event) => {
      event.preventDefault();
      if (selectedIds) groupNodes(selectedIds.split(","));
    },
    { scope: "canvas" },
  );
  useHotkey(
    "mod+shift+g",
    (event) => {
      event.preventDefault();
      if (selectedGroupId) ungroup(selectedGroupId);
    },
    { scope: "canvas" },
  );
  useHotkey(
    "mod+d",
    (event) => {
      event.preventDefault();
      if (selectedIds) duplicateNodes(selectedIds.split(","));
    },
    { scope: "canvas" },
  );
}
