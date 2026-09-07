"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useHotkey } from "../lib/hotkeys";
import { SIDEBAR_COOKIE, setPreferenceCookie } from "../lib/preferences";
export type SidebarState = "open" | "collapsed";
const SidebarContext = createContext<{
  state: SidebarState;
  setState: (state: SidebarState) => void;
  /**
   * Collapses now and returns a function that restores the pre-collapse state, unless
   * `setState` ran meanwhile (an explicit choice cancels the pending restore).
   */
  collapse: () => () => void;
} | null>(null);
export function SidebarProvider({
  children,
  defaultState,
}: {
  children: ReactNode;
  defaultState: SidebarState;
}) {
  const [state, setStateInternal] = useState(defaultState);
  const restoreRef = useRef<SidebarState | null>(null);
  const setState = useCallback((next: SidebarState) => {
    restoreRef.current = null; // an explicit choice cancels any pending restore
    setStateInternal(next);
    setPreferenceCookie(SIDEBAR_COOKIE, next);
  }, []);
  const collapse = useCallback(() => {
    setStateInternal((current) => {
      if (restoreRef.current === null) restoreRef.current = current;
      return "collapsed";
    });
    return () => {
      const previous = restoreRef.current;
      restoreRef.current = null;
      if (previous !== null) setStateInternal(previous);
    };
  }, []);
  useHotkey("mod+shift+s", (event) => {
    event.preventDefault();
    setState(state === "open" ? "collapsed" : "open");
  });
  return (
    <SidebarContext.Provider value={{ state, setState, collapse }}>
      {children}
    </SidebarContext.Provider>
  );
}
export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar requires SidebarProvider");
  return context;
}

/**
 * Collapses the sidebar for as long as the calling component is mounted and puts the
 * previous state back on unmount, unless the user made an explicit sidebar choice (via
 * `setState`, e.g. the hotkey or a manual toggle) during the visit — that choice persisted
 * a new preference and must survive leaving the page.
 */
export function useCollapseSidebarWhileMounted(): void {
  const { collapse } = useSidebar();
  useEffect(() => collapse(), [collapse]);
}
