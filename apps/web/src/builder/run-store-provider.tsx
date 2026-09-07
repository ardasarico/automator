"use client";

import type { FlowRun } from "@automator/contracts";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { createRunStore, type RunState } from "./run-store";

const RunStoreContext = createContext<StoreApi<RunState> | null>(null);

/** One run store per mounted builder, alongside the document store; `initialRun` shows a stored run. */
export function RunStoreProvider({
  initialRun = null,
  children,
}: {
  initialRun?: FlowRun | null;
  children: ReactNode;
}) {
  const [store] = useState(() => createRunStore(initialRun));
  return <RunStoreContext.Provider value={store}>{children}</RunStoreContext.Provider>;
}

export function useRunStore<T>(selector: (state: RunState) => T): T {
  const store = useContext(RunStoreContext);
  if (!store) throw new Error("useRunStore must be used inside RunStoreProvider");
  return useStore(store, selector);
}
