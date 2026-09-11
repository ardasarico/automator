import type { CSSProperties } from "react";
import { container } from "../container";
import { AutomationFinal, EndpointFinal, MiniAppFinal } from "./illustrations";

/* Three things one flow can become. The accents are the workspace's own tokens, not new hues. */
const legs = [
  {
    title: "Automations",
    line: "Give a flow a trigger — a schedule, a webhook, a price or a balance — and it runs by itself.",
    accent: "var(--brand)",
    illustration: <AutomationFinal />,
  },
  {
    title: "Mini-apps",
    line: "Give it a screen and it becomes a link: sign in, verify, pay, and take the receipt away.",
    accent: "var(--success)",
    illustration: <MiniAppFinal />,
  },
  {
    title: "Endpoints & agent tools",
    line: "Declare what it takes, answer with a Return node, and it is an HTTP endpoint and an MCP tool.",
    accent: "var(--warning)",
    illustration: <EndpointFinal />,
  },
];

/**
 * The section that says what the product is, since the hero only says what it does. Each column
 * shows one of the three things a flow can become, running, and then names it.
 */
export function WhatYouBuild() {
  return (
    <section id="build" className={`${container} py-24 md:py-32`}>
      <h2 className="mx-auto mb-14 max-w-[30ch] text-balance text-center font-semibold text-[clamp(1.5rem,2.6vw,2.125rem)] leading-[1.12] tracking-[-0.02em]">
        One canvas, three ways to ship it.
      </h2>
      <div className="grid gap-14 md:grid-cols-3 md:gap-0">
        {legs.map(({ title, line, accent, illustration }, index) => (
          <div
            key={title}
            style={{ "--step-accent": accent } as CSSProperties}
            className={`flex flex-col md:px-6 ${index > 0 ? "md:border-l md:border-foreground/12" : "md:pl-0"} ${index === legs.length - 1 ? "md:pr-0" : ""}`}
          >
            <div className="mb-8">{illustration}</div>
            <h3 className="text-panel">
              <span
                className="mr-2 inline-block size-1.5 rounded-full align-middle"
                style={{ background: accent }}
                aria-hidden="true"
              />
              {title}
            </h3>
            <p className="mt-2 text-caption text-muted-foreground">{line}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
