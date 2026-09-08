"use client";

import { Button } from "@automator/ui/button";
import { RiSaveLine } from "@remixicon/react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { FlowRequestError, saveFlowRequest } from "../flows/client";
import { serializeFlow } from "./document";
import { useBuilderStore, useBuilderStoreApi } from "./store-provider";
import { useAccessToken } from "../auth/access-token";

type SaveState = "idle" | "saving" | "saved" | "failed";

export type SaveOutcome = { ok: true } | { ok: false; message: string };

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This flow no longer exists.",
  invalid_flow: "The flow could not be saved: fix the highlighted problems and try again.",
};

export function useSaveFlow() {
  const getAccessToken = useAccessToken();
  const store = useBuilderStoreApi();
  const dirty = useBuilderStore((state) => state.dirty);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef<Promise<SaveOutcome> | null>(null);

  const canSave = dirty || state === "failed";
  const save = useCallback((): Promise<SaveOutcome> => {
    if (inFlight.current) return inFlight.current;
    const current = store.getState();
    if (!current.dirty && state !== "failed") return Promise.resolve({ ok: true });
    setState("saving");
    setMessage(null);
    const document = serializeFlow(current.meta, current.nodes, current.edges);
    const { id, ...input } = document;
    const attempt = (async (): Promise<SaveOutcome> => {
      try {
        await saveFlowRequest(id, await getAccessToken(), input);
        if (!current.markSaved(document)) {
          const message = "The flow changed while saving. Save again to keep the latest changes.";
          setState("idle");
          setMessage(message);
          return { ok: false, message };
        }
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
  }, [getAccessToken, state, store]);

  return { save, state, message, canSave, dirty };
}

export type SaveFlowController = ReturnType<typeof useSaveFlow>;

const SaveFlowContext = createContext<SaveFlowController | null>(null);

export function SaveFlowProvider({ children }: { children: ReactNode }) {
  const controller = useSaveFlow();
  return <SaveFlowContext.Provider value={controller}>{children}</SaveFlowContext.Provider>;
}

export function useSaveFlowController(): SaveFlowController {
  const controller = useContext(SaveFlowContext);
  if (!controller) throw new Error("useSaveFlowController must be used inside SaveFlowProvider");
  return controller;
}

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
