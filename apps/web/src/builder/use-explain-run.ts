"use client";

import { redactFlowSecrets, redactRunOutputs } from "@automator/contracts";
import { useCallback } from "react";
import { describeAiFailure, explainRunRequest } from "./ai-client";
import { useAiStore } from "./ai-store-provider";
import { getCatalogEntry } from "./catalog";
import { serializeFlow } from "./document";
import { useRunStore } from "./run-store-provider";
import { useBuilderStore } from "./store-provider";
import { useAccessToken } from "../auth/access-token";

/**
 * "Explain with AI" for the last run: posts the canvas document (secret fields blanked) and
 * the run's results (outputs, errors and trigger payload redacted) to the API, as a turn of
 * the AI thread, and brings the AI tab in front. `nodeId` names the failed node to explain;
 * without it the API picks the first failed node or the run-wide error.
 */
export function useExplainRun() {
  const getAccessToken = useAccessToken();
  const run = useRunStore((state) => state.run);
  const meta = useBuilderStore((state) => state.meta);
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const ask = useAiStore((state) => state.ask);
  const answer = useAiStore((state) => state.answer);
  const fail = useAiStore((state) => state.fail);
  const requestFocus = useAiStore((state) => state.requestFocus);
  const pending = useAiStore((state) => state.pending);

  const explain = useCallback(
    async (nodeId?: string) => {
      if (!run || pending) return;
      const node = nodeId ? nodes.find((entry) => entry.id === nodeId) : undefined;
      const label = node ? node.data.label || getCatalogEntry(node.data.type).label : undefined;
      const askId = ask(label ? `Explain why "${label}" failed.` : "Explain why this run failed.");
      requestFocus();
      const { id: _id, ...document } = serializeFlow(meta, nodes, edges);
      try {
        const result = await explainRunRequest(await getAccessToken(), {
          document: redactFlowSecrets(document),
          run: redactRunOutputs({
            status: run.status,
            trigger: run.trigger,
            nodes: run.nodes,
            ...(run.error === undefined ? {} : { error: run.error }),
          }),
          ...(nodeId ? { nodeId } : {}),
        });
        answer(askId, result);
      } catch (error) {
        fail(askId, describeAiFailure(error));
      }
    },
    [answer, ask, edges, fail, getAccessToken, meta, nodes, pending, requestFocus, run],
  );

  return { explain, pending };
}
