import type { ReactNode } from "react";

/**
 * Canvas routes render in the shell's "fill" content mode: `main` becomes a flex column with
 * no padding and no scrolling, and this subtree owns its own overflow. The shell picks the
 * mode up from `data-content-mode` with a CSS `:has()` selector, so it needs no context,
 * no prop drilling and no client JavaScript.
 */
export default function CanvasLayout({ children }: { children: ReactNode }) {
  return (
    <div data-content-mode="fill" className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
