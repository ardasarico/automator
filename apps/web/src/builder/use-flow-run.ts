"use client";

import type { FlowNodeType } from "@automator/contracts";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { serializeFlow } from "./document";
import { RunRequestError, runFlowRequest, runSavedFlowRequest } from "./run-client";
import { useFlowActivation } from "./flow-activation";
import { useRunStore } from "./run-store-provider";
import { useBuilderStore } from "./store-provider";
import { findSimulationTrigger, startingTriggers, triggerSamplePayload } from "./trigger-payload";
import { useAccessToken } from "../auth/access-token";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  invalid_request: "The flow could not be run: check the node settings and try again.",
  not_found: "This flow no longer exists.",
  rate_limited: "Too many requests. Try again in a moment.",
};

/** One of the triggers a run can start from, named as it reads on the canvas. */
export type SimulationTrigger = { id: string; type: FlowNodeType; label: string };

/** The one selected node, when there is exactly one: an ambiguous selection picks nothing. */
function useSelectedNodeId(): string | null {
  return useBuilderStore((state) => {
    const selected = state.nodes.filter((node) => node.selected);
    return selected.length === 1 ? (selected[0]?.id ?? null) : null;
  });
}

/**
 * Which trigger the next run starts from, and the others it could start from instead. Selecting a
 * starting trigger on the canvas chooses it, so the header, the command menu and the run itself
 * all read the same choice without keeping a second copy of it.
 */
export function useSimulationTriggers(): {
  triggers: readonly SimulationTrigger[];
  activeId: string | null;
} {
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const selectedId = useSelectedNodeId();
  return useMemo(() => {
    const triggers = startingTriggers(
      nodes.map((node) => ({ id: node.id, type: node.data.type, label: node.data.label })),
      edges,
    );
    const active = triggers.find((trigger) => trigger.id === selectedId) ?? triggers[0];
    return { triggers, activeId: active?.id ?? null };
  }, [edges, nodes, selectedId]);
}

export function useFlowRun() {
  const getAccessToken = useAccessToken();
  const status = useRunStore((state) => state.status);
  const error = useRunStore((state) => state.error);
  const start = useRunStore((state) => state.start);
  const finish = useRunStore((state) => state.finish);
  const fail = useRunStore((state) => state.fail);
  const reset = useRunStore((state) => state.reset);
  const meta = useBuilderStore((state) => state.meta);
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const dirty = useBuilderStore((state) => state.dirty);
  const selectedId = useSelectedNodeId();
  const { liveMode } = useFlowActivation();
  const mode = liveMode ? ("live" as const) : ("dry-run" as const);
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    reset();
  }, [reset]);

  const run = useCallback(
    async (triggerNodeId?: string) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      start();
      try {
        const token = await getAccessToken();
        if (controller.current !== current) return;
        const document = serializeFlow(meta, nodes, edges);
        // A named trigger wins over the selected one, and either over the first in the flow.
        const starting = findSimulationTrigger(
          document.nodes,
          document.edges,
          triggerNodeId ?? selectedId,
        );
        const trigger = starting
          ? { nodeId: starting.id, payload: triggerSamplePayload(starting) }
          : { payload: {} };
        if (dirty) {
          const result = await runFlowRequest(
            token,
            { document, trigger, screens: "auto", mode },
            current.signal,
          );
          if (controller.current === current) finish(result, document);
        } else {
          const record = await runSavedFlowRequest(
            token,
            meta.id,
            { trigger, screens: "auto", mode },
            current.signal,
          );
          if (controller.current === current) finish(record.run, record.document);
        }
      } catch (caught) {
        if (controller.current !== current) return;
        const code = caught instanceof RunRequestError ? caught.code : "unavailable";
        fail(failureMessages[code] ?? "The flow could not be run. Please try again.");
      } finally {
        if (controller.current === current) controller.current = null;
      }
    },
    [dirty, edges, fail, finish, getAccessToken, meta, mode, nodes, selectedId, start],
  );

  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  return { status, error, running: status === "running", run, stop };
}
