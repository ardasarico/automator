import {
  RiCheckLine,
  RiLoader4Line,
  RiSendPlaneLine,
  RiShieldCheckLine,
  RiSparklingLine,
  RiTimeLine,
  RiWallet3Line,
  type RemixiconComponentType,
} from "@remixicon/react";
import type { CSSProperties, ReactNode } from "react";

function Frame({ children, height = 212 }: { children: ReactNode; height?: number }) {
  return (
    <div className="relative mx-auto" style={{ width: 260, height }}>
      {children}
    </div>
  );
}

/* ---- Automations: the canvas's own node cards, on one 12s clock --------------------------- */

type Card = {
  icon: RemixiconComponentType;
  label: string;
  summary: string;
  value: string;
  cat: string;
  trigger?: boolean;
  x: number;
  y: number;
  h: number;
};

const w = 208;

/* Drawn the way `apps/web/src/builder/flow-node.tsx` draws them: a tinted trigger with a tag,
   then bar-and-body cards with the category on the bar. Category colours are the chart tokens. */
const cards: Card[] = [
  {
    icon: RiTimeLine,
    label: "Every day at 9:00",
    summary: "Schedule",
    value: "fired",
    cat: "var(--chart-1)",
    trigger: true,
    x: 0,
    y: 0,
    h: 56,
  },
  {
    icon: RiWallet3Line,
    label: "USDC balance",
    summary: "Treasury wallet · Base",
    value: "412.50",
    cat: "var(--chart-2)",
    x: 52,
    y: 76,
    h: 62,
  },
  {
    icon: RiSendPlaneLine,
    label: "USDC payout",
    summary: "250 USDC → 0x7c…f1",
    value: "sent",
    cat: "var(--chart-2)",
    x: 16,
    y: 158,
    h: 62,
  },
];

function edgePath(a: Card, b: Card): { d: string; length: number } {
  const x1 = a.x + w / 2;
  const y1 = a.y + a.h;
  const x2 = b.x + w / 2;
  const y2 = b.y;
  const mid = (y1 + y2) / 2;
  return {
    d: `M${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`,
    length: Math.round(Math.hypot(x2 - x1, y2 - y1) + 10),
  };
}

/** The status pill the product shows after a run: nothing, then running, then the result. */
function Pill({ index, value }: { index: number; value: string }) {
  return (
    <span className="relative ml-auto h-[18px] w-[62px] flex-none">
      <span
        className={`f${index}-run absolute top-0 right-0 flex h-[18px] items-center gap-1 rounded-sm bg-accent px-1.5 text-[11px] text-[color:var(--step-accent)]`}
      >
        <RiLoader4Line className="spin size-3" aria-hidden="true" />
        running
      </span>
      <span
        className={`f${index}-done absolute top-0 right-0 flex h-[18px] max-w-full items-center gap-1 rounded-sm bg-accent px-1.5 font-mono text-[11px] text-[color:var(--step-accent)]`}
      >
        <RiCheckLine className="size-3 flex-none" aria-hidden="true" />
        <span className="truncate">{value}</span>
      </span>
    </span>
  );
}

