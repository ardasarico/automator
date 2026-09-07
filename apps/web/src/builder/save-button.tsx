"use client";

import { Button } from "@automator/ui/button";
import { RiSaveLine } from "@remixicon/react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { FlowRequestError, saveFlowRequest } from "../flows/client";
import { serializeFlow } from "./document";
import { useBuilderStore } from "./store-provider";
import { useAccessToken } from "../auth/access-token";

type SaveState = "idle" | "saving" | "saved" | "failed";

/** How one save ended; the message is what the user should read when it failed. */
export type SaveOutcome = { ok: true } | { ok: false; message: string };

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This flow no longer exists.",
  invalid_flow: "The flow could not be saved: fix the highlighted problems and try again.",
};

/**
 * Sends the current document to the API. `save` is a no-op while nothing changed since the
 * last save, so the button and the Cmd+S shortcut share one rule; it answers how the save
 * ended so the unsaved-changes dialog can leave only on success. A save asked for while one
 * is still running answers that running save's outcome rather than a hopeful `ok`.
 */
export function useSaveFlow() {
  const getAccessToken = useAccessToken();
  const meta = useBuilderStore((state) => state.meta);
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const dirty = useBuilderStore((state) => state.dirty);
  const markSaved = useBuilderStore((state) => state.markSaved);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef<Promise<SaveOutcome> | null>(null);

  const canSave = dirty || state === "failed";
  const save = useCallback((): Promise<SaveOutcome> => {
    if (inFlight.current) return inFlight.current;
    if (!canSave) return Promise.resolve({ ok: true });
    setState("saving");
    setMessage(null);
    const { id, ...input } = serializeFlow(meta, nodes, edges);
    const attempt = (async (): Promise<SaveOutcome> => {
      try {
        await saveFlowRequest(id, await getAccessToken(), input);
        markSaved();
        setState("saved");
        return { ok: true };
      } catch (error) {
        const code = error instanceof FlowRequestError ? error.code : "unavailable";
        const failure = failureMessages[code] ?? "The flow could not be saved. Please try again.";
        setState("failed");
        setMessage(failure);
        return { ok: false, message: failure };
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = attempt;
    return attempt;
  }, [canSave, edges, getAccessToken, markSaved, meta, nodes]);

  return { save, state, message, canSave, dirty };
}

export type SaveFlowController = ReturnType<typeof useSaveFlow>;

const SaveFlowContext = createContext<SaveFlowController | null>(null);

/** One save controller per builder, shared by the Save button, Cmd+S and the leave dialog. */
export function SaveFlowProvider({ children }: { children: ReactNode }) {
  const controller = useSaveFlow();
  return <SaveFlowContext.Provider value={controller}>{children}</SaveFlowContext.Provider>;
}

export function useSaveFlowController(): SaveFlowController {
  const controller = useContext(SaveFlowContext);
  if (!controller) throw new Error("useSaveFlowController must be used inside SaveFlowProvider");
  return controller;
}

/** The Save button: disabled while nothing changed, so it doubles as the unsaved indicator. */
export function SaveButton({ controller }: { controller: SaveFlowController }) {
  const { save, state, message, canSave, dirty } = controller;
  return (
    <div className="ml-auto flex items-center gap-2">
      {message && (
        <p role="alert" className="text-caption text-destructive-text">
          {message}
        </p>
      )}
      {state === "saved" && !dirty && (
        <p role="status" className="text-caption text-muted-foreground">
          Saved
        </p>
      )}
      <Button
        variant="secondary"
        size="sm"
        loading={state === "saving"}
        disabled={!canSave}
        onClick={() => void save()}
      >
        <RiSaveLine aria-hidden="true" />
        Save
      </Button>
    </div>
  );
}
