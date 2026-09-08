import {
  aiHistoryLimit,
  type AiHistoryTurn,
  type AiVerification,
  type FlowDocumentInput,
  type GenerateFlowResponse,
} from "@automator/contracts";
import { createStore, type StoreApi } from "zustand";

export type AiProposal = {
  document: FlowDocumentInput;
  verification?: AiVerification;
  replaces: boolean;
  state: "pending" | "applied" | "discarded" | "stale";
};

export type AiTurn =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      proposal?: AiProposal;
      error?: true;
    };

export type AiState = {
  turns: AiTurn[];
  pending: boolean;
  focusRequests: number;
  ask(text: string): string;
  answer(askId: string, answer: GenerateFlowResponse, options?: { replaces?: boolean }): void;
  fail(askId: string, text: string): void;
  apply(id: string): void;
  discard(id: string): void;
  clear(): void;
  requestFocus(): void;
};

let sequence = 0;
const nextId = () => `t${(sequence += 1)}`;

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

export function historyOf(turns: readonly AiTurn[]): AiHistoryTurn[] {
  return turns
    .filter((turn) => turn.role === "user" || !turn.error)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, 4000) }))
    .slice(-aiHistoryLimit);
}
