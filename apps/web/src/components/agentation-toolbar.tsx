"use client";

import dynamic from "next/dynamic";

/**
 * Development-only annotation toolbar. Agentation is fixed to the bottom-right corner, which
 * is where the Next dev indicator now sits, so the toolbar is raised clear of it.
 */
export const AgentationToolbar =
  process.env.NODE_ENV === "development"
    ? dynamic(
        async () => {
          const { Agentation } = await import("agentation");
          return function DevAnnotationToolbar() {
            return <Agentation className="bottom-19!" />;
          };
        },
        { ssr: false },
      )
    : () => null;
