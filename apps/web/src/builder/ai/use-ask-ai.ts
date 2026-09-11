"use client";

import type { AiRunContext, FlowProblem } from "@automator/contracts";
import { useCallback, useMemo } from "react";
import { getCatalogEntry } from "../catalog";
import { isFlowNode } from "../document";
import { useBuilderStoreApi } from "../store-provider";
import { useChatStoreApi } from "./chat-store-provider";
import { useSendMessage } from "./use-send-message";

export type AskAi = {
  /** Puts a node in the panel's context and waits for the question the user wants to ask about it. */
  askAboutNode(nodeId: string): void;
  askToFix(problems: readonly FlowProblem[]): void;
  askToExplainRun(run: AiRunContext, nodeId?: string): void;
};

export function useAskAi(): AskAi {
  const chatApi = useChatStoreApi();
  const builderApi = useBuilderStoreApi();
  const { send } = useSendMessage();

  const askAboutNode = useCallback(
    (nodeId: string) => {
      const chat = chatApi.getState();
      chat.setContext({ selection: [nodeId] });
      chat.requestFocus();
    },
    [chatApi],
  );

  const askToFix = useCallback(
    (problems: readonly FlowProblem[]) => {
      const chat = chatApi.getState();
      chat.setContext({ problems: [...problems] });
      chat.requestFocus();
      void send("Fix the problems the builder reports.");
    },
    [chatApi, send],
  );

  const askToExplainRun = useCallback(
    (run: AiRunContext, nodeId?: string) => {
      const chat = chatApi.getState();
      chat.setContext({ run: { ...run, ...(nodeId ? { nodeId } : {}) } });
      chat.requestFocus();
      const node = nodeId
        ? builderApi
            .getState()
            .nodes.filter(isFlowNode)
            .find((entry) => entry.id === nodeId)
        : undefined;
      const label = node ? node.data.label || getCatalogEntry(node.data.type).label : undefined;
      void send(label ? `Explain why "${label}" failed.` : "Explain why this run failed.");
    },
    [builderApi, chatApi, send],
  );

  return useMemo(
    () => ({ askAboutNode, askToFix, askToExplainRun }),
    [askAboutNode, askToFix, askToExplainRun],
  );
}
