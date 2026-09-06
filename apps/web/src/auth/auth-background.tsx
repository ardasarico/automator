"use client";

import dynamic from "next/dynamic";
import { useTheme } from "@automator/ui/theme-provider";
import { useEffect, useState } from "react";
import styles from "./auth.module.css";

const GodRays = dynamic(
  () => import("@paper-design/shaders-react").then((module) => module.GodRays),
  { ssr: false },
);
// sRGB equivalents of the shared blue-300, blue-200 and blue-400 tokens.
const darkColors = ["#00ceff", "#80d5f4", "#156a83"];
const lightColors = ["#156a83"];

export function AuthBackground() {
  const { resolvedTheme } = useTheme();
  const [supported, setSupported] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Keep the form usable on devices without WebGL; CSS supplies the fallback glow.
    const context = document.createElement("canvas").getContext("webgl2");
    if (!context) return;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    setSupported(true);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setAnimate(!reducedMotion.matches && !document.hidden);
    updateMotion();
    reducedMotion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateMotion);
    return () => {
      reducedMotion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateMotion);
    };
  }, []);

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
