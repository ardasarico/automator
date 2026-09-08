"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export interface FlowActivation {
  enabled: boolean;
  webhookToken: string | null;
  setEnabled(enabled: boolean): void;
  liveMode: boolean;
  setLiveMode(live: boolean): void;
}

const FlowActivationContext = createContext<FlowActivation | null>(null);

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
