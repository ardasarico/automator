"use client";

import { Button } from "@automator/ui/button";
import { RiSaveLine } from "@remixicon/react";
import { useCallback, useState } from "react";
import { FlowRequestError, saveFlowRequest } from "../flows/client";
import { serializeFlow } from "./document";
import { useBuilderStore } from "./store-provider";
import { useAccessToken } from "../auth/access-token";

type SaveState = "idle" | "saving" | "saved" | "failed";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This flow no longer exists.",
  invalid_flow: "The flow could not be saved: fix the highlighted problems and try again.",
};

/**
 * Sends the current document to the API. `save` is a no-op while nothing changed since the
 * last save, so the button and the Cmd+S shortcut share one rule.
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

  const canSave = dirty || state === "failed";
  const save = useCallback(async () => {
    if (!canSave || state === "saving") return;
    setState("saving");
    setMessage(null);
    const { id, ...input } = serializeFlow(meta, nodes, edges);
    try {
      await saveFlowRequest(id, await getAccessToken(), input);
      markSaved();
      setState("saved");
    } catch (error) {
      const code = error instanceof FlowRequestError ? error.code : "unavailable";
      setState("failed");
      setMessage(failureMessages[code] ?? "The flow could not be saved. Please try again.");
    }
  }, [canSave, edges, getAccessToken, markSaved, meta, nodes, state]);

  return { save, state, message, canSave, dirty };
}

/** The Save button: disabled while nothing changed, so it doubles as the unsaved indicator. */
export function SaveButton({ controller }: { controller: ReturnType<typeof useSaveFlow> }) {
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
        onClick={save}
      >
        <RiSaveLine aria-hidden="true" />
        Save
      </Button>
    </div>
  );
}
