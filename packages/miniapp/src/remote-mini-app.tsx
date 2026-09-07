"use client";

import {
  miniAppFailureMessage,
  type MiniAppAnswer,
  type MiniAppScreen,
  type MiniAppSession,
} from "@automator/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenNode } from "./engine";
import { EndView, ScreenView, VisitorFailedView, WorkingView, type WorkingStep } from "./screens";

/** How the page reaches the API: the runtime's same-origin handlers implement both. */
export interface MiniAppClient {
  start(): Promise<MiniAppSession>;
  answer(sessionId: string, answer: MiniAppAnswer): Promise<MiniAppSession>;
}

export type RemoteMiniAppProps = {
  client: MiniAppClient;
  /** Shown in the top bar; omit for no bar. */
  name?: string;
  className?: string;
};

type State =
  | { kind: "loading" }
  | { kind: "session"; session: MiniAppSession; token: string }
  | { kind: "unavailable"; message: string };

/** A screen from the API rendered through the same views as the document-driven mini-app. */
function toNode(screen: MiniAppScreen): ScreenNode {
  return {
    id: screen.nodeId,
    type: screen.type,
    label: screen.label,
    config: screen.config,
    position: { x: 0, y: 0 },
  };
}

function toSteps(session: MiniAppSession): WorkingStep[] {
  return session.steps.map((step) => ({ id: step.nodeId, label: step.label, status: step.status }));
}

/** What to tell the visitor when the API answered an error instead of a session. */
function unavailableMessage(error: unknown): string {
  return error instanceof Error && error.message === "rate_limited"
    ? "Too many requests right now. Wait a moment and try again."
    : "The app could not be reached. Try again.";
}

/**
 * A published flow played through the API: the server runs it and hands back only the
 * current screen, so the visitor never holds the document. Starting and every answer show
 * the working view until the API settles.
 */
export function RemoteMiniApp({ client, name, className }: RemoteMiniAppProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [steps, setSteps] = useState<WorkingStep[]>([]);
  const interacted = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const requestCount = useRef(0);

  const settle = useCallback((count: number, promise: Promise<MiniAppSession>, token?: string) => {
    promise.then(
      (session) => {
        if (count !== requestCount.current) return;
        setSteps(toSteps(session));
        setState({ kind: "session", session, token: session.token ?? token ?? "" });
      },
      (error: unknown) => {
        if (count !== requestCount.current) return;
        setState({ kind: "unavailable", message: unavailableMessage(error) });
      },
    );
  }, []);

  // The initial state is already "loading", so opening the session sets nothing synchronously.
  useEffect(() => {
    settle(++requestCount.current, client.start());
  }, [client, settle]);

  useEffect(() => {
    if (interacted.current && state.kind === "session" && state.session.status === "screen")
      titleRef.current?.focus();
  }, [state]);

  const act = (port: string, data?: Record<string, string>) => {
    if (state.kind !== "session") return;
    interacted.current = true;
    const count = ++requestCount.current;
    const { session, token } = state;
    setSteps([]);
    setState({ kind: "loading" });
    settle(
      count,
      client.answer(session.sessionId, { token, port, ...(data ? { data } : {}) }),
      token,
    );
  };

  const restart = () => {
    interacted.current = true;
    const count = ++requestCount.current;
    setSteps([]);
    setState({ kind: "loading" });
    settle(count, client.start());
  };

  let body: React.ReactNode;
  if (state.kind === "loading") body = <WorkingView steps={steps} />;
  else if (state.kind === "unavailable")
    body = <VisitorFailedView message={state.message} onRetry={restart} />;
  else if (state.session.status === "screen" && state.session.screen)
    body = (
      <ScreenView
        key={state.session.screen.nodeId}
        node={toNode(state.session.screen)}
        titleRef={titleRef}
        onContinue={act}
      />
    );
  else if (state.session.status === "failed")
    body = (
      <VisitorFailedView
        message={state.session.error ?? miniAppFailureMessage}
        help={state.session.help}
        code={state.session.code ?? "node_failed"}
        onRetry={restart}
      />
    );
  else body = <EndView onRestart={restart} />;

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-background text-foreground ${className ?? ""}`.trim()}
      data-session={state.kind === "session" ? state.session.status : state.kind}
    >
      {name !== undefined && (
        <div className="flex h-11 flex-none items-center border-b px-5 text-caption font-medium">
          <span className="truncate">{name}</span>
        </div>
      )}
      {body}
    </div>
  );
}
