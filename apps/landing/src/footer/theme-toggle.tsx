"use client";

import { Button } from "@automator/ui/button";
import { useTheme } from "@automator/ui/theme-provider";
import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** The workspace's toggle, repeated here rather than shared: the landing must not depend on `apps/web`. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full"
      aria-label={label}
      title={label}
      disabled={!mounted}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <RiSunLine aria-hidden="true" /> : <RiMoonLine aria-hidden="true" />}
    </Button>
  );
}
