"use client";

import dynamic from "next/dynamic";

export const AgentationToolbar =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("agentation").then((module) => module.Agentation), { ssr: false })
    : () => null;
