import { ScrollArea } from "@automator/ui/scroll-area";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Scroll Area" };

const entries = [
  "Loading workflow",
  "Connecting to Ethereum",
  "Reading token balances",
  "Checking approvals",
  "Preparing swap",
  "Estimating gas",
  "Simulating transaction",
  "Validating minimum output",
  "Checking price impact",
  "Reading pool reserves",
  "Calculating route",
  "Building calldata",
  "Verifying transaction",
  "Saving simulation",
  "Simulation complete",
];

export default function ScrollAreaPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Scroll Area</h1>
      <div className="grid max-w-3xl gap-8 sm:grid-cols-2">
        {[false, true].map((scrollFade) => (
          <section
            key={String(scrollFade)}
            aria-labelledby={`scroll-${scrollFade}`}
            className="min-w-0"
          >
            <h2 id={`scroll-${scrollFade}`} className="mb-3 text-label">
              {scrollFade ? "With edge fade" : "Vertical"}
            </h2>
            <ScrollArea className="h-56 bg-card" scrollFade={scrollFade} scrollbarGutter>
              <ol className="space-y-3 p-4 text-caption">
                {entries.map((entry, index) => (
                  <li key={entry} className="flex gap-3">
                    <span className="text-muted-foreground tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{entry}</span>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </section>
        ))}
        <section aria-labelledby="scroll-horizontal" className="min-w-0 sm:col-span-2">
          <h2 id="scroll-horizontal" className="mb-3 text-label">
            Horizontal
          </h2>
          <ScrollArea className="h-20 bg-card" scrollbarGutter>
            <div className="flex w-max gap-8 p-5 text-body">
              {[
                "Read balance",
                "Check threshold",
                "Get quote",
                "Approve token",
                "Swap tokens",
                "Send notification",
              ].map((step, index) => (
                <span key={step}>
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {step}
                </span>
              ))}
            </div>
          </ScrollArea>
        </section>
      </div>
    </>
  );
}
