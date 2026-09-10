import {
  RiCheckLine,
  RiDiscordLine,
  RiEyeLine,
  RiFlashlightLine,
  RiGitBranchLine,
  RiLoader4Line,
  RiRobot2Line,
  RiSendPlaneLine,
  RiSparklingLine,
  RiTestTubeLine,
  type RemixiconComponentType,
} from "@remixicon/react";
import type { CSSProperties, ReactNode } from "react";

/* ---- The canvas, as the product draws it, running the treasury flow ----------------------- */

const grid =
  "bg-[radial-gradient(circle_at_1px_1px,color-mix(in_srgb,var(--foreground)_10%,transparent)_1px,transparent_0)] bg-[size:16px_16px]";

type Card = {
  icon: RemixiconComponentType;
  label: string;
  summary: string;
  value: string;
  cat: string;
  trigger?: boolean;
  branch?: boolean;
};

/*
 * One grid for the whole stage: four cards of one size on one line, equal gaps, the composition
 * centred; the branch not taken hangs under the third column. Handles sit at `port` inside a card.
 */
const stage = { width: 1056, height: 320 };
const w = 224;
const h = 68;
const gap = 32;
const port = 38;
const falsePortY = 54;
const rowY = (stage.height - (h + 48 + h)) / 2;
const branchRowY = rowY + h + 48;
const col = (i: number) => gap + i * (w + gap);

const cards: Card[] = [
  {
    icon: RiFlashlightLine,
    label: "Treasury below 500",
    summary: "Checks every hour",
    value: "fired",
    cat: "var(--chart-1)",
    trigger: true,
  },
  {
    icon: RiGitBranchLine,
    label: "Below the floor?",
    summary: "balance < 500",
    value: "true",
    cat: "var(--chart-4)",
    branch: true,
  },
  {
    icon: RiRobot2Line,
    label: "Size the top-up",
    summary: "How much to send",
    value: "250",
    cat: "var(--chart-3)",
  },
  {
    icon: RiSendPlaneLine,
    label: "Top up treasury",
    summary: "USDC to 0xDd6f…5879",
    value: "0x7c…f1",
    cat: "var(--chart-2)",
  },
];

const skipped = {
  icon: RiDiscordLine,
  label: "Post to Discord",
  summary: "#treasury",
  cat: "var(--chart-4)",
};

function Pill({ index, value }: { index: number; value: string }) {
  return (
    <span className="relative ml-auto h-[18px] w-[62px] flex-none">
      <span
        className={`c${index}-run absolute top-0 right-0 flex h-[18px] items-center gap-1 rounded-sm bg-accent px-1.5 text-[11px] text-[color:var(--edge-active)]`}
      >
        <RiLoader4Line className="spin size-3" aria-hidden="true" />
        running
      </span>
      <span
        className={`c${index}-done absolute top-0 right-0 flex h-[18px] max-w-full items-center gap-1 rounded-sm bg-accent px-1.5 font-mono text-[11px] text-[color:var(--chart-2)]`}
      >
        <RiCheckLine className="size-3 flex-none" aria-hidden="true" />
        <span className="truncate">{value}</span>
      </span>
    </span>
  );
}

function Handle({ x, y }: { x: number; y: number }) {
  return (
    <span
      className="absolute size-[9px] rounded-full border-2 border-[color:var(--edge)] bg-background"
      style={{ left: x - 4.5, top: y - 4.5 }}
      aria-hidden="true"
    />
  );
}

