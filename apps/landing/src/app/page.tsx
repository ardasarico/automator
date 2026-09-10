import { CanvasSection } from "../build/canvas-section";
import { WhatYouBuild } from "../build/what-you-build";
import { HeroBackdrop } from "../hero/backdrop";
import { HeroPrompt } from "../hero/prompt";
import { Nav } from "../nav";

export default function LandingPage() {
  return (
    <main>
      <Nav />
      <section className="relative isolate flex min-h-[70svh] flex-col items-center justify-center px-6 pt-24 pb-16">
        <HeroBackdrop />
        <h1 className="max-w-[32ch] text-balance text-center font-semibold text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.06] tracking-[-0.02em] [text-shadow:0_1px_16px_color-mix(in_srgb,var(--background)_52%,transparent)]">
          Build, simulate, and run onchain workflows on a visual canvas.
        </h1>
        <HeroPrompt />
      </section>
      <WhatYouBuild />
      <CanvasSection />
    </main>
  );
}
