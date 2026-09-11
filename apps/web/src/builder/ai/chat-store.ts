import type {
  AiMessage,
  AiProposalPart,
  AiProposalState,
  AiRunContext,
  AiStatusPhase,
  AiStreamEvent,
  ApiErrorCode,
  FlowProblem,
} from "@automator/contracts";
import { createStore, type StoreApi } from "zustand";
import { applyEvent, proposalOf } from "./apply-event";

export type ChatContext = { selection: string[]; problems: FlowProblem[]; run?: AiRunContext };

export type ChatState = {
  messages: AiMessage[];
  loaded: boolean;
  pending: boolean;
  streamingId: string | null;
  phase: AiStatusPhase | null;
  context: ChatContext;
  focusRequests: number;
  /** Text put into the composer by a chip or by "Something else". */
  draftPrompt: string | null;
  load(messages: AiMessage[]): void;
  begin(user: AiMessage): void;
  receive(event: AiStreamEvent): void;
  end(): void;
  fail(error: ApiErrorCode, detail?: string): void;
  setProposalState(messageId: string, state: AiProposalState): void;
  setContext(patch: Partial<ChatContext>): void;
  setDraftPrompt(text: string | null): void;
  requestFocus(): void;
  clear(): void;
};

/** Marks a message's pending proposal, if it has one, stale; returns the same message otherwise. */
function staleProposal(message: AiMessage): AiMessage {
  const proposal = proposalOf(message);
  if (!proposal || proposal.state !== "pending") return message;
  return {
    ...message,
    parts: message.parts.map((part) =>
      part === proposal ? { ...proposal, state: "stale" as const } : part,
    ),
  };
}

export function createChatStore({
  focusOnMount = false,
}: { focusOnMount?: boolean } = {}): StoreApi<ChatState> {
  let localSequence = 0;
  const nextLocalId = () => `local-${(localSequence += 1)}`;

  return createStore<ChatState>((set) => ({
    messages: [],
    loaded: false,
    pending: false,
    streamingId: null,
    phase: null,
    context: { selection: [], problems: [] },
    focusRequests: focusOnMount ? 1 : 0,
    draftPrompt: null,
    load(messages) {
      set({ messages, loaded: true });
    },
    begin(user) {
      set((state) => ({
        messages: [...state.messages.map(staleProposal), user],
        pending: true,
      }));
    },
    receive(event) {
      if (event.type === "message") {
        set((state) => {
          if (state.messages.some((message) => message.id === event.id)) {
            return { streamingId: event.id };
          }
          return {
            streamingId: event.id,
            messages: [
              ...state.messages,
              { id: event.id, role: "assistant", parts: [], createdAt: new Date().toISOString() },
            ],
          };
        });
        return;
      }
      if (event.type === "status") {
        set({ phase: event.phase });
        return;
      }
      set((state) => {
        if (state.streamingId === null) return state;
        return {
          messages: state.messages.map((message) =>
            message.id === state.streamingId ? applyEvent(message, event) : message,
          ),
        };
      });
    },
    end() {
      set({ pending: false, streamingId: null, phase: null });
    },
    fail(error, detail) {
      set((state) => {
        const streamingId = state.streamingId ?? nextLocalId();
        const streaming = state.messages.some((message) => message.id === streamingId);
        const messages = streaming
          ? state.messages
          : [
              ...state.messages,
              {
                id: streamingId,
                role: "assistant" as const,
                parts: [],
                createdAt: new Date().toISOString(),
              },
            ];
        return {
          messages: messages.map((message) =>
            message.id === streamingId
              ? applyEvent(message, {
                  type: "error",
                  error,
                  ...(detail !== undefined ? { detail } : {}),
                })
              : message,
          ),
          pending: false,
          streamingId: null,
          phase: null,
        };
      });
    },
    setProposalState(messageId, proposalState) {
      set((state) => {
        if (!state.messages.some((message) => message.id === messageId)) return state;
        return {
          messages: state.messages.map((message) => {
            if (message.id !== messageId) return message;
            const proposal = proposalOf(message);
            if (!proposal) return message;
            return {
              ...message,
              parts: message.parts.map((part) =>
                part === proposal ? { ...proposal, state: proposalState } : part,
              ),
            };
          }),
        };
      });
    },
    setContext(patch) {
      set((state) => ({ context: { ...state.context, ...patch } }));
    },
    setDraftPrompt(text) {
      set({ draftPrompt: text });
    },
    requestFocus() {
      set((state) => ({ focusRequests: state.focusRequests + 1 }));
    },
    clear() {
      set((state) => ({
        messages: [],
        context: { selection: state.context.selection, problems: [] },
        pending: false,
        streamingId: null,
        phase: null,
      }));
    },
  }));
}

export function selectPendingProposal(
  state: ChatState,
): { messageId: string; proposal: AiProposalPart } | null {
  const last = state.messages.at(-1);
  if (!last) return null;
  const proposal = proposalOf(last);
  if (!proposal || proposal.state !== "pending") return null;
  return { messageId: last.id, proposal };
}
