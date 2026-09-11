"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;

/** A calendar date the way every list writes one: "Sep 9, 2026". */
export function formatDate(value: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

/**
 * A date that is right where the reader sits. The server has no idea what day it is for them,
 * so it renders UTC and the client re-renders in its own zone once hydrated, the same trade the
 * run list makes with `LocalTime`; the machine-readable stamp stays exact either way.
 */
export function LocalDate({ value }: { value: string }) {
  const server = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return <time dateTime={value}>{formatDate(value, server ? "UTC" : undefined)}</time>;
}
