"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
  function setState(next: SidebarState) {
    setStateInternal(next);
    document.cookie = `workspace_sidebar=${next}; path=/; max-age=31536000; SameSite=Lax`;
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable=true]")
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setState(state === "open" ? "collapsed" : "open");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state]);
  return <SidebarContext.Provider value={{ state, setState }}>{children}</SidebarContext.Provider>;
}
export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar requires SidebarProvider");
  return context;
}
