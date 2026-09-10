"use client";

import { code } from "@streamdown/code";
import { useSyncExternalStore } from "react";
import { Streamdown } from "streamdown";
import styles from "./panel.module.css";

/* One plugin object for every message: Shiki loads its grammars once per page, not per turn. */
const plugins = { code };

const reduceMotion = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(onChange: () => void): () => void {
  const query = window.matchMedia?.(reduceMotion);
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Server-rendered markup animates nothing, so the server snapshot is always "no motion asked for". */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia?.(reduceMotion).matches ?? false,
    () => true,
  );
}

/**
 * The model's prose. `streaming` mode re-parses the growing text and leaves an incomplete fence
 * alone; `static` is what a reloaded conversation renders, which is why both read the same.
 */
export function Markdown({ text, isAnimating = false }: { text: string; isAnimating?: boolean }) {
  const reducedMotion = useReducedMotion();
  return (
    <div className={styles.markdown}>
      <Streamdown
        mode={isAnimating ? "streaming" : "static"}
        plugins={plugins}
        isAnimating={isAnimating}
        animated={!reducedMotion}
      >
        {text}
      </Streamdown>
    </div>
  );
}
