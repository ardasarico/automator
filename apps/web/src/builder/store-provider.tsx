"use client";

import type { FlowDocument } from "@automator/contracts";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { createBuilderStore, type BuilderState } from "./store";

const BuilderStoreContext = createContext<StoreApi<BuilderState> | null>(null);

/** One store per mounted builder, so two flows never share state. */
export function BuilderStoreProvider({
  document,
  children,
}: {
  document: FlowDocument;
  children: ReactNode;
}) {
  const [store] = useState(() => createBuilderStore(document));
  return <BuilderStoreContext.Provider value={store}>{children}</BuilderStoreContext.Provider>;
}

export function useBuilderStore<T>(selector: (state: BuilderState) => T): T {
  const store = useContext(BuilderStoreContext);
  if (!store) throw new Error("useBuilderStore must be used inside BuilderStoreProvider");
  return useStore(store, selector);
}
