"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export interface FlowActivation {
  /** Whether the flow's webhook and schedule triggers are live. */
  enabled: boolean;
  /** The secret path segment of the flow's webhook URL; absent for copies without one. */
  webhookToken: string | null;
  /** Records a change the server already accepted. */
  setEnabled(enabled: boolean): void;
  /** Whether Simulate sends real transactions; per canvas, never persisted. */
  liveMode: boolean;
  setLiveMode(live: boolean): void;
}

const FlowActivationContext = createContext<FlowActivation | null>(null);

/**
 * Activation lives beside the document, not in it: it changes through its own request and
 * never marks the canvas dirty. Seeded from the record the page loaded.
 */
export function FlowActivationProvider({
  enabled: initialEnabled,
  webhookToken,
  children,
}: {
  enabled: boolean;
  webhookToken: string | null;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [liveMode, setLiveMode] = useState(false);
  return (
    <FlowActivationContext.Provider
      value={{ enabled, webhookToken, setEnabled, liveMode, setLiveMode }}
    >
      {children}
    </FlowActivationContext.Provider>
  );
}

export function useFlowActivation(): FlowActivation {
  const value = useContext(FlowActivationContext);
  if (!value) throw new Error("useFlowActivation must be used inside FlowActivationProvider");
  return value;
}
