"use client";

import {
  miniAppFailureMessage,
  type MiniAppAnswer,
  type MiniAppScreen,
  type MiniAppSession,
} from "@automator/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenNode } from "./engine";
import type { IdentityAnswer } from "./identity";
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

type SessionState = {
  kind: "session";
  session: MiniAppSession;
  token: string;
  /** Why the last answer was refused, shown above the screen it came back to. */
  notice?: string;
};
type State = { kind: "loading" } | SessionState | { kind: "unavailable"; message: string };

/** A screen from the API rendered through the same views as the document-driven mini-app. */
function toNode(screen: MiniAppScreen): ScreenNode {
  return {
    id: screen.nodeId,
    type: screen.type,
    label: screen.label,
    config: screen.config,
    position: { x: 0, y: 0 },
    ...(screen.world ? { world: screen.world } : {}),
  };
}

/**
 * Why the session request did not settle, in the visitor's terms. A client that throws the
 * API's error code (the runtime's does) lets a rejected sign-in or a rate limit read as such;
 * anything else is the app being unreachable.
 */
export function describeUnavailable(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "unauthorized")
    return "Your sign-in could not be verified. Start over and try again.";
  if (code === "rate_limited") return "Too many requests right now. Wait a moment and try again.";
  return "The app could not be reached. Try again.";
}

/** The note a screen shows when the API refused the sign-in it was answered with. */
export const signInRefusedNotice = "Your sign-in could not be verified. Try again.";

/**
 * Where a refused answer leaves the visitor: the API keeps a session on its screen when it
 * rejects a sign-in token (401), so the screen comes back with a note instead of a restart;
 * every other failure is the unavailable view.
 */
export function stateAfterFailure(cause: unknown, previous: SessionState | undefined): State {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "unauthorized" && previous)
    return {
      kind: "session",
      session: previous.session,
      token: previous.token,
      notice: signInRefusedNotice,
    };
  return { kind: "unavailable", message: describeUnavailable(cause) };
}

function toSteps(session: MiniAppSession): WorkingStep[] {
  return session.steps.map((step) => ({ id: step.nodeId, label: step.label, status: step.status }));
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

  const settle = useCallback(
    (count: number, promise: Promise<MiniAppSession>, previous?: SessionState) => {
      promise.then(
        (session) => {
          if (count !== requestCount.current) return;
          setSteps(toSteps(session));
          setState({ kind: "session", session, token: session.token ?? previous?.token ?? "" });
        },
        (cause: unknown) => {
          if (count !== requestCount.current) return;
          const next = stateAfterFailure(cause, previous);
          if (next.kind === "session") setSteps(toSteps(next.session));
          setState(next);
        },
      );
    },
    [],
  );

  // The initial state is already "loading", so opening the session sets nothing synchronously.
  useEffect(() => {
    settle(++requestCount.current, client.start());
  }, [client, settle]);

  useEffect(() => {
    if (interacted.current && state.kind === "session" && state.session.status === "screen")
      titleRef.current?.focus();
  }, [state]);

  const act = (port: string, data?: Record<string, string>, identity?: IdentityAnswer) => {
    if (state.kind !== "session") return;
    interacted.current = true;
    const count = ++requestCount.current;
    const { session, token } = state;
    setSteps([]);
    setState({ kind: "loading" });
    settle(
      count,
      client.answer(session.sessionId, { token, port, ...(data ? { data } : {}), ...identity }),
      state,
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
      <>
        {state.notice && (
          <p role="alert" className="px-5 pt-4 text-caption text-destructive-text">
            {state.notice}
          </p>
        )}
        <ScreenView
          key={state.session.screen.nodeId}
          node={toNode(state.session.screen)}
          titleRef={titleRef}
          onContinue={act}
        />
      </>
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