export function AutomationFinal() {
  return (
    <Frame height={220}>
      <svg
        className="absolute inset-0 overflow-visible"
        width="260"
        height="220"
        fill="none"
        aria-hidden="true"
      >
        {cards.slice(0, -1).map((card, index) => {
          const { d, length } = edgePath(card, cards[index + 1]!);
          return (
            <g key={card.label}>
              <path d={d} stroke="var(--edge)" strokeWidth="1.5" />
              <path
                className={`g${index}-draw`}
                d={d}
                stroke="var(--step-accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={length}
                style={{ "--edge-length": length } as CSSProperties}
              />
            </g>
          );
        })}
      </svg>
      {cards.map(({ icon: Icon, label, summary, value, cat, trigger, x, y, h }, index) => (
        <div
          key={label}
          className={`f${index}-card absolute flex flex-col overflow-hidden rounded-lg border bg-card shadow-[0_1px_2px_var(--shadow-color)]`}
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
            <>
              <span className="flex items-center gap-2 px-2.5 pt-2 pb-0.5">
                <Icon className="size-4 flex-none text-[color:var(--cat)]" aria-hidden="true" />
                <span className="flex-1 truncate font-semibold text-[10px] text-[color:var(--cat)] uppercase tracking-[0.06em]">
                  Trigger
                </span>
                <Pill index={index} value={value} />
              </span>
              <span className="truncate px-2.5 pb-2 font-medium text-[13px] leading-[18px]">
                {label}
              </span>
            </>
          ) : (
            <>
              <span
                className="flex h-8 flex-none items-center gap-2 border-border border-b px-2.5"
                style={{ background: "color-mix(in srgb, var(--cat) 12%, var(--card))" }}
              >
                <Icon className="size-4 flex-none text-[color:var(--cat)]" aria-hidden="true" />
                <span className="flex-1 truncate font-medium text-[12px] leading-[18px]">
                  {label}
                </span>
                <Pill index={index} value={value} />
              </span>
              <span className="flex min-h-7 items-center truncate px-2.5 text-[12px] text-muted-foreground leading-4">
                {summary}
              </span>
            </>
          )}
        </div>
      ))}
      {/* Handles, drawn outside the cards so the overflow clip does not eat them. */}
      {cards.map(({ label, x, y, h }, index) => (
        <span key={label} aria-hidden="true">
          {index > 0 && (
            <span
              className={`f${index}-port absolute size-2 rounded-full border-2 border-[color:var(--edge)] bg-background`}
              style={{ left: x + w / 2 - 4, top: y - 4 }}
            />
          )}
          {index < cards.length - 1 && (
            <span
              className="absolute size-2 rounded-full border-2 border-[color:var(--edge)] bg-background"
              style={{ left: x + w / 2 - 4, top: y + h - 4 }}
            />
          )}
        </span>
      ))}
    </Frame>
  );
}

/* ---- Mini-app: four screens paging sideways, a pill button, a congratulations -------------- */

const claim = [
  { icon: RiWallet3Line, title: "Sign in", action: "Continue with Privy" },
  { icon: RiShieldCheckLine, title: "Verify with World ID", action: "Open World App" },
  { icon: RiSendPlaneLine, title: "Pay 5 USDC", action: "Confirm" },
] as const;

export function MiniAppFinal() {
  const screen = 168;
  /* The button sits `pad` inside the screen, so its corner is the screen's corner minus that. */
  const screenRadius = 17;
  const pad = 8;
  const buttonRadius = screenRadius - pad;
  return (
    <Frame>
      <div className="mx-auto w-[132px] rounded-[22px] border border-border bg-card p-[5px] shadow-[0_12px_32px_color-mix(in_srgb,var(--foreground)_12%,transparent)]">
        <div
          className="relative overflow-hidden border border-border bg-background"
          style={{ borderRadius: screenRadius }}
        >
          <div className="flex items-center justify-between px-3 pt-1.5 pb-1 text-[9px] text-muted-foreground">
            <span className="font-mono">9:41</span>
            <span className="h-1 w-6 rounded-full bg-border" aria-hidden="true" />
            <span className="font-mono">100%</span>
          </div>
          <div className="flex gap-1 px-3 pt-1" aria-hidden="true">
            {claim.map(({ title }, index) => (
              <span key={title} className="h-[3px] flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={`step${index} block h-full w-full bg-[color:var(--step-accent)]`}
                />
              </span>
            ))}
          </div>
          <div style={{ height: screen }} className="overflow-hidden">
            <div className="page-4" style={{ height: screen }}>
              {claim.map(({ icon: Icon, title, action }, index) => (
                <div
                  key={title}
                  className="flex w-1/4 flex-col justify-between"
                  style={{ padding: pad }}
                >
                  <div className="pt-1 pl-0.5">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--step-accent)_16%,transparent)]">
                      <Icon className="size-4 text-[color:var(--step-accent)]" aria-hidden="true" />
                    </span>
                    <p className="mt-2.5 font-medium text-caption leading-tight">{title}</p>
                  </div>
                  {/* Concentric with the screen: its corner is the screen's corner minus the inset. */}
                  <span className="relative block" style={{ borderRadius: buttonRadius }}>
                    <span
                      className="block bg-[color:var(--step-accent)] py-[3px] text-center text-[9px] text-background leading-[14px]"
                      style={{ borderRadius: buttonRadius }}
                    >
                      {action}
                    </span>
                    <span
                      className={`tap${index} absolute inset-0 bg-[color:var(--step-accent)]`}
                      style={{ borderRadius: buttonRadius }}
                      aria-hidden="true"
                    />
                  </span>
                </div>
              ))}
              <div
                className="flex w-1/4 flex-col items-center justify-center text-center"
                style={{ padding: pad }}
              >
                <span className="relative flex size-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--step-accent)_16%,transparent)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      className="tick-4"
                      d="M5 13l4 4L19 7"
                      fill="none"
                      stroke="var(--step-accent)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <RiSparklingLine
                    className="-top-1 -right-1 absolute size-3 text-[color:var(--step-accent)]"
                    aria-hidden="true"
                  />
                </span>
                <p className="mt-3 font-medium text-caption">You're in</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">5 USDC sent</p>
              </div>
            </div>
          </div>
          <span className="off-4 absolute inset-0 bg-background" aria-hidden="true" />
        </div>
      </div>
    </Frame>
  );
}

