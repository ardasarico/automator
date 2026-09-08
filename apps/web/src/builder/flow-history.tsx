"use client";

import type { FlowVersionSummary } from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { LocalTime } from "../app/(workspace)/runs/local-time";
import { useAccessToken } from "../auth/access-token";
import { serializeFlow } from "./document";
import styles from "./flow-builder.module.css";
import { useBuilderStore, useBuilderStoreApi } from "./store-provider";
import {
  describeVersionError,
  getFlowVersionRequest,
  listFlowVersionsRequest,
} from "./versions-client";

/** The last answer to the list request, tagged with the save it was fetched for. */
type Loaded = { save: number; versions: FlowVersionSummary[]; error: string | null };

/**
 * The History section of the left panel: the flow's saved versions, newest first, with the
 * newest marked as the current one. Restore puts a version's document on the canvas as an
 * undoable edit and leaves the flow unsaved, so nothing changes on the server until the
 * user saves; the list refetches after every confirmed save.
 */
export function FlowHistory() {
  const getAccessToken = useAccessToken();
  const store = useBuilderStoreApi();
  const { fitView } = useReactFlow();
  const flowId = useBuilderStore((state) => state.meta.id);
  const saveCount = useBuilderStore((state) => state.saveCount);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [restored, setRestored] = useState<{ number: number; save: number } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restoreRequest = useRef(0);
  const fitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      restoreRequest.current += 1;
      if (fitTimeout.current !== null) clearTimeout(fitTimeout.current);
    },
    [flowId],
  );

  useEffect(() => {
    if (!flowId) return;
    const controller = new AbortController();
    const save = saveCount;
    getAccessToken()
      .then((token) => listFlowVersionsRequest(token, flowId, controller.signal))
      .then((versions) => {
        if (!controller.signal.aborted) setLoaded({ save, versions, error: null });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        // A failed refetch keeps the last list visible under the error.
        setLoaded((previous) => ({
          save,
          versions: previous?.versions ?? [],
          error: describeVersionError(caught),
        }));
      });
    return () => controller.abort();
  }, [flowId, saveCount, getAccessToken]);

  // The list is stale until the answer for the latest save arrives; the restore note
  // lasts until the next save, which makes the restored version current again.
  const loading = loaded === null || loaded.save !== saveCount;
  const versions = loaded?.versions ?? [];
  const error = restoreError ?? loaded?.error ?? null;
  const restoredNumber = restored && restored.save === saveCount ? restored.number : null;

  async function restore(number: number) {
    const request = ++restoreRequest.current;
    const before = store.getState();
    const snapshot = JSON.stringify(serializeFlow(before.meta, before.nodes, before.edges));
    setRestoring(number);
    setRestoreError(null);
    try {
      const record = await getFlowVersionRequest(await getAccessToken(), flowId, number);
      if (restoreRequest.current !== request) return;
      const current = store.getState();
      if (JSON.stringify(serializeFlow(current.meta, current.nodes, current.edges)) !== snapshot) {
        setRestoreError(
          "The flow changed while loading this version. Restore it again to replace the latest changes.",
        );
        return;
      }
      const { id: _id, ...input } = record.document;
      current.applyDocument(input);
      setRestored({ number, save: current.saveCount });
      // Nodes are new to React Flow on this render; fit once they have been measured.
      if (fitTimeout.current !== null) clearTimeout(fitTimeout.current);
      fitTimeout.current = setTimeout(() => void fitView({ padding: 0.2, duration: 300 }), 80);
    } catch (caught) {
      if (restoreRequest.current === request) setRestoreError(describeVersionError(caught));
    } finally {
      if (restoreRequest.current === request) setRestoring(null);
    }
  }

  if (!flowId)
    return (
      <div className={styles.paletteEmpty}>
        <p>Save the flow to start its history.</p>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {restoredNumber !== null && (
        <p role="status" className="border-b px-3 py-2 text-caption text-muted-foreground">
          Restored v{restoredNumber}. Save to keep it.
        </p>
      )}
      {error && (
        <p role="alert" className="border-b px-3 py-2 text-caption text-destructive-text">
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {versions.length === 0 ? (
          loading ? (
            <div className={styles.paletteEmpty} aria-busy="true">
              <p>Loading history…</p>
            </div>
          ) : (
            !loaded?.error && (
              <div className={styles.paletteEmpty}>
                <p>No versions yet.</p>
                <p>Each save that changes the flow adds one.</p>
              </div>
            )
          )
        ) : (
          <div className={styles.paletteGroup}>
            <p className={styles.paletteGroupLabel}>
              {versions.length === 1 ? "1 version" : `${versions.length} versions`}
            </p>
            <ul aria-label="Saved versions">
              {versions.map((version, index) => (
                <li key={version.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 text-caption font-medium">
                      v{version.number}
                      {index === 0 && (
                        <Badge variant="secondary" size="sm">
                          Current
                        </Badge>
                      )}
                    </span>
                    <span className="truncate text-caption text-muted-foreground">
                      <LocalTime value={version.createdAt} zone={false} /> ·{" "}
                      {version.nodeCount === 1 ? "1 node" : `${version.nodeCount} nodes`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={`Restore v${version.number}`}
                    loading={restoring === version.number}
                    disabled={restoring !== null}
                    onClick={() => void restore(version.number)}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
