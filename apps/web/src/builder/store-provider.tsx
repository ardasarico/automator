"use client";

import type { FlowDocument } from "@automator/contracts";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { PreviewHandoffProvider } from "./preview-handoff-provider";
import { createBuilderStore, type BuilderState } from "./store";

const BuilderStoreContext = createContext<StoreApi<BuilderState> | null>(null);

export function BuilderStoreProvider({
  document,
  children,
}: {
  document: FlowDocument;
  children: ReactNode;
}) {
  const [store] = useState(() => createBuilderStore(document));
  return (
    <BuilderStoreContext.Provider value={store}>
      <PreviewHandoffProvider>{children}</PreviewHandoffProvider>
    </BuilderStoreContext.Provider>
  );
}

export function useBuilderStoreApi(): StoreApi<BuilderState> {
  const store = useContext(BuilderStoreContext);
  if (!store) throw new Error("useBuilderStore must be used inside BuilderStoreProvider");
  return store;
}

export function useBuilderStore<T>(selector: (state: BuilderState) => T): T {
  return useStore(useBuilderStoreApi(), selector);
}

/** A store nothing writes to, for cards drawn where there is no builder. */
let inert: StoreApi<BuilderState> | null = null;
function inertStore(): StoreApi<BuilderState> {
  inert ??= createBuilderStore({
    version: 1,
    id: "preview",
    name: "",
    description: "",
    nodes: [],
    edges: [],
  });
  return inert;
}

/**
 * The same read for a card that may sit outside the builder, such as the marketplace preview:
 * without a provider it reads an inert store instead of throwing, so the card renders and
 * its edits go nowhere.
 */
export function useBuilderStoreIfAny<T>(selector: (state: BuilderState) => T): T {
  const store = useContext(BuilderStoreContext);
  return useStore(store ?? inertStore(), selector);
}
