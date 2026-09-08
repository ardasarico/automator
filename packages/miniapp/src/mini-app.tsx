"use client";

import { resolveTemplates } from "@automator/flow-engine";
import type { FlowDocument, FlowRun, FlowRunNodeResult } from "@automator/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { isScreenNode, type ScreenNode } from "./engine";
import {
  EndView,
  FailedView,
  NoEntryView,
  ScreenView,
  WorkingView,
  type WorkingStep,
} from "./screens";
import {
  continueSession,
  openSession,
  settleRun,
  type EngineOptions,
  type SessionState,
} from "./session";

export type MiniAppProps = {
  document: FlowDocument;
  /** Shown in the top bar; omit for no bar. */
  name?: string;
  /** A screen node id to open on instead of running from the trigger. */
  startAt?: string;
  /** Engine overrides; the defaults run the real executors in this browser. */
  engine?: EngineOptions;
  className?: string;
};

const noEngineOverrides: EngineOptions = {};

/**
 * A flow played as its visitor sees it, on the real flow engine in the browser. Opening runs
 * the flow from its mini-app trigger to the first screen; each visitor action resumes it from
 * that screen with the visitor's choice as the screen's output, so form values reach the nodes
 * wired after it. The session starts once, on mount; remount with a new `key` to restart from
 * a changed document or start node.
 */
export function MiniApp({
  document,
  name,
  startAt,
  engine = noEngineOverrides,
  className,
}: MiniAppProps) {
  const [session, setSession] = useState<SessionState>(() =>
    startAt !== undefined &&
    document.nodes.some((node) => node.id === startAt && isScreenNode(node))
      ? { kind: "screen", nodeId: startAt }
      : { kind: "running", results: [] },
  );
  // The latest document and engine, read when a run starts rather than captured at mount, so
  // a preview that edits config between runs continues with the edited flow.
  const latest = useRef({ document, engine });
  useEffect(() => {
    latest.current = { document, engine };
  }, [document, engine]);
  const variables = useRef<Record<string, unknown>>({});
  const completed = useRef<FlowRunNodeResult[]>([]);
  const payload = useRef({ openedAt: new Date().toISOString() });
  const interacted = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  /** Increments per run, so a run abandoned by Start over cannot land its results later. */
  const runCount = useRef(0);
  const activeRun = useRef<AbortController | null>(null);
  const running = useRef(false);

  const launch = useCallback(
    (
      start: (
        onNodeResult: (result: FlowRunNodeResult) => void,
        signal: AbortSignal,
      ) => Promise<FlowRun> | null,
    ) => {
      const count = ++runCount.current;
      activeRun.current?.abort();
      const controller = new AbortController();
      activeRun.current = controller;
      running.current = true;
      const run = start((result) => {
        if (count !== runCount.current) return;
        setSession((current) =>
          current.kind === "running"
            ? { ...current, results: [...current.results, result] }
            : current,
        );
      }, controller.signal);
      if (!run) {
        running.current = false;
        setSession({ kind: "no-entry" });
        return;
      }
      setSession({ kind: "running", results: [] });
      void run.then((finished) => {
        if (count !== runCount.current) return;
        running.current = false;
        variables.current = finished.variables;
        completed.current = finished.nodes;
        setSession(settleRun(finished, latest.current.document));
      });
    },
    [],
  );

  const open = useCallback(
    () =>
      launch((onNodeResult, signal) =>
        openSession(
          latest.current.document,
          payload.current,
          latest.current.engine,
          onNodeResult,
          signal,
        ),
      ),
    [launch],
  );

  // Runs once per mount unless the session opened directly on a screen.
  const startedOnScreen = useRef(session.kind === "screen");
  useEffect(() => {
    if (!startedOnScreen.current) open();
    return () => {
      runCount.current += 1;
      activeRun.current?.abort();
      running.current = false;
    };
  }, [open]);

  // Only after the visitor acted: a preview that re-renders while its author edits must not
  // pull focus away from the canvas.
  useEffect(() => {
    if (interacted.current && session.kind === "screen") titleRef.current?.focus();
  }, [session]);

  const screen = currentScreen(document, session);

  const restart = () => {
    if (running.current) return;
    interacted.current = true;
    variables.current = {};
    completed.current = [];
    open();
  };

  const act = (node: ScreenNode, port: string, data?: Record<string, string>) => {
    if (running.current) return;
    interacted.current = true;
    launch((onNodeResult, signal) =>
      continueSession(
        latest.current.document,
        payload.current,
        latest.current.engine,
        { nodeId: node.id, port, data, variables: variables.current, completed: completed.current },
        onNodeResult,
        signal,
      ),
    );
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-background text-foreground ${className ?? ""}`.trim()}
      data-session={session.kind}
    >
      {name !== undefined && (
        <div className="flex h-11 flex-none items-center border-b px-5 text-caption font-medium">
          <span className="truncate">{name}</span>
        </div>
      )}
      {session.kind === "screen" && screen ? (
        <ScreenView
          key={screen.id}
          node={screen}
          titleRef={titleRef}
          onContinue={(port, data) => act(screen, port, data)}
        />
      ) : session.kind === "running" ? (
        <WorkingView steps={workingSteps(document, session.results)} />
      ) : session.kind === "failed" ? (
        <FailedView
          label={document.nodes.find((node) => node.id === session.nodeId)?.label}
          error={session.error}
          onRestart={restart}
        />
      ) : session.kind === "no-entry" ? (
        <NoEntryView />
      ) : (
        <EndView onRestart={restart} />
      )}
    </div>
  );
}

/** The screen node the session is on, fresh from the document; null once it was removed. */
function currentScreen(document: FlowDocument, session: SessionState): ScreenNode | null {
  if (session.kind !== "screen") return null;
  const node = document.nodes.find((candidate) => candidate.id === session.nodeId);
  if (!node || !isScreenNode(node)) return null;
  return session.scope ? { ...node, config: resolveTemplates(node.config, session.scope) } : node;
}

/** The steps worth showing while a run is in progress: what ran, in order, minus the skipped and the screens. */
function workingSteps(document: FlowDocument, results: FlowRunNodeResult[]): WorkingStep[] {
  const steps: WorkingStep[] = [];
  for (const result of results) {
    if (result.status === "skipped") continue;
    const node = document.nodes.find((candidate) => candidate.id === result.nodeId);
    if (!node || isScreenNode(node) || node.type.startsWith("trigger.")) continue;
    steps.push({ id: node.id, label: node.label, status: result.status, error: result.error });
  }
  return steps;
}
