"use client";

import dynamic from "next/dynamic";
import { useTheme } from "@automator/ui/theme-provider";
import { useSyncExternalStore } from "react";
import styles from "./auth.module.css";

const GodRays = dynamic(
  () => import("@paper-design/shaders-react").then((module) => module.GodRays),
  { ssr: false },
);
// sRGB equivalents of the shared blue-300, blue-200 and blue-400 tokens.
const darkColors = ["#00ceff", "#80d5f4", "#156a83"];
const lightColors = ["#156a83"];

// WebGL support never changes after the browser starts, so the snapshot is
// computed once and cached; the store never notifies of a change.
let webglSupported: boolean | null = null;
function getWebglSnapshot() {
  if (webglSupported !== null) return webglSupported;
  const context = document.createElement("canvas").getContext("webgl2");
  context?.getExtension("WEBGL_lose_context")?.loseContext();
  webglSupported = context !== null;
  return webglSupported;
}
function getWebglServerSnapshot() {
  return false;
}
function subscribeToNothing() {
  return () => {};
}

// Animation should pause for reduced-motion preferences and hidden tabs;
// both can change after mount, so this snapshot is re-read on each event.
function getAnimateSnapshot() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !document.hidden;
}
function getAnimateServerSnapshot() {
  return false;
}
function subscribeToAnimatePreferences(onStoreChange: () => void) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion.addEventListener("change", onStoreChange);
  document.addEventListener("visibilitychange", onStoreChange);
  return () => {
    reducedMotion.removeEventListener("change", onStoreChange);
    document.removeEventListener("visibilitychange", onStoreChange);
  };
}

export function AuthBackground() {
  const { resolvedTheme } = useTheme();
  // Keep the form usable on devices without WebGL; CSS supplies the fallback glow.
  const supported = useSyncExternalStore(
    subscribeToNothing,
    getWebglSnapshot,
    getWebglServerSnapshot,
  );
  const animate = useSyncExternalStore(
    subscribeToAnimatePreferences,
    getAnimateSnapshot,
    getAnimateServerSnapshot,
  );

  return (
    <div className={styles.background} aria-hidden="true">
      {supported && (
        <GodRays
          width="100%"
          height="100%"
          colors={resolvedTheme === "dark" ? darkColors : lightColors}
          colorBack="#00000000"
          colorBloom="#156a83"
          bloom={0.4}
          intensity={0.65}
          density={0.1125}
          spotty={0.15}
          midSize={0.45}
          midIntensity={0.04}
          speed={animate ? 0.5 : 0}
          frame={12000}
          scale={1}
          offsetX={0}
          offsetY={0}
          minPixelRatio={1}
          maxPixelCount={1_500_000}
        />
      )}
    </div>
  );
}