/* The card's chrome, shared by the run cards and the one that is skipped. */
function Shell({
  card,
  x,
  y,
  className,
  pill,
}: {
  card: Omit<Card, "value">;
  x: number;
  y: number;
  className: string;
  pill: ReactNode;
}) {
  const { icon: Icon, label, summary, cat, trigger, branch } = card;
  return (
    <div
      className={`absolute flex flex-col rounded-lg border bg-card text-[12px] ${className}`}
      style={
        {
          left: x,
          top: y,
          width: w,
          height: h,
          "--cat": cat,
          ...(trigger
            ? {
                background: "color-mix(in srgb, var(--cat) 10%, var(--card))",
                borderColor: "color-mix(in srgb, var(--cat) 40%, var(--border))",
              }
            : { borderColor: "var(--border)" }),
        } as CSSProperties & Record<"--cat", string>
      }
    >
      {trigger ? (
        <div className="flex h-full flex-col justify-center px-3">
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-[color:var(--cat)]" aria-hidden="true" />
            <span className="flex-1 font-semibold text-[10px] text-[color:var(--cat)] uppercase tracking-[0.06em]">
              Trigger
            </span>
            {pill}
          </span>
          <p className="mt-1 truncate font-medium text-[12px] leading-[18px]">{label}</p>
        </div>
      ) : (
        <>
          <div
            className="flex h-8 flex-none items-center gap-2 rounded-t-lg border-border border-b px-2.5"
            style={{ background: "color-mix(in srgb, var(--cat) 12%, var(--card))" }}
          >
            <Icon className="size-4 flex-none text-[color:var(--cat)]" aria-hidden="true" />
            <span className="truncate font-medium text-[12px] leading-[18px]">{label}</span>
            {pill}
          </div>
          <div className="flex flex-1 items-center px-2.5 text-muted-foreground">
            <span className="truncate">{summary}</span>
            {branch && (
              <span className="ml-auto flex flex-col text-right text-[10px] leading-[14px]">
                <span>True</span>
                <span>False</span>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function CanvasMock() {
  const line = rowY + port;
  const falseOut = { x: col(1) + w, y: rowY + falsePortY };
  const falseIn = { x: col(2), y: branchRowY + port };
  const mid = (falseOut.x + falseIn.x) / 2;
  const falseEdge = `M${falseOut.x} ${falseOut.y} C ${mid} ${falseOut.y}, ${mid} ${falseIn.y}, ${falseIn.x} ${falseIn.y}`;
  return (
    <div
      className="relative mx-auto w-full max-w-[976px] overflow-hidden rounded-xl border border-border shadow-[0_24px_64px_color-mix(in_srgb,var(--foreground)_12%,transparent)]"
      style={{
        aspectRatio: `${stage.width} / ${stage.height}`,
        containerType: "inline-size",
        background: "var(--canvas)",
      }}
    >
      <div
        className={`absolute top-0 left-0 origin-top-left ${grid}`}
        style={{
          width: stage.width,
          height: stage.height,
          /* One scale for the whole stage: the container's width over the stage's. */
          transform: `scale(tan(atan2(100cqw, ${stage.width}px)))`,
        }}
      >
        <svg
          className="absolute inset-0 overflow-visible"
          width={stage.width}
          height={stage.height}
          fill="none"
          aria-hidden="true"
        >
          <path d={falseEdge} stroke="var(--edge)" strokeWidth="1.5" />
          {[0, 1, 2].map((i) => {
            const x1 = col(i) + w;
            const x2 = col(i + 1);
            const d = `M${x1} ${line} L ${x2} ${line}`;
            const length = x2 - x1 + 2;
            return (
              <g key={d}>
                <path d={d} stroke="var(--edge)" strokeWidth="1.5" />
                <path
                  className={`ce${i}`}
                  d={d}
                  stroke="var(--edge-active)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray={length}
                  style={{ "--edge-length": length } as CSSProperties}
                />
              </g>
            );
          })}
        </svg>
        {cards.map((card, index) => (
          <Shell
            key={card.label}
            card={card}
            x={col(index)}
            y={rowY}
            className={`c${index}-card`}
            pill={<Pill index={index} value={card.value} />}
          />
        ))}
        <Shell
          card={skipped}
          x={col(2)}
          y={branchRowY}
          className="c-skip shadow-[0_1px_2px_var(--shadow-color)]"
          pill={
            <span className="c-skip-pill ml-auto flex h-[18px] flex-none items-center rounded-sm bg-accent px-1.5 text-[11px] text-muted-foreground">
              skipped
            </span>
          }
        />
        {cards.map((card, index) => (
          <span key={card.label} aria-hidden="true">
            {index > 0 && <Handle x={col(index)} y={line} />}
            {index < cards.length - 1 && <Handle x={col(index) + w} y={line} />}
          </span>
        ))}
        <Handle x={falseOut.x} y={falseOut.y} />
        <Handle x={falseIn.x} y={falseIn.y} />
      </div>
    </div>
  );
}

/* ---- Three small blocks under it ---------------------------------------------------------- */

const features = [
  {
    icon: RiSparklingLine,
    title: "Describe it",
    line: "Ask for a flow or a change in a sentence. Nothing lands until you apply it.",
    color: "var(--chart-3)",
  },
  {
    icon: RiTestTubeLine,
    title: "Simulate first",
    line: "Run the whole flow on a fork. Nothing is broadcast.",
    color: "var(--chart-1)",
  },
  {
    icon: RiEyeLine,
    title: "Read every run",
    line: "Every node's input and output, down to the transaction hash.",
    color: "var(--chart-2)",
  },
];

export function CanvasFeatures() {
  return (
    <div className="mx-auto mt-10 grid w-full max-w-[976px] md:grid-cols-3">
      {features.map(({ icon: Icon, title, line, color }, index) => (
        <div
          key={title}
          className={`py-4 md:py-0 ${index > 0 ? "border-border border-t md:border-t-0 md:border-l md:pl-8" : ""} ${index < features.length - 1 ? "md:pr-8" : ""}`}
        >
          <h3 className="flex items-center gap-2 font-medium text-body">
            <Icon className="size-4 flex-none" style={{ color }} aria-hidden="true" />
            {title}
          </h3>
          <p className="mt-1.5 text-caption text-muted-foreground">{line}</p>
        </div>
      ))}
    </div>
  );
}

/* ---- The section --------------------------------------------------------------------------- */

export function CanvasSection() {
  return (
    <section id="canvas" className="mx-auto w-full max-w-5xl px-6 py-24">
      <div className="mx-auto mb-12 max-w-[52ch] text-center">
        <h2 className="text-balance font-semibold text-[clamp(1.5rem,2.6vw,2.125rem)] leading-[1.12] tracking-[-0.02em]">
          A canvas that runs.
        </h2>
        <p className="mt-3 text-body text-muted-foreground">
          Draw a flow or describe it. Run it right there, and read what every node did.
        </p>
      </div>
      <CanvasMock />
      <CanvasFeatures />
    </section>
  );
}
