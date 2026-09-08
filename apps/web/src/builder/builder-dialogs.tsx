"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { FlowSettingsDialog } from "./flow-settings-dialog";
import { ShareAppDialog } from "./share-app-dialog";
import { useBuilderStore } from "./store-provider";
import { PublishDialog } from "../marketplace/publish-dialog";

export type BuilderDialogId = "settings" | "share-app" | "listing";

export interface BuilderDialogs {
  open(dialog: BuilderDialogId): void;
  close(): void;
}

const BuilderDialogsContext = createContext<BuilderDialogs | null>(null);

/**
 * The builder's flow-wide dialogs, opened from the sidebar, the Share menu or the command menu.
 * Keeping them here means one dialog is mounted at a time, whichever surface asked for it.
 */
export function BuilderDialogsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<BuilderDialogId | null>(null);
  const meta = useBuilderStore((state) => state.meta);
  const dirty = useBuilderStore((state) => state.dirty);
  const close = useCallback(() => setOpen(null), []);
  const value = useMemo(() => ({ open: setOpen, close }), [close]);

  return (
    <BuilderDialogsContext.Provider value={value}>
      {children}
      {open === "settings" && <FlowSettingsDialog onClose={close} />}
      {open === "share-app" && <ShareAppDialog onClose={close} unsaved={dirty} />}
      {open === "listing" && (
        <PublishDialog
          onClose={close}
          flowId={meta.id}
          flowName={meta.name}
          flowDescription={meta.description}
          unsaved={dirty}
        />
      )}
    </BuilderDialogsContext.Provider>
  );
}

export function useBuilderDialogs(): BuilderDialogs {
  const value = useContext(BuilderDialogsContext);
  if (!value) throw new Error("useBuilderDialogs must be used inside BuilderDialogsProvider");
  return value;
}
