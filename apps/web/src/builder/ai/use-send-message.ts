"use client";

import {
  aiStoppedDetail,
  apiErrorCodeSchema,
  redactFlowSecrets,
  redactRunOutputs,
  restoreFlowSecrets,
  Value,
  type AiContext,
  type AiStreamEvent,
  type ApiErrorCode,
  type FlowDocument,
  type FlowDocumentInput,
} from "@automator/contracts";
import { useReactFlow } from "@xyflow/react";
import { useCallback, useMemo } from "react";
import { useAccessToken } from "../../auth/access-token";
import { isFlowNode, serializeFlow } from "../document";
import { selectSelectedNodes, type BuilderState } from "../store";
import { useBuilderStoreApi } from "../store-provider";
import { proposalOf } from "./apply-event";
import type { ChatContext } from "./chat-store";
import { useChatStoreApi } from "./chat-store-provider";
import { useReducedMotion } from "./reduced-motion";
import { AiRequestError, clearAiMessages, sendAiMessage, setAiProposalState } from "./transport";

/** What a stopped turn reads, whether the panel ended the wait or the API did. */
export const stoppedByUser = aiStoppedDetail;

/*
 * The turn in flight, shared by every copy of this hook on the page. A page holds one builder and
 * runs one turn at a time, and Stop in the panel has to reach a turn the run panel started through
 * its own copy, which a ref inside the hook could not do.
 */
const inFlight: { controller: AbortController | null } = { controller: null };

/* Ids for the messages the panel adds before the API has named them. */
let localMessages = 0;

export type SendMessage = {
  send(text: string): Promise<void>;
  stop(): void;
  apply(messageId: string): Promise<void>;
  discard(messageId: string): Promise<void>;
  startOver(): Promise<void>;
};

/** What the canvas has picked, which is what a message is about unless the panel was told otherwise. */
function selectionOf(state: BuilderState, context: ChatContext): string[] {
  if (context.selection.length > 0) return context.selection;
  return selectSelectedNodes(state)
    .filter(isFlowNode)
    .map((node) => node.id);
}

function contextOf(context: ChatContext, selection: readonly string[]): AiContext | undefined {
  const value: AiContext = {
    ...(selection.length > 0 ? { selection: [...selection] } : {}),
    ...(context.problems.length > 0 ? { problems: context.problems } : {}),
    /* A run's outputs are the one place a secret can reach the model by accident. */
    ...(context.run ? { run: redactRunOutputs(context.run) } : {}),
  };
  return Object.keys(value).length === 0 ? undefined : value;
}

function errorCode(error: unknown): ApiErrorCode {
  const code = error instanceof AiRequestError ? error.code : "unavailable";
  return Value.Check(apiErrorCodeSchema, code) ? code : "unavailable";
}

/**
 * A draft from an edit refers to the canvas's own nodes, so the secrets the model never saw are
 * put back before it is drawn or applied; the frames it never saw are carried over by the store,
 * which is what `keepGroups` asks of it. A replacement inherits neither: its ids are its own.
 */
function bridged(
  document: FlowDocumentInput,
  current: FlowDocument,
  replaces: boolean,
): FlowDocumentInput {
  return replaces ? document : restoreFlowSecrets(document, current);
}

