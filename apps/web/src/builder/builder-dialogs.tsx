"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CommandMenu } from "./command-menu";
import { FlowSettingsDialog } from "./flow-settings-dialog";
import { ShareAppDialog } from "./share-app-dialog";
import { useBuilderStore } from "./store-provider";
import { PublishDialog } from "../marketplace/publish-dialog";

export type BuilderDialogId = "settings" | "share-app" | "listing" | "commands";

export interface BuilderDialogs {
  /** Which dialog is showing, so a control can render its own open state. */
  current: BuilderDialogId | null;
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
  const [askedAndAnswered, setAskedAndAnswered] = useState(false);
  const params = useSearchParams();
  const meta = useBuilderStore((state) => state.meta);
  const dirty = useBuilderStore((state) => state.dirty);

  /*
   * Arriving from "Publish a flow" on the marketplace: the dialog that page promised. The URL
   * is the request, so it is read here during render rather than pushed into state by an
   * effect — an effect that sets state would only cost a second render, and the URL is already
   * a value React gives us. Anything opened by hand wins over it, and closing it settles the
   * question for good.
   */
  const requested = params.has("publish") && !askedAndAnswered ? "listing" : null;
  const current = open ?? requested;

  const close = useCallback(() => {
    setOpen(null);
    setAskedAndAnswered(true);
    /* The parameter has done its job; a reload should not ask again. */
    const rest = new URLSearchParams(window.location.search);
    if (!rest.has("publish")) return;
    rest.delete("publish");
    const query = rest.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, []);

  const value = useMemo(() => ({ current, open: setOpen, close }), [close, current]);

  return (
    <BuilderDialogsContext.Provider value={value}>
      {children}
      {/* Mounted always: it registers the shortcut that opens it. */}
      <CommandMenu />
      {current === "settings" && <FlowSettingsDialog onClose={close} />}
      {current === "share-app" && <ShareAppDialog onClose={close} unsaved={dirty} />}
      {current === "listing" && (
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
