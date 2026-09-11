"use client";

import { useSyncExternalStore } from "react";

const reduceMotion = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(reduceMotion);
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Server-rendered markup moves nothing, so the server snapshot is always "no motion asked for". */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(reduceMotion).matches ?? false,
    () => true,
  );
}