/* ---- Endpoints: the segmented control, sliding ------------------------------------------- */

const panes = [
  {
    name: "HTTPS",
    request: (
      <>
        <p className="truncate">
          <span className="text-[color:var(--step-accent)]">POST</span> /v1/flows/quote
        </p>
        <p className="truncate">{'{ "amount": 250, "token": "USDC" }'}</p>
      </>
    ),
    answer: (
      <p className="truncate">
        <span className="text-[color:var(--step-accent)]">200</span>{" "}
        {'{ "eta": "2 blocks", "fee": "0.02" }'}
      </p>
    ),
  },
  {
    name: "MCP",
    request: (
      <>
        <p className="truncate">
          <span className="text-[color:var(--step-accent)]">tool</span> quote
        </p>
        <p className="truncate">{"{ amount: number, token?: string }"}</p>
      </>
    ),
    answer: (
      <p className="truncate">
        <span className="text-[color:var(--step-accent)]">→</span> {"{ eta, fee }"}
      </p>
    ),
  },
  {
    name: "Agent",
    request: (
      <p className="truncate">
        <span className="text-[color:var(--step-accent)]">call</span> quote(amount: 250)
      </p>
    ),
    answer: (
      <p className="truncate font-sans text-[11px] text-foreground">
        About two blocks, 0.02 in fees.
      </p>
    ),
  },
] as const;

export function EndpointFinal() {
  return (
    <Frame>
      <div className="relative mb-2.5 flex rounded-lg border border-border bg-card p-0.5">
        <span
          className="seg-slide absolute top-0.5 bottom-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-md border border-[color:var(--step-accent)] bg-[color-mix(in_srgb,var(--step-accent)_10%,transparent)]"
          aria-hidden="true"
        />
        {panes.map(({ name }, index) => (
          <span
            key={name}
            className="seg-label relative flex-1 py-1 text-center text-[11px] text-muted-foreground"
            style={{ animationDelay: `${index * 4}s` }}
          >
            {name}
          </span>
        ))}
      </div>
      <div className="h-[86px] overflow-hidden rounded-lg border border-border bg-card">
        <div className="pane-slide">
          {panes.map(({ name, request }) => (
            <div
              key={name}
              className="w-1/3 px-3 py-2.5 font-mono text-[11px] leading-[1.8] text-muted-foreground"
            >
              {request}
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-2.5 h-[52px] overflow-hidden rounded-lg border border-[color:color-mix(in_srgb,var(--step-accent)_40%,var(--border))] bg-card">
        <div className="pane-slide">
          {panes.map(({ name, answer }, index) => (
            <div
              key={name}
              className="w-1/3 px-3 py-2 font-mono text-[11px] leading-[1.8] text-muted-foreground"
            >
              <span className="tab-answer block" style={{ animationDelay: `${index * 4}s` }}>
                {answer}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}
