"use client";

import {
  parseScreenConfig,
  samplePrivyUser,
  sampleWorldRejection,
  sampleWorldVerification,
  screenPorts,
  type PrivyLoginConfig,
  type WorldIdVerifyConfig,
  type WorldProof,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { RiShieldCheckLine, RiUserLine } from "@remixicon/react";
import type React from "react";
import { createContext, useContext, useState } from "react";
import type { ScreenNode } from "./engine";

/** What an answer to an identity screen carries besides its port; the API verifies it. */
export type IdentityAnswer = {
  privyToken?: string;
  worldProof?: WorldProof;
};

/**
 * What the host can do for an identity screen. The runtime provides both, backed by Privy
 * and by World's IDKit or MiniKit; the builder's preview and the in-browser engine provide
 * none, and the screens then play their configured sample answer instead.
 */
export interface IdentityActions {
  /** Signs the visitor in with Privy and resolves with their access token. */
  privyLogin?(config: PrivyLoginConfig): Promise<{ privyToken: string }>;
  /** Asks the visitor for a World ID proof, inside World App or through IDKit. */
  worldVerify?(config: WorldIdVerifyConfig): Promise<{ worldProof: WorldProof }>;
  /** True when the page runs inside World App, where the verify button reads differently. */
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
  /** The visitor acted: continue on `port`, with a sample record or the host's verified answer. */
  onContinue(port: string, data?: Record<string, string>, identity?: IdentityAnswer): void;
  titleRef?: React.Ref<HTMLHeadingElement>;
  /** The screen layout, passed in so this file does not depend on screens.tsx. */
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

/** Runs the host action and continues, or shows why it did not work and lets the visitor retry. */
function useIdentityAction<T extends IdentityAnswer>(
  run: (() => Promise<T>) | undefined,
  onDone: (answer: T) => void,
  fallback: string,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = () => {
    if (!run || busy) return;
    setBusy(true);
    setError(null);
    run().then(onDone, (cause: unknown) => {
      setError(describeFailure(cause, fallback));
      setBusy(false);
    });
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
  const { busy, error, start } = useIdentityAction(
    verify ? () => verify(config) : undefined,
    (answer) => onContinue(ports.primary, undefined, answer),
    "Verification did not complete. Try again.",
  );
  const preview = !verify;
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
      {!preview && !config.action && (
        <p className="text-caption text-destructive-text">
          This step has no World action configured yet.
        </p>
      )}
      <ErrorNote error={error} />
    </Frame>
  );
}
