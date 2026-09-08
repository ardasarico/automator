"use client";

import type { TriggerExecutionIssue } from "@automator/contracts";
import { useAuthSession } from "../auth/provider";
import { Button } from "@automator/ui/button";
import { useEffect, useState } from "react";
import { useAccessToken } from "../auth/access-token";
import { FlowRequestError } from "../flows/client";
import { fetchTriggerIssues } from "./trigger-issues-client";

export function TriggerIssues({ flowId }: { flowId: string }) {
  const { user } = useAuthSession();
  return (
    <TriggerIssuesForAccount
      key={`${user?.id}:${flowId}`}
      flowId={flowId}
      signedIn={Boolean(user)}
    />
  );
}

function TriggerIssuesForAccount({ flowId, signedIn }: { flowId: string; signedIn: boolean }) {
  const getAccessToken = useAccessToken();
  const [issues, setIssues] = useState<TriggerExecutionIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        const next = await fetchTriggerIssues(flowId, token, controller.signal);
        if (controller.signal.aborted) return;
        setIssues(next);
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setIssues(null);
        setError(
          caught instanceof FlowRequestError && caught.code === "unauthorized"
            ? "Your session expired. Reload to see trigger issues."
            : caught instanceof FlowRequestError && caught.code === "not_found"
              ? "This flow is no longer available."
              : "Trigger issue monitoring is unavailable.",
        );
        return;
      }
      timer = setTimeout(() => void refresh(), 15_000);
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [flowId, signedIn, getAccessToken, attempt]);

  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label="Automatic run issues">
      <h3 className="text-sm font-medium">Automatic run issues</h3>
      <p className="text-caption text-muted-foreground">
        Schedule, onchain-event, price and balance triggers. Up to 50 recent unresolved or unsaved
        outcomes.
      </p>
      <p className="text-caption text-muted-foreground" role="status">
        {!signedIn
          ? "Sign in to see trigger issues."
          : (error ??
            (issues === null
              ? "Checking trigger issues…"
              : issues.length === 0
                ? "No retained trigger issues."
                : `${issues.length} retained issue${issues.length === 1 ? "" : "s"}.`))}
      </p>
      {signedIn && error && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setError(null);
            setAttempt((value) => value + 1);
          }}
        >
          Retry issue check
        </Button>
      )}
      {issues?.map((issue) => (
        <div key={issue.id} className="min-w-0 rounded-lg border p-3 text-caption">
          <p className="break-words font-medium">
            {issue.source} · {issue.nodeId}
          </p>
          <p className="text-muted-foreground">
            Started {new Date(issue.startedAt).toLocaleString()}
          </p>
          <p className="mt-1">
            {issue.status === "completed"
              ? "Execution finished, but run history has not been saved."
              : "Execution outcome is unresolved. Actions may still be running. Further runs from these triggers are paused to prevent duplicates."}
          </p>
          {issue.record && (
            <details className="mt-2">
              <summary className="cursor-pointer">Retained execution evidence</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(issue.record, null, 2)}
              </pre>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(issue.record, null, 2)], { type: "application/json" }),
                  );
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = `trigger-evidence-${issue.id}.json`;
                  anchor.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Download evidence
              </Button>
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
