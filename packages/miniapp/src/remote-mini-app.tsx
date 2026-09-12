"use client";

import {
  miniAppFailureMessage,
  type MiniAppAnswer,
  type MiniAppScreen,
  type MiniAppSession,
} from "@automator/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppBar, MiniAppView } from "./chrome";
import type { ScreenNode } from "./engine";
import type { IdentityAnswer } from "./identity";
import { EndView, ScreenView, VisitorFailedView, WorkingView, type WorkingStep } from "./screens";

export interface MiniAppClient {
  start(signal?: AbortSignal): Promise<MiniAppSession>;
  answer(sessionId: string, answer: MiniAppAnswer, signal?: AbortSignal): Promise<MiniAppSession>;
}

export type RemoteMiniAppProps = {
  client: MiniAppClient;
  name?: string;
  className?: string;
};

type SessionState = {
  kind: "session";
  session: MiniAppSession;
  token: string;
  notice?: string;
};
type State = { kind: "loading" } | SessionState | { kind: "unavailable"; message: string };
const loadingState: State = { kind: "loading" };
type ClientRequests = {
  client: MiniAppClient;
  users: number;
  controller: AbortController;
  active: AbortController | null;
  promise?: Promise<MiniAppSession>;
};

function toNode(screen: MiniAppScreen): ScreenNode {
  return {
    id: screen.nodeId,
    type: screen.type,
    label: screen.label,
    config: screen.config,
    position: { x: 0, y: 0 },
    ...(screen.world ? { world: screen.world } : {}),
    ...(screen.payment ? { payment: screen.payment } : {}),
  };
}

export function describeUnavailable(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "unauthorized")
    return "Your sign-in could not be verified. Start over and try again.";
  if (code === "rate_limited") return "Too many requests right now. Wait a moment and try again.";
  return "The app could not be reached. Try again.";
}

export const signInRefusedNotice = "Your sign-in could not be verified. Try again.";

/*
 * A payment the API would not take is not the end of the session: the visitor is still on the
 * screen and can pay again, so each of these keeps the screen and says what to do about it.
 */
const retryableNotices: Record<string, string> = {
  unauthorized: signInRefusedNotice,
  payment_pending: "That payment has not landed on the network yet. Try again in a moment.",
  payment_used: "That payment has already been used. Pay again to continue.",
  payment_rejected: "That payment did not match what this app asked for. Try again.",
  payment_claim_lost:
    "Your payment went through, but this app lost track of it. Keep the transaction hash and contact the app's owner.",
};

export function stateAfterFailure(cause: unknown, previous: SessionState | undefined): State {
  const code = cause instanceof Error ? cause.message : "";
  const notice = retryableNotices[code];
  if (notice && previous)
    return { kind: "session", session: previous.session, token: previous.token, notice };
  return { kind: "unavailable", message: describeUnavailable(cause) };
}

function toSteps(session: MiniAppSession): WorkingStep[] {
  return session.steps.map((step) => ({ id: step.nodeId, label: step.label, status: step.status }));
}

