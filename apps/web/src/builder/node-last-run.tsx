"use client";

import { TemplatePreviews } from "../components/schema-form";
import styles from "./node-settings.module.css";
import { useRunStore } from "./run-store-provider";
import { describeValue } from "./run-values";
import type { RunPreview } from "./use-run-preview";

function runTime(startedAt: string): string {
  const date = new Date(startedAt);
  return Number.isNaN(date.getTime())
    ? startedAt
    : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * What the last run made of this node: every template its settings use, resolved, and what the
 * node put out. These used to sit under each field, where a long value pushed the next setting
 * off the screen; one folded section at the end keeps the form the form.
 */
export function NodeLastRun({
  nodeId,
  config,
  preview,
}: {
  nodeId: string;
  config: Record<string, unknown>;
  preview: RunPreview;
}) {
  const result = useRunStore((state) => state.run?.nodes.find((entry) => entry.nodeId === nodeId));
  const outputs = Object.entries(result?.outputs ?? {}).filter(([name]) => name !== "simulated");
  return (
    <details className={styles.lastRun} open>
      <summary className={styles.lastRunSummary}>
        Last run
        <span className={styles.lastRunTime}>{runTime(preview.startedAt)}</span>
      </summary>
      <div className={styles.lastRunBody}>
        {preview.stale && (
          <p className="text-caption text-muted-foreground">
            These settings changed since, so the values may no longer match.
          </p>
        )}
        {/* Every template across the settings, found by scanning them as one text. */}
        <TemplatePreviews text={JSON.stringify(config)} preview={preview.preview} />
        {result && result.status !== "succeeded" && (
          <p className="text-caption text-muted-foreground">
            {result.status === "failed" ? (result.error ?? "Failed.") : `Status: ${result.status}.`}
          </p>
        )}
        {outputs.length > 0 && (
          <>
            <p className={styles.lastRunCaption}>Output</p>
            <dl className="flex w-full min-w-0 flex-col gap-0.5 text-caption text-muted-foreground">
              {outputs.map(([name, value]) => {
                const described = describeValue(value);
                return (
                  <div key={name} className="flex min-w-0 items-baseline gap-1.5">
                    <dt className="max-w-1/2 truncate font-mono text-xs">{name}</dt>
                    <dd className="min-w-0 flex-1 break-words">
                      {described.status === "value" ? described.text : "not set"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        )}
      </div>
    </details>
  );
}
