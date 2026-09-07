"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { createAiStore, type AiState } from "./ai-store";

const AiStoreContext = createContext<StoreApi<AiState> | null>(null);

/** One AI thread per mounted builder, beside the document and run stores; never persisted. */
export function AiStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAiStore());
  return <AiStoreContext.Provider value={store}>{children}</AiStoreContext.Provider>;
}

export function useAiStore<T>(selector: (state: AiState) => T): T {
  const store = useContext(AiStoreContext);
  if (!store) throw new Error("useAiStore must be used inside AiStoreProvider");
  return useStore(store, selector);
}
