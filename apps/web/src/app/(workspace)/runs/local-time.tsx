"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;

export function formatRunTime(value: string, timeZone?: string, { zone = true } = {}): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(zone ? { timeZoneName: "short" as const } : {}),
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

export function LocalTime({ value, zone = true }: { value: string; zone?: boolean }) {
  const server = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return (
    <time dateTime={value} title={formatRunTime(value, server ? "UTC" : undefined)}>
      {formatRunTime(value, server ? "UTC" : undefined, { zone })}
    </time>
  );
}
