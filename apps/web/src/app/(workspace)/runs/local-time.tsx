"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;

export function formatRunTime(value: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

/** UTC during SSR/hydration; then the browser's local time, always with a zone label. */
export function LocalTime({ value }: { value: string }) {
  const server = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return <time dateTime={value}>{formatRunTime(value, server ? "UTC" : undefined)}</time>;
}
