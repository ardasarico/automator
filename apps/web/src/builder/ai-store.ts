import {
  aiHistoryLimit,
  type AiHistoryTurn,
  type AiVerification,
  type FlowDocumentInput,
  type GenerateFlowResponse,
} from "@automator/contracts";
import { createStore, type StoreApi } from "zustand";

/**
 * A document the assistant proposed. `pending` until the user applies or discards it;
 * `stale` once another proposal was applied, since it was drawn from an older canvas.
 */
export type AiProposal = {
  document: FlowDocumentInput;
  verification?: AiVerification;
  /** True when the answer was asked as a new flow rather than an edit of the canvas. */
  replaces: boolean;
  state: "pending" | "applied" | "discarded" | "stale";
};

export type AiTurn =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      /** The model's message, or its summary of the proposal; a failure message when `error`. */
      text: string;
      proposal?: AiProposal;
      error?: true;
    };

export type AiState = {
  turns: AiTurn[];
  /** True from `ask` until the answer or failure for that request lands. */
  pending: boolean;
  /** Bumped by anything outside the panel that wants the AI tab in front. */
  focusRequests: number;
  /** Adds the user's turn and marks a request in flight; returns the turn id. */
  ask(text: string): string;
  /** Adds the assistant's answer to the request `askId` started; ignored once the thread was cleared. */
  answer(askId: string, answer: GenerateFlowResponse, options?: { replaces?: boolean }): void;
  /** Adds a failure as an assistant turn; ignored once the thread was cleared. */
  fail(askId: string, text: string): void;
  /** Marks the proposal applied and every other pending one stale. */
  apply(id: string): void;
  discard(id: string): void;
  /** Start over: drops the thread and any answer still on its way. */
  clear(): void;
  requestFocus(): void;
};

let sequence = 0;
const nextId = () => `t${(sequence += 1)}`;

/** `focusOnMount` starts with one focus request pending, so the prompt takes the cursor. */
export function createAiStore({ focusOnMount = false } = {}): StoreApi<AiState> {
  return createStore<AiState>((set, get) => ({
    turns: [],
    pending: false,
    focusRequests: focusOnMount ? 1 : 0,
    ask(text) {
      const id = nextId();
      set((state) => ({ turns: [...state.turns, { id, role: "user", text }], pending: true }));
      return id;
    },
    answer(askId, answer, options = {}) {
      if (!get().turns.some((turn) => turn.id === askId)) return;
      const turn: AiTurn =
        answer.kind === "flow"
          ? {
              id: nextId(),
              role: "assistant",
              text: answer.summary || answer.document.description || answer.document.name,
              proposal: {
                document: answer.document,
                verification: answer.verification,
                replaces: options.replaces ?? false,
                state: "pending",
              },
            }
          : { id: nextId(), role: "assistant", text: answer.text };
      set((state) => ({ turns: [...state.turns, turn], pending: false }));
    },
    fail(askId, text) {
      if (!get().turns.some((turn) => turn.id === askId)) return;
      set((state) => ({
        turns: [...state.turns, { id: nextId(), role: "assistant", text, error: true }],
        pending: false,
      }));
    },
    apply(id) {
      set((state) => ({
        turns: state.turns.map((turn) => {
          if (turn.role !== "assistant" || !turn.proposal) return turn;
          if (turn.id === id) return { ...turn, proposal: { ...turn.proposal, state: "applied" } };
          if (turn.proposal.state === "pending")
            return { ...turn, proposal: { ...turn.proposal, state: "stale" } };
          return turn;
        }),
      }));
    },
    discard(id) {
      set((state) => ({
        turns: state.turns.map((turn) =>
          turn.role === "assistant" && turn.proposal && turn.id === id
            ? { ...turn, proposal: { ...turn.proposal, state: "discarded" } }
            : turn,
        ),
      }));
    },
    clear() {
      set({ turns: [], pending: false });
    },
    requestFocus() {
      set((state) => ({ focusRequests: state.focusRequests + 1 }));
    },
  }));
}

/**
 * The thread as the API takes it: user turns and the assistant's messages or summaries,
 * failures left out, capped at the newest turns the contract allows.
 */
export function historyOf(turns: readonly AiTurn[]): AiHistoryTurn[] {
  return turns
    .filter((turn) => turn.role === "user" || !turn.error)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, 4000) }))
    .slice(-aiHistoryLimit);
}
