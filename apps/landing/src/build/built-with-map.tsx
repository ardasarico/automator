import {
  RiBubbleChartLine,
  RiCheckLine,
  RiFileEditLine,
  RiLoader4Line,
  RiLoginBoxLine,
  RiRobot2Line,
  RiSendPlaneLine,
  RiShieldCheckLine,
  type RemixiconComponentType,
} from "@remixicon/react";
import type { CSSProperties } from "react";
import { container } from "../container";

/*
 * Option B — the section is a map. The canvas cut into five strata, one per thing a flow stands
 * on: intelligence, identity, data, money, chain. Each band is a slice of the product's own
 * canvas (the dot grid on `--canvas`) with the partner's real node cards standing in it on a
 * computed column grid, and the product's edges descend from one layer to the next. The clock
 * runs one flow down through the layers.
 */

type Pin = {
  id: string;
  label: string;
  value: string;
  icon: RemixiconComponentType;
  cat: string;
  col: number;
  layer: number;
};

type Layer = { name: string; partner: string };

const layers: Layer[] = [
  { name: "Intelligence", partner: "OpenRouter" },
  { name: "Identity", partner: "Privy · World" },
  { name: "Data", partner: "The Graph" },
  { name: "Money", partner: "Circle USDC" },
  { name: "Chain", partner: "Base" },
];

/* In clock order: the flow enters at the top and settles at the bottom. Category colours are the
   product's: `ai` on chart-3, `integration` and `onchain` on chart-2. */
const pins: Pin[] = [
  {
    id: "ai.agent",
    label: "AI agent",
    value: "25",
    icon: RiRobot2Line,
    cat: "var(--chart-3)",
    col: 1,
    layer: 0,
  },
  {
    id: "privy.login",
    label: "Privy login",
    value: "user",
    icon: RiLoginBoxLine,
    cat: "var(--chart-2)",
    col: 0,
    layer: 1,
  },
  {
    id: "world.id-verify",
    label: "World ID verify",
    value: "orb",
    icon: RiShieldCheckLine,
    cat: "var(--chart-2)",
    col: 2,
    layer: 1,
  },
  {
    id: "graph.query-subgraph",
    label: "Query subgraph",
    value: "0",
    icon: RiBubbleChartLine,
    cat: "var(--chart-2)",
    col: 1,
    layer: 2,
  },
  {
    id: "usdc.payout",
    label: "USDC payout",
    value: "sent",
    icon: RiSendPlaneLine,
    cat: "var(--chart-2)",
    col: 2,
    layer: 3,
  },
  {
    id: "onchain.write-contract",
    label: "Write contract",
    value: "mined",
    icon: RiFileEditLine,
    cat: "var(--chart-2)",
    col: 1,
    layer: 4,
  },
];

/* One grid for the stage: a label column, then three card columns centred in what is left. */
const stage = { width: 1056, bandHeight: 108 };
const labelWidth = 200;
const w = 224;
const h = 60;
const gap = 32;
const columns = 3;
const gridLeft = labelWidth + (stage.width - labelWidth - (columns * w + (columns - 1) * gap)) / 2;
const colX = (c: number) => gridLeft + c * (w + gap);
const rowY = (layer: number) => layer * stage.bandHeight + (stage.bandHeight - h) / 2;
const stageHeight = layers.length * stage.bandHeight;

const grid =
  "bg-[radial-gradient(circle_at_1px_1px,color-mix(in_srgb,var(--foreground)_10%,transparent)_1px,transparent_0)] bg-[size:16px_16px]";

type Point = { x: number; y: number };

/** The edge from pin a to pin b: straight along a band, a vertical bezier between bands. */
function edge(a: Pin, b: Pin): { d: string; length: number; from: Point; to: Point } {
  if (a.layer === b.layer) {
    const y = rowY(a.layer) + h / 2;
    const from = { x: colX(a.col) + w, y };
    const to = { x: colX(b.col), y };
    return { d: `M${from.x} ${from.y} L ${to.x} ${to.y}`, length: to.x - from.x + 2, from, to };
  }
  const from = { x: colX(a.col) + w / 2, y: rowY(a.layer) + h };
  const to = { x: colX(b.col) + w / 2, y: rowY(b.layer) };
  const mid = (from.y + to.y) / 2;
  return {
    d: `M${from.x} ${from.y} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${to.y}`,
    length: Math.round(Math.hypot(to.x - from.x, to.y - from.y) + 16),
    from,
    to,
  };
}

function Pill({ index, value }: { index: number; value: string }) {
  return (
    <span className="relative ml-auto h-[18px] w-[62px] flex-none">
      <span
        className={`bwb-run${index} absolute top-0 right-0 flex h-[18px] items-center gap-1 rounded-sm bg-accent px-1.5 text-[11px] text-[color:var(--edge-active)]`}
      >
        <RiLoader4Line className="spin size-3" aria-hidden="true" />
        running
      </span>
      <span
        className={`bwb-done${index} absolute top-0 right-0 flex h-[18px] max-w-full items-center gap-1 rounded-sm bg-accent px-1.5 font-mono text-[11px] text-[color:var(--chart-2)]`}
      >
        <RiCheckLine className="size-3 flex-none" aria-hidden="true" />
        <span className="truncate">{value}</span>
      </span>
    </span>
  );
}

