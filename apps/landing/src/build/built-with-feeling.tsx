import {
  RiBubbleChartLine,
  RiFileEditLine,
  RiPenNibLine,
  RiRobot2Line,
  RiSendPlaneLine,
  RiShieldCheckLine,
  type RemixiconComponentType,
} from "@remixicon/react";
import type { CSSProperties } from "react";
import { container } from "../container";

/*
 * Option C — the section is a feeling. Six sentences in the statement band's voice, one per
 * partner, each verb set as the product's pill in the node's real category colour with the
 * node's own icon. No illustration: the clock lights one verb at a time and surfaces the node
 * id under the line, so the quiet piece still says exactly where each partner lives.
 */

type Line = {
  before: string;
  verb: string;
  after: string;
  id: string;
  icon: RemixiconComponentType;
  cat: string;
};

/* Category colours are the product's: `integration` and `onchain` on chart-2, `ai` on chart-3. */
const lines: Line[] = [
  {
    before: "Privy",
    verb: "signs",
    after: ".",
    id: "privy.sign-transaction",
    icon: RiPenNibLine,
    cat: "var(--chart-2)",
  },
  {
    before: "World",
    verb: "proves",
    after: " a person.",
    id: "world.id-verify",
    icon: RiShieldCheckLine,
    cat: "var(--chart-2)",
  },
  {
    before: "The Graph",
    verb: "remembers",
    after: ".",
    id: "graph.query-subgraph",
    icon: RiBubbleChartLine,
    cat: "var(--chart-2)",
  },
  {
    before: "Circle",
    verb: "pays",
    after: ".",
    id: "usdc.payout",
    icon: RiSendPlaneLine,
    cat: "var(--chart-2)",
  },
  {
    before: "Base",
    verb: "settles",
    after: ".",
    id: "onchain.write-contract",
    icon: RiFileEditLine,
    cat: "var(--chart-2)",
  },
  {
    before: "OpenRouter",
    verb: "thinks",
    after: ".",
    id: "ai.agent",
    icon: RiRobot2Line,
    cat: "var(--chart-3)",
  },
];

function Pill({ line, index }: { line: Line; index: number }) {
  const Icon = line.icon;
  return (
    <span
      className={`bwc-pill${index} mx-[0.12em] inline-flex translate-y-[-0.08em] items-center gap-[0.22em] rounded-full border px-[0.42em] py-[0.08em] align-middle font-medium text-[0.5em] leading-[1.2] tracking-normal`}
      style={
        {
          "--cat": line.cat,
          borderColor: "color-mix(in srgb, var(--cat) 40%, transparent)",
        } as CSSProperties & Record<"--cat", string>
      }
    >
      <Icon aria-hidden="true" className="size-[1.1em]" />
      {line.verb}
    </span>
  );
}

export function BuiltWithFeeling() {
  return (
    <section id="built-with" className={`${container} py-24 md:py-32`}>
      <p className="mb-10 text-center text-caption text-muted-foreground uppercase tracking-[0.08em]">
        Built with
      </p>
      <ul className="mx-auto flex flex-col items-center gap-5 text-center md:gap-6">
        {lines.map((line, index) => (
          <li key={line.id} className="flex flex-col items-center">
            <p className="max-w-[16ch] text-balance font-semibold text-[clamp(1.5rem,3.2vw,2.5rem)] leading-[1.15] tracking-[-0.025em] md:max-w-none md:whitespace-nowrap">
              {line.before} <Pill line={line} index={index} />
              {line.after}
            </p>
            <span
              className={`bwc-id${index} mt-1.5 block h-5 font-mono text-[12px] text-muted-foreground leading-5`}
            >
              {line.id}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-center text-caption text-muted-foreground">
        Each verb is a node on the canvas.
      </p>
    </section>
  );
}
