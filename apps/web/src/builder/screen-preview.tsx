"use client";

import { isScreenNodeType } from "@automator/contracts";
import { MiniApp } from "@automator/miniapp";
import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiExternalLinkLine, RiRestartLine } from "@remixicon/react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { serializeFlow, isFlowNode } from "./document";
import { useOpenPreview } from "./preview-handoff-provider";
import styles from "./screen-preview.module.css";
import { selectSelectedNodes, type BuilderState, selectFlowNodes } from "./store";
import { useBuilderStore } from "./store-provider";

const selectDocumentParts = (state: BuilderState) => ({
  meta: state.meta,
  nodes: selectFlowNodes(state),
  edges: state.edges,
});

export function ScreenPreview() {
  const { meta, nodes, edges } = useBuilderStore(useShallow(selectDocumentParts));
  const selected = useBuilderStore(useShallow(selectSelectedNodes));
  const [run, setRun] = useState(0);

  const document = useMemo(() => serializeFlow(meta, nodes, edges), [meta, nodes, edges]);
  const structure = useMemo(
    () =>
      [
        ...nodes.map((node) => `${node.id}:${node.data.type}`),
        ...edges.map(
          (edge) =>
            `${edge.source}.${edge.sourceHandle ?? ""}>${edge.target}.${edge.targetHandle ?? ""}`,
        ),
      ].join("|"),
    [nodes, edges],
  );
  const first = selected.length === 1 ? selected[0] : undefined;
  const startAt =
    first && isFlowNode(first) && isScreenNodeType(first.data.type) ? first.id : undefined;
  const openPreview = useOpenPreview();
  const [previewError, setPreviewError] = useState<string | null>(null);
  const open = () => {
    setPreviewError(
      openPreview(document) ? null : "Allow pop-ups for Automator, then open the preview again.",
    );
  };

  return (
    <div className={styles.preview}>
      <div className={styles.tools}>
        <span className={styles.toolsLabel}>
          {startAt ? "Previewing the selected screen" : "Previewing from the trigger"}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Restart preview"
                onClick={() => setRun((count) => count + 1)}
              />
            }
          >
            <RiRestartLine aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Restart</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Open in browser" onClick={open} />
            }
          >
            <RiExternalLinkLine aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Open in browser</TooltipPopup>
        </Tooltip>
      </div>
      {previewError && <p role="alert">{previewError}</p>}
      <div className={styles.stage}>
        <div className={styles.phone}>
          <MiniApp
            key={`${structure}|${startAt ?? ""}|${run}`}
            document={document}
            name={meta.name}
            startAt={startAt}
          />
        </div>
      </div>
    </div>
  );
}
