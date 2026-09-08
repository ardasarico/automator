"use client";

import { useHotkey } from "../lib/hotkeys";
import { useBuilderStore } from "./store-provider";

/**
 * Canvas shortcuts are suspended while a dialog is open. Undo/redo and duplicate stay quiet
 * while typing in a field; save also works in fields when the canvas shortcuts are active.
 */
export function useCanvasHotkeys({ save, run }: { save: () => void; run: () => void }) {
  const undo = useBuilderStore((state) => state.undo);
  const redo = useBuilderStore((state) => state.redo);
  const duplicateNodes = useBuilderStore((state) => state.duplicateNodes);
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
  useHotkey(
    "mod+d",
    (event) => {
      event.preventDefault();
      if (selectedIds) duplicateNodes(selectedIds.split(","));
    },
    { scope: "canvas" },
  );
}