/** The product's node card: a tinted bar with the icon, label and status, the node id under it. */
function Card({ pin, index, style }: { pin: Pin; index: number; style?: CSSProperties }) {
  const { icon: Icon, label, id, cat, value } = pin;
  return (
    <div
      className={`bwb-card${index} flex flex-col rounded-lg border bg-card text-[12px] ${style ? "absolute" : ""}`}
      style={{ ...style, "--cat": cat } as CSSProperties & Record<"--cat", string>}
    >
      <div
        className="flex h-8 flex-none items-center gap-2 rounded-t-lg border-border border-b px-2.5"
        style={{ background: "color-mix(in srgb, var(--cat) 12%, var(--card))" }}
      >
        <Icon className="size-4 flex-none text-[color:var(--cat)]" aria-hidden="true" />
        <span className="truncate font-medium text-[12px] leading-[18px]">{label}</span>
        <Pill index={index} value={value} />
      </div>
      <div className="flex flex-1 items-center px-2.5 font-mono text-[11px] text-muted-foreground">
        <span className="truncate">{id}</span>
      </div>
    </div>
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

function Label({
  layer,
  index,
  className = "",
}: {
  layer: Layer;
  index: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="font-medium text-[13px] leading-5">{layer.name}</p>
      <p className="text-[12px] text-muted-foreground leading-4">
        {layer.partner}
        <span className="sr-only">
          , layer {index + 1} of {layers.length}
        </span>
      </p>
    </div>
  );
}

/* Deeper bands sit a shade darker in either theme, so the stack reads as depth without any drawing. */
const bandGround = (layer: number) => `color-mix(in srgb, #000 ${layer * 3}%, var(--canvas))`;

function Strata() {
  const edges = pins.slice(0, -1).map((pin, j) => edge(pin, pins[j + 1]!));
  return (
    <div
      className="hidden w-full overflow-hidden rounded-xl border border-foreground/12 md:block"
      style={{ aspectRatio: `${stage.width} / ${stageHeight}`, containerType: "inline-size" }}
    >
      <div
        className="relative origin-top-left"
        style={{
          width: stage.width,
          height: stageHeight,
          transform: `scale(tan(atan2(100cqw, ${stage.width}px)))`,
        }}
      >
        {layers.map((layer, i) => (
          <div
            key={layer.name}
            className={`absolute right-0 left-0 ${grid} ${i > 0 ? "border-foreground/12 border-t" : ""}`}
            style={{
              top: i * stage.bandHeight,
              height: stage.bandHeight,
              background: bandGround(i),
            }}
          >
            <span
              className={`bwb-band${i} absolute inset-0 bg-[color-mix(in_srgb,var(--edge-active)_6%,transparent)]`}
              aria-hidden="true"
            />
            <Label layer={layer} index={i} className="absolute top-1/2 left-6 -translate-y-1/2" />
          </div>
        ))}
        <svg
          className="absolute inset-0 overflow-visible"
          width={stage.width}
          height={stageHeight}
          fill="none"
          aria-hidden="true"
        >
          {edges.map(({ d, length }, j) => (
            <g key={d}>
              <path d={d} stroke="var(--edge)" strokeWidth="1.5" />
              <path
                className={`bwb-edge${j}`}
                d={d}
                stroke="var(--edge-active)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={length}
                style={{ "--edge-length": length } as CSSProperties}
              />
            </g>
          ))}
        </svg>
        {pins.map((pin, j) => (
          <Card
            key={pin.id}
            pin={pin}
            index={j}
            style={{ left: colX(pin.col), top: rowY(pin.layer), width: w, height: h }}
          />
        ))}
        {edges.map(({ from, to }) => (
          <span key={`${from.x}-${from.y}`}>
            <Handle x={from.x} y={from.y} />
            <Handle x={to.x} y={to.y} />
          </span>
        ))}
      </div>
    </div>
  );
}

/* Under md the same layers stack as full-width bands with their cards, no edges. */
function StrataStack() {
  return (
    <div className="overflow-hidden rounded-xl border border-foreground/12 md:hidden">
      {layers.map((layer, i) => (
        <div
          key={layer.name}
          className={`relative ${grid} p-4 ${i > 0 ? "border-foreground/12 border-t" : ""}`}
          style={{ background: bandGround(i) }}
        >
          <span
            className={`bwb-band${i} absolute inset-0 bg-[color-mix(in_srgb,var(--edge-active)_6%,transparent)]`}
            aria-hidden="true"
          />
          <div className="relative">
            <Label layer={layer} index={i} className="mb-3" />
            <div className="flex flex-col gap-2">
              {pins.map((pin, j) =>
                pin.layer === i ? <Card key={pin.id} pin={pin} index={j} /> : null,
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BuiltWithMap() {
  return (
    <section id="built-with" className={`${container} py-24 md:py-32`}>
      <div className="mx-auto mb-12 max-w-[52ch] text-center">
        <h2 className="text-balance font-semibold text-[clamp(1.5rem,2.6vw,2.125rem)] leading-[1.12] tracking-[-0.02em]">
          What a flow stands on.
        </h2>
        <p className="mt-3 text-body text-muted-foreground">
          Five layers under the canvas, and the nodes that reach into each one.
        </p>
      </div>
      <Strata />
      <StrataStack />
    </section>
  );
}
