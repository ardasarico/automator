"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useHotkey } from "../lib/hotkeys";
import { SIDEBAR_COOKIE, setPreferenceCookie } from "../lib/preferences";
export type SidebarState = "open" | "collapsed";
const SidebarContext = createContext<{
  state: SidebarState;
  setState: (state: SidebarState) => void;
} | null>(null);
export function SidebarProvider({
  children,
  defaultState,
}: {
  children: ReactNode;
  defaultState: SidebarState;
}) {
  const [state, setStateInternal] = useState(defaultState);
  const setState = useCallback((next: SidebarState) => {
    setStateInternal(next);
    setPreferenceCookie(SIDEBAR_COOKIE, next);
  }, []);
  useHotkey("mod+shift+s", (event) => {
    event.preventDefault();
    setState(state === "open" ? "collapsed" : "open");
  });
  return <SidebarContext.Provider value={{ state, setState }}>{children}</SidebarContext.Provider>;
}
export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar requires SidebarProvider");
  return context;
}
