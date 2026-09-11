import {
  RiCoinsLine,
  RiFlashlightLine,
  RiHistoryLine,
  RiRobot2Line,
  RiShieldCheckLine,
  RiTableLine,
} from "@remixicon/react";
import { container } from "../container";

/* Six things the canvas carries besides the three the canvas section names. Same trio of accents. */
const features = [
  {
    icon: RiFlashlightLine,
    title: "Triggers",
    line: "A schedule, a webhook, a price crossing a line or a balance dropping under one.",
    color: "var(--chart-1)",
  },
  {
    icon: RiRobot2Line,
    title: "AI agents",
    line: "An agent node with the tools you hand it and nothing else, so it stays testable.",
    color: "var(--chart-2)",
  },
  {
    icon: RiCoinsLine,
    title: "Onchain actions",
    line: "USDC payments and contract calls on Base, signed by a wallet the server keeps for you.",
    color: "var(--chart-3)",
  },
  {
    icon: RiTableLine,
    title: "Data tables",
    line: "Tables your flows read and write, edited inline when a row needs fixing.",
    color: "var(--chart-1)",
  },
  {
    icon: RiHistoryLine,
    title: "Versions",
    line: "Every save is a version. Undo on the canvas, restore from the list.",
    color: "var(--chart-2)",
  },
  {
    icon: RiShieldCheckLine,
    title: "Secrets and guardrails",
    line: "Keys live on the server and never appear in a run. Nothing signs until you turn signing on.",
    color: "var(--chart-3)",
  },
];

/**
 * The canvas section's three feature lines, at six and a size up: a 3×2 grid whose only chrome
 * is the hairlines between cells, one column with a hairline between rows on a phone.
 */
export function Features() {
  return (
    <section id="features" className={`${container} py-24 md:py-32`}>
      <div className="mb-14 text-center">
        <h2 className="mx-auto max-w-[30ch] text-balance font-semibold text-[clamp(1.5rem,2.6vw,2.125rem)] leading-[1.12] tracking-[-0.02em]">
          Everything a flow needs, on the canvas.
        </h2>
        <p className="mx-auto mt-3 max-w-[52ch] text-body text-muted-foreground">
          What starts a flow, what it can touch, and what keeps it in check.
        </p>
      </div>
      <div className="grid md:grid-cols-3">
        {features.map(({ icon: Icon, title, line, color }, index) => {
          const col = index % 3;
          const row = Math.floor(index / 3);
          return (
            <div
              key={title}
              className={`py-6 md:px-8 md:py-8 ${index > 0 ? "border-border border-t" : ""} ${col > 0 ? "md:border-l" : "md:pl-0"} ${col === 2 ? "md:pr-0" : ""} ${row === 0 ? "md:border-t-0 md:pt-0" : ""} ${row === 1 ? "md:pb-0" : ""}`}
            >
              <Icon className="size-6" style={{ color }} aria-hidden="true" />
              <h3 className="mt-4 font-medium text-[1.0625rem] leading-6">{title}</h3>
              <p className="mt-1.5 max-w-[34ch] text-body text-muted-foreground">{line}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
