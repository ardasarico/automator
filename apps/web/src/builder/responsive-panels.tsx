"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const query = "(max-width: 1023px)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const ResponsivePanelsContext = createContext<{
  compact: boolean;
  panel: "left" | "right" | null;
  setPanel: (panel: "left" | "right" | null) => void;
} | null>(null);

export function ResponsivePanelsProvider({ children }: { children: ReactNode }) {
  const compact = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
  const [panel, setPanel] = useState<"left" | "right" | null>(null);
  return (
    <ResponsivePanelsContext.Provider value={{ compact, panel, setPanel }}>
      {children}
    </ResponsivePanelsContext.Provider>
  );
}

export function useResponsivePanels() {
  const context = useContext(ResponsivePanelsContext);
  if (!context) throw new Error("ResponsivePanelsProvider is required");
  return context;
}

export function usePanelEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);
}
