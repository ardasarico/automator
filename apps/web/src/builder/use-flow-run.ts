"use client";

import { useCallback, useEffect, useRef } from "react";
import { serializeFlow } from "./document";
import { RunRequestError, runFlowRequest, runSavedFlowRequest } from "./run-client";
import { useFlowActivation } from "./flow-activation";
import { useRunStore } from "./run-store-provider";
import { useBuilderStore } from "./store-provider";
import { findSimulationTrigger, triggerSamplePayload } from "./trigger-payload";
import { useAccessToken } from "../auth/access-token";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  invalid_request: "The flow could not be run: check the node settings and try again.",
  not_found: "This flow no longer exists.",
  rate_limited: "Too many requests. Try again in a moment.",
};

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
  const { liveMode } = useFlowActivation();
  const mode = liveMode ? ("live" as const) : ("dry-run" as const);
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    reset();
  }, [reset]);

  const run = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    start();
    try {
      const token = await getAccessToken();
      if (controller.current !== current) return;
      const document = serializeFlow(meta, nodes, edges);
      const starting = findSimulationTrigger(document.nodes, document.edges);
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
  }, [dirty, edges, fail, finish, getAccessToken, meta, mode, nodes, start]);

  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  return { status, error, running: status === "running", run, stop };
}
