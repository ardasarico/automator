"use client";

import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";
import styles from "./panel.module.css";
import { useReducedMotion } from "./reduced-motion";

/* One plugin object for every message: Shiki loads its grammars once per page, not per turn. */
const plugins = { code };

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