function onlyStrings(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function RemoteMiniApp({ client, name, className }: RemoteMiniAppProps) {
  const [loaded, setLoaded] = useState<{ client: MiniAppClient; state: State }>({
    client,
    state: { kind: "loading" },
  });
  const state: State = loaded.client === client ? loaded.state : loadingState;
  const [steps, setSteps] = useState<WorkingStep[]>([]);
  const interacted = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const requestCount = useRef(0);
  const answerable = useRef<SessionState | null>(null);
  const requests = useRef<ClientRequests | null>(null);

  const settle = useCallback(
    (count: number, promise: Promise<MiniAppSession>, previous?: SessionState) => {
      promise.then(
        (session) => {
          if (count !== requestCount.current) return;
          setSteps(toSteps(session));
          const next: SessionState = {
            kind: "session",
            session,
            token: session.token ?? previous?.token ?? "",
          };
          answerable.current = next;
          setLoaded({ client, state: next });
        },
        (cause: unknown) => {
          if (count !== requestCount.current) return;
          const next = stateAfterFailure(cause, previous);
          if (next.kind === "session") setSteps(toSteps(next.session));
          answerable.current = next.kind === "session" ? next : null;
          setLoaded({ client, state: next });
        },
      );
    },
    [client],
  );

  useEffect(() => {
    let source = requests.current;
    if (!source || source.client !== client) {
      source = { client, users: 0, controller: new AbortController(), active: null };
      requests.current = source;
    }
    source.users += 1;
    source.active ??= source.controller;
    // Strict Mode repeats effect setup. Both setups observe the same opening request, so
    // a flow's initial work is started once rather than twice in development.
    source.promise ??= source.client.start(source.controller.signal);
    answerable.current = null;
    settle(++requestCount.current, source.promise);
    return () => {
      requestCount.current += 1;
      answerable.current = null;
      source.users -= 1;
      queueMicrotask(() => {
        if (source.users !== 0) return;
        source.controller.abort();
        source.active?.abort();
      });
    };
  }, [client, settle]);

  useEffect(() => {
    if (!interacted.current) return;
    const landed =
      state.kind === "unavailable" ||
      (state.kind === "session" &&
        (state.session.status === "screen" || state.session.status === "failed"));
    if (landed) titleRef.current?.focus();
  }, [state]);

  const act = (port: string, answered?: Record<string, unknown>, identity?: IdentityAnswer) => {
    // Only a form sends data over the wire; identity screens answer with a proof or token, and
    // their preview values never reach a hosted session.
    const data = answered ? onlyStrings(answered) : undefined;
    const source = requests.current;
    if (!source || source.client !== client) return;
    if (state.kind !== "session" || !state.session.screen || answerable.current !== state) return;
    // Consume synchronously: a second click before React renders cannot issue another answer.
    answerable.current = null;
    interacted.current = true;
    const count = ++requestCount.current;
    const { session, token } = state;
    source.active?.abort();
    source.active = new AbortController();
    setSteps([]);
    setLoaded({ client, state: { kind: "loading" } });
    settle(
      count,
      client.answer(
        session.sessionId,
        {
          token,
          nodeId: state.session.screen.nodeId,
          port,
          ...(data ? { data } : {}),
          ...identity,
        },
        source.active.signal,
      ),
      state,
    );
  };

  const restart = () => {
    const source = requests.current;
    if (!source || source.client !== client) return;
    answerable.current = null;
    interacted.current = true;
    const count = ++requestCount.current;
    setSteps([]);
    setLoaded({ client, state: { kind: "loading" } });
    source.active?.abort();
    source.active = new AbortController();
    settle(count, client.start(source.active.signal));
  };

  let body: React.ReactNode;
  let view: string;
  if (state.kind === "loading") {
    view = "loading";
    body = <WorkingView steps={loaded.client === client ? steps : []} />;
  } else if (state.kind === "unavailable") {
    view = "unavailable";
    body = <VisitorFailedView message={state.message} onRetry={restart} titleRef={titleRef} />;
  } else if (state.session.status === "screen" && state.session.screen) {
    view = `screen:${state.session.screen.nodeId}`;
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
  } else if (state.session.status === "failed") {
    view = "failed";
    body = (
      <VisitorFailedView
        message={state.session.error ?? miniAppFailureMessage}
        help={state.session.help}
        code={state.session.code ?? "node_failed"}
        onRetry={restart}
        titleRef={titleRef}
      />
    );
  } else {
    view = "end";
    body = <EndView onRestart={restart} />;
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-background text-foreground ${className ?? ""}`.trim()}
      data-session={state.kind === "session" ? state.session.status : state.kind}
    >
      {name !== undefined && <AppBar name={name} busy={state.kind === "loading"} />}
      <MiniAppView key={view} view={view}>
        {body}
      </MiniAppView>
    </div>
  );
}