export function useSendMessage(): SendMessage {
  const getAccessToken = useAccessToken();
  const { fitView } = useReactFlow();
  const reducedMotion = useReducedMotion();
  const builderApi = useBuilderStoreApi();
  const chatApi = useChatStoreApi();

  const record = useCallback(
    async (flowId: string, messageId: string, state: "applied" | "discarded") => {
      try {
        await setAiProposalState(await getAccessToken(), flowId, messageId, state);
      } catch (error) {
        // The canvas already changed; a lost state only costs the card its label on reload.
        console.warn("The proposal's state could not be saved.", error);
      }
    },
    [getAccessToken],
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      const chat = chatApi.getState();
      if (message === "" || chat.pending) return;
      const builder = builderApi.getState();
      const current = serializeFlow(builder.meta, builder.nodes, builder.edges);
      const { id: _id, ...document } = current;
      const context = contextOf(chat.context, selectionOf(builder, chat.context));
      /* One draft at a time: asking again puts the canvas back before the next one is drawn. */
      builder.setPreview(null);
      localMessages += 1;
      chat.begin({
        id: `local-user-${localMessages}`,
        role: "user",
        parts: [{ type: "text", text: message }],
        ...(context ? { context } : {}),
        createdAt: new Date().toISOString(),
      });
      /* What the API will answer with: a replacement, or an edit of what the canvas holds. The
       * canvas decides — an empty one has nothing to edit — and the stream's `tool.result`
       * carries no `replaces` of its own, so its preview reads this. */
      const replacing = current.nodes.length === 0;
      const controller = new AbortController();
      inFlight.controller = controller;
      const onEvent = (event: AiStreamEvent) => {
        chatApi.getState().receive(event);
        if (event.type === "tool.result" && event.document)
          builderApi
            .getState()
            .setPreview(bridged(event.document, current, replacing), { keepGroups: !replacing });
        else if (event.type === "proposal")
          builderApi.getState().setPreview(bridged(event.document, current, event.replaces), {
            keepGroups: !event.replaces,
          });
        else if (event.type === "done") chatApi.getState().end();
      };
      try {
        await sendAiMessage(
          await getAccessToken(),
          current.id,
          {
            text: message,
            // A new flow starts from nothing: it sends no canvas, and says so, or the API would
            // read the saved flow and edit that instead. An edit sends the canvas, secrets blanked.
            ...(replacing ? { replace: true } : { document: redactFlowSecrets(document) }),
            ...(context ? { context } : {}),
          },
          onEvent,
          controller.signal,
        );
        chatApi.getState().end();
      } catch (error) {
        if (controller.signal.aborted) chatApi.getState().fail("unavailable", stoppedByUser);
        else
          chatApi
            .getState()
            .fail(errorCode(error), error instanceof AiRequestError ? error.detail : undefined);
      } finally {
        if (inFlight.controller === controller) inFlight.controller = null;
      }
    },
    [builderApi, chatApi, getAccessToken],
  );

  const settle = useCallback(
    async (messageId: string, state: "applied" | "discarded") => {
      const chat = chatApi.getState();
      const message = chat.messages.find((entry) => entry.id === messageId);
      const proposal = message && proposalOf(message);
      if (!proposal || proposal.state !== "pending") return;
      const builder = builderApi.getState();
      const current = serializeFlow(builder.meta, builder.nodes, builder.edges);
      if (state === "applied")
        builder.applyDocument(bridged(proposal.document, current, proposal.replaces), {
          keepGroups: !proposal.replaces,
        });
      builder.setPreview(null);
      chat.setProposalState(messageId, state);
      if (state === "applied")
        // Nodes are new to React Flow on this render; fit once they have been measured.
        setTimeout(() => void fitView({ padding: 0.2, duration: reducedMotion ? 0 : 300 }), 80);
      await record(current.id, messageId, state);
    },
    [builderApi, chatApi, fitView, record, reducedMotion],
  );

  const startOver = useCallback(async () => {
    const builder = builderApi.getState();
    inFlight.controller?.abort();
    chatApi.getState().clear();
    builder.setPreview(null);
    try {
      await clearAiMessages(await getAccessToken(), builder.meta.id);
    } catch (error) {
      // The panel is empty either way; the stored conversation comes back on the next reload.
      console.warn("The conversation could not be cleared.", error);
    }
  }, [builderApi, chatApi, getAccessToken]);

  return useMemo(
    () => ({
      send,
      stop: () => inFlight.controller?.abort(),
      apply: (messageId: string) => settle(messageId, "applied"),
      discard: (messageId: string) => settle(messageId, "discarded"),
      startOver,
    }),
    [send, settle, startOver],
  );
}
