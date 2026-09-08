"use client";

import type { FlowDocument } from "@automator/contracts";
import { openPreview } from "@automator/miniapp";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

const runtimeUrl = process.env.NEXT_PUBLIC_RUNTIME_URL ?? "http://localhost:3002";
const PreviewHandoffContext = createContext<((document: FlowDocument) => boolean) | null>(null);

/** External previews belong to the builder, independently of which panel is visible. */
export function PreviewHandoffProvider({ children }: { children: ReactNode }) {
  const pending = useRef(new Set<() => void>());
  useEffect(() => {
    const previews = pending.current;
    return () => {
      for (const close of previews) close();
      previews.clear();
    };
  }, []);
  const open = useCallback((document: FlowDocument) => {
    const close = openPreview(runtimeUrl, document, () => {
      if (close) pending.current.delete(close);
    });
    if (close) pending.current.add(close);
    return close !== null;
  }, []);
  return <PreviewHandoffContext.Provider value={open}>{children}</PreviewHandoffContext.Provider>;
}

export function useOpenPreview() {
  const open = useContext(PreviewHandoffContext);
  if (!open) throw new Error("useOpenPreview must be used inside PreviewHandoffProvider");
  return open;
}
