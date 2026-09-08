"use client";

import dynamic from "next/dynamic";

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
