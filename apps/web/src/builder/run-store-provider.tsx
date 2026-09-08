"use client";

import type { FlowDocument, FlowRun } from "@automator/contracts";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { createRunStore, type RunState } from "./run-store";

const RunStoreContext = createContext<StoreApi<RunState> | null>(null);

export function RunStoreProvider({
  initialRun = null,
  initialDocument = null,
  children,
}: {
  initialRun?: FlowRun | null;
  initialDocument?: FlowDocument | null;
  children: ReactNode;
}) {
  const [store] = useState(() => createRunStore(initialRun, initialDocument));
  return <RunStoreContext.Provider value={store}>{children}</RunStoreContext.Provider>;
}

export function useRunStore<T>(selector: (state: RunState) => T): T {
  const store = useContext(RunStoreContext);
  if (!store) throw new Error("useRunStore must be used inside RunStoreProvider");
  return useStore(store, selector);
}
