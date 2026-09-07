"use client";

import { isScreenNodeType } from "@automator/contracts";
import { encodeDocumentHash, MiniApp } from "@automator/miniapp";
import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiExternalLinkLine, RiRestartLine } from "@remixicon/react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { serializeFlow } from "./document";
import styles from "./screen-preview.module.css";
import { selectSelectedNodes, type BuilderState } from "./store";
import { useBuilderStore } from "./store-provider";

/** Where the runtime app lives; the preview opens the current document there. */
const runtimeUrl = process.env.NEXT_PUBLIC_RUNTIME_URL ?? "http://localhost:3002";

const selectDocumentParts = (state: BuilderState) => ({
  meta: state.meta,
  nodes: state.nodes,
  edges: state.edges,
});

/**
 * The mini-app played in a phone frame from the canvas as it is now. Selecting one screen
 * node opens the preview on that screen. Adding, removing or rewiring nodes restarts the
 * session; editing a node's config does not, so copy changes show in place.
 */
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
  const startAt =
    selected.length === 1 && isScreenNodeType(selected[0]!.data.type) ? selected[0]!.id : undefined;
  const href = useMemo(
    () => `${runtimeUrl}/a/${encodeURIComponent(meta.id)}?preview${encodeDocumentHash(document)}`,
    [meta.id, document],
  );

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
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open in browser"
                render={
                  <a href={href} target="_blank" rel="noreferrer" aria-label="Open in browser" />
                }
              />
            }
          >
            <RiExternalLinkLine aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Open in browser</TooltipPopup>
        </Tooltip>
      </div>
      <div className={styles.stage}>
        <div className={styles.phone}>
          <MiniApp
            key={`${structure}|${startAt ?? ""}|${run}`}
            document={document}
            name={meta.name}
          />
        </div>
      </div>
    </div>
  );
}
