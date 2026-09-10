"use client";

import {
  parseScreenConfig,
  samplePrivyUser,
  sampleWorldRejection,
  sampleWorldSelfieCheck,
  sampleWorldSelfieRejection,
  sampleWorldVerification,
  screenPorts,
  type PrivyLoginConfig,
  type WorldIdVerifyConfig,
  type WorldSelfieCheckConfig,
  type WorldProof,
  type WorldRequest,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { RiCameraLensLine, RiShieldCheckLine, RiUserLine } from "@remixicon/react";
import type React from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ScreenNode } from "./engine";

export type IdentityAnswer = {
  privyToken?: string;
  worldProof?: WorldProof;
};

export interface IdentityActions {
  privyLogin?(config: PrivyLoginConfig): Promise<{ privyToken: string }>;
  worldVerify?(
    config: WorldIdVerifyConfig,
    request: WorldRequest,
  ): Promise<{ worldProof: WorldProof }>;
  worldSelfieCheck?(
    config: WorldSelfieCheckConfig,
    request: WorldRequest,
  ): Promise<{ worldProof: WorldProof }>;
  inWorldApp?: boolean;
}

const IdentityActionsContext = createContext<IdentityActions | null>(null);

export function IdentityActionsProvider({
  actions,
  children,
}: {
  actions: IdentityActions;
  children: React.ReactNode;
}) {
  return <IdentityActionsContext value={actions}>{children}</IdentityActionsContext>;
}

export function useIdentityActions(): IdentityActions | null {
  return useContext(IdentityActionsContext);
}

export type IdentityScreenProps = {
  node: ScreenNode;
  onContinue(port: string, data?: Record<string, unknown>, identity?: IdentityAnswer): void;
  titleRef?: React.Ref<HTMLHeadingElement>;
  frame: React.ComponentType<{ children: React.ReactNode; footer?: React.ReactNode }>;
  title: React.ComponentType<{
    children: React.ReactNode;
    titleRef?: React.Ref<HTMLHeadingElement>;
  }>;
};

function describeFailure(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function useIdentityAction<T extends IdentityAnswer>(
  run: (() => Promise<T>) | undefined,
  onDone: (answer: T) => void,
  fallback: string,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);
  const inFlight = useRef(false);
  useEffect(
    () => () => {
      attempt.current += 1;
      inFlight.current = false;
    },
    [],
  );
  const start = () => {
    if (!run || inFlight.current) return;
    inFlight.current = true;
    const current = ++attempt.current;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const answer = await run();
        if (current === attempt.current) onDone(answer);
      } catch (cause) {
        if (current !== attempt.current) return;
        inFlight.current = false;
        setError(describeFailure(cause, fallback));
        setBusy(false);
      }
    })();
  };
  return { busy, error, start };
}

const methodLabels: Record<string, string> = {
  email: "Email",
  wallet: "Wallet",
  google: "Google",
  passkey: "Passkey",
};

