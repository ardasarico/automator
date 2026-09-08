"use client";

import { Value } from "@automator/contracts";
import { useCallback, useMemo } from "react";
import type { PreviewTemplate } from "../components/schema-form";
import { useRunStore } from "./run-store-provider";
import { nodeRunScope, templateValue } from "./run-values";

export type RunPreview = {
  preview: PreviewTemplate;
  /** When the run that produced these values started, so the panel can name its source. */
  startedAt: string;
  /** The node's settings changed after the run, so the values are evidence of an older setup. */
  stale: boolean;
};

/** Last-run values for one node's templates, or null when no run covers it. */
export function useRunPreview(nodeId: string, config: Record<string, unknown>): RunPreview | null {
  const run = useRunStore((state) => state.run);
  const document = useRunStore((state) => state.document);

  const scope = useMemo(
    () => (run && document ? nodeRunScope(run, document, nodeId) : null),
    [document, nodeId, run],
  );
  const preview = useCallback<PreviewTemplate>(
    (path) => (scope ? templateValue(scope, run?.trigger.payload, path) : { status: "missing" }),
    [run, scope],
  );

  if (!run || !document || !scope) return null;
  const ran = document.nodes.find((node) => node.id === nodeId);
  return {
    preview,
    startedAt: run.startedAt,
    stale: !ran || !Value.Equal(ran.config, config),
  };
}