function ProviderNote({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-caption text-muted-foreground">
      <span aria-hidden="true" className="flex size-5 items-center justify-center">
        {icon}
      </span>
      <span>{children}</span>
    </p>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  return (
    <p role="alert" className="text-caption text-destructive-text empty:hidden">
      {error}
    </p>
  );
}

export function PrivyLoginScreen({
  node,
  onContinue,
  titleRef,
  frame: Frame,
  title: Title,
}: IdentityScreenProps) {
  const config = parseScreenConfig("privy.login", node.config);
  const ports = screenPorts("privy.login");
  const actions = useIdentityActions();
  const login = actions?.privyLogin;
  const { busy, error, start } = useIdentityAction(
    login ? () => login(config) : undefined,
    (answer) => onContinue(ports.primary, undefined, answer),
    "Sign-in did not complete. Try again.",
  );
  const preview = !login;
  const sample = samplePrivyUser(config);
  const methods = config.methods.map((method) => methodLabels[method] ?? method);
  return (
    <Frame
      footer={
        <Button
          size="xl"
          loading={busy}
          loadingText="Signing in…"
          onClick={preview ? () => onContinue(ports.primary, { ...sample }) : start}
        >
          {config.button}
        </Button>
      }
    >
      <Title titleRef={titleRef}>{config.title || node.label}</Title>
      {config.message && (
        <p className="text-body whitespace-pre-line text-pretty text-muted-foreground">
          {config.message}
        </p>
      )}
      <ProviderNote icon={<RiUserLine className="size-4" />}>
        Sign in with Privy{methods.length > 0 ? `: ${methods.join(", ")}` : ""}.
      </ProviderNote>
      {preview && (
        <p className="text-caption text-muted-foreground" data-preview="privy.login">
          Preview: continues as {sample.email || sample.wallet || sample.userId}.
        </p>
      )}
      <ErrorNote error={error} />
    </Frame>
  );
}

export function WorldIdVerifyScreen({
  node,
  onContinue,
  titleRef,
  frame: Frame,
  title: Title,
}: IdentityScreenProps) {
  const config = parseScreenConfig("world.id-verify", node.config);
  const ports = screenPorts("world.id-verify");
  const actions = useIdentityActions();
  const verify = actions?.worldVerify;
  const request = node.world;
  const { busy, error, start } = useIdentityAction(
    verify && request ? () => verify(config, request) : undefined,
    (answer) => onContinue(ports.primary, undefined, answer),
    "Verification did not complete. Try again.",
  );
  const preview = !verify;
  const unconfigured = !preview && !request;
  const playSample = () => {
    if (config.simulate === "rejected")
      onContinue(ports.secondary ?? ports.primary, { ...sampleWorldRejection });
    else onContinue(ports.primary, { ...sampleWorldVerification(config) });
  };
  const level = config.verificationLevel === "orb" ? "Orb-verified World ID" : "World ID";
  return (
    <Frame
      footer={
        <Button
          size="xl"
          loading={busy}
          loadingText="Verifying…"
          disabled={unconfigured}
          onClick={preview ? playSample : start}
        >
          {config.button}
        </Button>
      }
    >
      <Title titleRef={titleRef}>{config.title || node.label}</Title>
      {config.message && (
        <p className="text-body whitespace-pre-line text-pretty text-muted-foreground">
          {config.message}
        </p>
      )}
      <ProviderNote icon={<RiShieldCheckLine className="size-4" />}>
        {actions?.inWorldApp
          ? `Proves you are a unique human with your ${level}.`
          : `Proves you are a unique human with your ${level}; scan the code with World App.`}
      </ProviderNote>
      {preview && (
        <p className="text-caption text-muted-foreground" data-preview="world.id-verify">
          Preview: continues as {config.simulate === "rejected" ? "rejected" : "verified"}.
        </p>
      )}
      {unconfigured && (
        <p className="text-caption text-destructive-text">
          {config.action
            ? "World ID is not set up for this app yet."
            : "This step has no World action configured yet."}
        </p>
      )}
      <ErrorNote error={error} />
    </Frame>
  );
}

export function WorldSelfieCheckScreen({
  node,
  onContinue,
  titleRef,
  frame: Frame,
  title: Title,
}: IdentityScreenProps) {
  const config = parseScreenConfig("world.selfie-check", node.config);
  const ports = screenPorts("world.selfie-check");
  const actions = useIdentityActions();
  const check = actions?.worldSelfieCheck;
  const request = node.world;
  const { busy, error, start } = useIdentityAction(
    check && request ? () => check(config, request) : undefined,
    (answer) => onContinue(ports.primary, undefined, answer),
    "The selfie check did not complete. Try again.",
  );
  const preview = !check;
  const unconfigured = !preview && !request;
  const playSample = () => {
    if (config.simulate === "rejected")
      onContinue(ports.secondary ?? ports.primary, { ...sampleWorldSelfieRejection });
    else onContinue(ports.primary, { ...sampleWorldSelfieCheck(config) });
  };
  return (
    <Frame
      footer={
        <Button
          size="xl"
          loading={busy}
          loadingText="Checking…"
          disabled={unconfigured}
          onClick={preview ? playSample : start}
        >
          {config.button}
        </Button>
      }
    >
      <Title titleRef={titleRef}>{config.title || node.label}</Title>
      {config.message && (
        <p className="text-body whitespace-pre-line text-pretty text-muted-foreground">
          {config.message}
        </p>
      )}
      <ProviderNote icon={<RiCameraLensLine className="size-4" />}>
        {actions?.inWorldApp
          ? "World App takes a quick selfie to confirm a live person is here; no Orb needed."
          : "World App takes a quick selfie to confirm a live person is here; scan the code with World App. No Orb needed."}
      </ProviderNote>
      {preview && (
        <p className="text-caption text-muted-foreground" data-preview="world.selfie-check">
          Preview: continues as {config.simulate === "rejected" ? "rejected" : "verified"}.
        </p>
      )}
      {unconfigured && (
        <p className="text-caption text-destructive-text">
          {config.action
            ? "World ID is not set up for this app yet."
            : "This step has no World action configured yet."}
        </p>
      )}
      <ErrorNote error={error} />
    </Frame>
  );
}
