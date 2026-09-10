# Landing page implementation plan

> **Status:** implemented across `adbd7a8`…`ded029b`. Kept for the reasoning, not as a task list. Do not re-execute this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public landing page for Automator at `automator.ardasari.co`, built as a new static Next app in this monorepo and deployed on Railway.

**Architecture:** A new `apps/landing` app scaffolded from `apps/ui-lab`, with no API, database or auth dependency. Its spine is one real flow drawn in the page from `div`s and an `<svg>` — not React Flow — shown in three states (drawn, rehearsed, read) as the visitor scrolls. Styling is Tailwind on the shared tokens, with `@automator/ui` primitives and Remix icons.

**Tech Stack:** Bun workspaces, Turborepo, Next 16 App Router, React 19, Tailwind v4 through `@automator/tailwind-config`, `@automator/ui` (Coss/Base UI), `motion`, Railway, Cloudflare DNS.

**Spec:** `docs/plans/2026-09-10-landing-page.md`

## Global Constraints

- Bun 1.3.13, Node >= 22. Run every command from the repository root.
- Pin exact dependency versions, matching the rest of the workspace: `next` 16.3.4, `react` 19.2.8, `react-dom` 19.2.8, `@remixicon/react` 4.9.0, `next-themes` 0.4.6, `motion` 13.2.0, `@tailwindcss/postcss` 4.3.3, `postcss` 8.5.28, `typescript` 7.0.2, `@types/node` 26.4.1, `@types/react` 19.2.18, `@types/react-dom` 19.2.7, `@types/bun` 1.4.1.
- The app runs on port **3004** in both `dev` and `start`.
- Forbidden dependencies in `apps/landing`: `@automator/api-client`, `@automator/contracts`, `@automator/db`, `@xyflow/react`, `@privy-io/react-auth`, `@paper-design/shaders-react`, `ogl`.
- Icons come from `@remixicon/react` only, line variants by default. No other icon library.
- All page copy is English.
- Tailwind utilities first. A CSS module is only allowed for layered `linear-gradient`/`mask-image` backgrounds and keyframes.
- Every animation is gated behind `prefers-reduced-motion`.
- `bun run format` (oxfmt) before each commit; `bun run lint` is `oxlint --deny-warnings`.
- Keep work uncommitted only where the plan says so; each task ends with its own commit. Do not push.

**Deliberate deviation from TDD:** the page is static presentation with one piece of real logic — the edge geometry of the flow diagram. Task 2 drives that with a test. The remaining tasks have no logic worth a unit test and are verified with `typecheck`, `build` and a browser pass, as the spec states.

---

### Task 1: Scaffold the app

**Files:**

- Create: `apps/landing/package.json`
- Create: `apps/landing/tsconfig.json`
- Create: `apps/landing/next.config.ts`
- Create: `apps/landing/postcss.config.mjs`
- Create: `apps/landing/turbo.json`
- Create: `apps/landing/src/app/globals.css`
- Create: `apps/landing/src/app/layout.tsx`
- Create: `apps/landing/src/app/page.tsx`
- Create: `apps/landing/src/app/health/route.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: the `@automator/landing` workspace package; `src/app/page.tsx` is the file every later section task composes into.

- [ ] **Step 1: Write `apps/landing/package.json`**

```json
{
  "name": "@automator/landing",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "lint": "oxlint --deny-warnings .",
    "dev": "next dev --port 3004",
    "build": "next build",
    "start": "next start --hostname 0.0.0.0 --port 3004",
    "typecheck": "next typegen && tsc --noEmit"
  },
  "dependencies": {
    "@automator/ui": "workspace:*",
    "@remixicon/react": "4.9.0",
    "motion": "13.2.0",
    "next": "16.3.4",
    "next-themes": "0.4.6",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@automator/tailwind-config": "workspace:*",
    "@automator/typescript-config": "workspace:*",
    "@tailwindcss/postcss": "4.3.3",
    "@types/bun": "1.4.1",
    "@types/node": "26.4.1",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.7",
    "postcss": "8.5.28",
    "typescript": "7.0.2"
  }
}
```

`start` binds `0.0.0.0` like `apps/web` does, because Railway must reach it from outside the container. `apps/ui-lab` binds `127.0.0.1`; do not copy that.

There is deliberately **no `test` script** here. `bun test` exits 1 when it finds no test file, which would break `bun run test` at the repository root — `apps/ui-lab` and `packages/tailwind-config` declare no `test` script for exactly this reason. Task 2 adds the script together with the first test file.

- [ ] **Step 2: Write the remaining config files**

`apps/landing/tsconfig.json`:

```json
{
  "extends": "@automator/typescript-config/nextjs.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

`apps/landing/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@automator/ui"],
};

export default nextConfig;
```

`apps/landing/postcss.config.mjs`:

```js
export { default } from "@automator/tailwind-config/postcss";
```

`apps/landing/turbo.json`:

```json
{
  "extends": ["//"],
  "tasks": {
    "build": {
      "outputs": [".next/**", "!.next/cache/**", "!.next/dev/**"]
    },
    "typecheck": {
      "outputs": [".next/types/**", "*.tsbuildinfo"]
    }
  }
}
```

`apps/landing/src/app/globals.css`:

```css
@import "@automator/tailwind-config/styles.css";
@import "@automator/ui/styles.css";

@source "..";
```

- [ ] **Step 3: Write the root layout**

`apps/landing/src/app/layout.tsx`. The metadata is the real page metadata — the landing is the public face of the project, so it is indexable, unlike UI Lab.

```tsx
import { ThemeProvider } from "@automator/ui/theme-provider";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://automator.ardasari.co"),
  title: "Automator — see what your onchain automation will do",
  description:
    "Automator is a canvas for onchain workflows: draw a flow or describe it, rehearse it without spending anything, then read every run node by node.",
  openGraph: {
    type: "website",
    url: "https://automator.ardasari.co",
    siteName: "Automator",
    title: "Automator — see what your onchain automation will do",
    description:
      "Draw a flow or describe it, rehearse it without spending anything, then read every run node by node.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background font-sans text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Write the placeholder page and the health route**

`apps/landing/src/app/page.tsx`:

```tsx
export default function LandingPage() {
  return <main />;
}
```

`apps/landing/src/app/health/route.ts`. It does not import `@automator/contracts` — the landing takes no workspace dependency beyond `@automator/ui`:

```ts
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 5: Install and verify the app boots**

```bash
bun install
bun run dev --filter=@automator/landing
```

Expected: Next starts and `http://localhost:3004` serves an empty page with no console error. Then `curl -s localhost:3004/health` prints `{"status":"ok"}`. Stop the dev server.

- [ ] **Step 6: Run the repository checks**

```bash
bun run lint --filter=@automator/landing
bun run typecheck --filter=@automator/landing
bun run build --filter=@automator/landing
bun run format:check
```

Expected: all pass. If `format:check` fails, run `bun run format` and re-check.

- [ ] **Step 7: Commit**

```bash
git add apps/landing bun.lock
git commit -m "feat(landing): scaffold the landing app"
```

---

### Task 2: Flow data and edge geometry

**Files:**

- Create: `apps/landing/src/flow-diagram/flow.ts`
- Create: `apps/landing/src/flow-diagram/geometry.ts`
- Create: `apps/landing/src/flow-diagram/geometry.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type FlowNodeState = "idle" | "rehearsed" | "ran"`
  - `interface FlowNode { id: string; label: string; type: string; icon: RemixiconComponentType; column: number; row: number; note: Record<Exclude<FlowNodeState, "idle">, string> }`
  - `interface FlowEdge { from: string; to: string; label?: string; fired: boolean }`
  - `const FLOW_NODES: FlowNode[]`, `const FLOW_EDGES: FlowEdge[]`
  - `const LAYOUT: { nodeWidth: number; nodeHeight: number; columnGap: number; rowGap: number }`
  - `function nodeRect(node: FlowNode): { x: number; y: number; width: number; height: number }`
  - `function edgePath(from: FlowNode, to: FlowNode): string`
  - `function diagramSize(nodes: FlowNode[]): { width: number; height: number }`

- [ ] **Step 1: Give the package a `test` script**

Task 1 left it out on purpose, because `bun test` exits 1 with no test file to run. Add it to `apps/landing/package.json`'s scripts, after `typecheck`, now that this task creates the first test:

```json
"test": "bun test"
```

- [ ] **Step 2: Write the failing test**

`apps/landing/src/flow-diagram/geometry.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { FLOW_EDGES, FLOW_NODES, LAYOUT } from "./flow";
import { diagramSize, edgePath, nodeRect } from "./geometry";

const at = (column: number, row: number) => ({
  ...FLOW_NODES[0]!,
  id: `n${column}${row}`,
  column,
  row,
});

describe("nodeRect", () => {
  test("places a node on the column and row grid", () => {
    expect(nodeRect(at(0, 0))).toEqual({
      x: 0,
      y: 0,
      width: LAYOUT.nodeWidth,
      height: LAYOUT.nodeHeight,
    });
    expect(nodeRect(at(2, 1))).toEqual({
      x: 2 * (LAYOUT.nodeWidth + LAYOUT.columnGap),
      y: LAYOUT.nodeHeight + LAYOUT.rowGap,
      width: LAYOUT.nodeWidth,
      height: LAYOUT.nodeHeight,
    });
  });
});

describe("edgePath", () => {
  test("leaves the source's right edge and enters the target's left edge", () => {
    const path = edgePath(at(0, 0), at(1, 0));
    const y = LAYOUT.nodeHeight / 2;
    expect(path.startsWith(`M ${LAYOUT.nodeWidth} ${y}`)).toBe(true);
    expect(path.endsWith(`${LAYOUT.nodeWidth + LAYOUT.columnGap} ${y}`)).toBe(true);
  });

  test("curves horizontally, so a row change never leaves the handles vertically", () => {
    const path = edgePath(at(0, 0), at(1, 1));
    const [, firstControl] = path.split("C");
    expect(firstControl).toBeDefined();
    // The first control point shares the source handle's y, keeping the exit horizontal.
    expect(
      firstControl!
        .trim()
        .startsWith(`${LAYOUT.nodeWidth + LAYOUT.columnGap / 2} ${LAYOUT.nodeHeight / 2}`),
    ).toBe(true);
  });
});

describe("diagramSize", () => {
  test("covers every node in the real flow", () => {
    const size = diagramSize(FLOW_NODES);
    const columns = Math.max(...FLOW_NODES.map((node) => node.column)) + 1;
    const rows = Math.max(...FLOW_NODES.map((node) => node.row)) + 1;
    expect(size.width).toBe(columns * LAYOUT.nodeWidth + (columns - 1) * LAYOUT.columnGap);
    expect(size.height).toBe(rows * LAYOUT.nodeHeight + (rows - 1) * LAYOUT.rowGap);
  });
});

describe("the flow itself", () => {
  test("every edge connects two nodes that exist", () => {
    const ids = new Set(FLOW_NODES.map((node) => node.id));
    for (const edge of FLOW_EDGES) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
bun test apps/landing/src/flow-diagram/geometry.test.ts
```

Expected: FAIL — `Cannot find module './flow'`.

- [ ] **Step 4: Write the flow data**

`apps/landing/src/flow-diagram/flow.ts`. The node types and labels come from the product's own catalog (`apps/web/src/builder/catalog.ts`), so the page and the builder name the same things the same way.

```ts
import {
  RiDiscordLine,
  RiGitBranchLine,
  RiSendPlaneLine,
  RiTimeLine,
  RiWallet3Line,
  type RemixiconComponentType,
} from "@remixicon/react";

export type FlowNodeState = "idle" | "rehearsed" | "ran";

export interface FlowNode {
  id: string;
  /** The node's own label, the way a builder would name it. */
  label: string;
  /** The catalog label for the node type, e.g. "Schedule". */
  type: string;
  icon: RemixiconComponentType;
  column: number;
  row: number;
  /** What the node reports in each non-idle state. */
  note: Record<Exclude<FlowNodeState, "idle">, string>;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  /** Whether this edge carried the run in the "ran" state. */
  fired: boolean;
}

export const FLOW_NODES: FlowNode[] = [
  {
    id: "schedule",
    label: "Every morning at 9:00",
    type: "Schedule",
    icon: RiTimeLine,
    column: 0,
    row: 0,
    note: { rehearsed: "Starts the rehearsal", ran: "Fired 09:00:04" },
  },
  {
    id: "balance",
    label: "Check treasury balance",
    type: "Check balance",
    icon: RiWallet3Line,
    column: 1,
    row: 0,
    note: { rehearsed: "Reads the real balance", ran: "412.60 USDC" },
  },
  {
    id: "threshold",
    label: "Below 500 USDC?",
    type: "If/else",
    icon: RiGitBranchLine,
    column: 2,
    row: 0,
    note: { rehearsed: "Both branches explained", ran: "true → top up" },
  },
  {
    id: "payout",
    label: "Top up from treasury",
    type: "USDC payout",
    icon: RiSendPlaneLine,
    column: 3,
    row: 0,
    note: { rehearsed: "Dry run · ~0.0004 ETH gas", ran: "Sent 100 USDC · 0x7f3a…c21b" },
  },
  {
    id: "discord",
    label: "Post to Discord",
    type: "Discord message",
    icon: RiDiscordLine,
    column: 4,
    row: 0,
    note: { rehearsed: "Message previewed, not sent", ran: "Posted to #treasury" },
  },
];

export const FLOW_EDGES: FlowEdge[] = [
  { from: "schedule", to: "balance", fired: true },
  { from: "balance", to: "threshold", fired: true },
  { from: "threshold", to: "payout", label: "true", fired: true },
  { from: "payout", to: "discord", fired: true },
];
```

- [ ] **Step 5: Write the geometry**

`apps/landing/src/flow-diagram/geometry.ts`:

```ts
import type { FlowNode } from "./flow";

export const LAYOUT = {
  nodeWidth: 232,
  nodeHeight: 76,
  columnGap: 56,
  rowGap: 28,
} as const;

export function nodeRect(node: FlowNode) {
  return {
    x: node.column * (LAYOUT.nodeWidth + LAYOUT.columnGap),
    y: node.row * (LAYOUT.nodeHeight + LAYOUT.rowGap),
    width: LAYOUT.nodeWidth,
    height: LAYOUT.nodeHeight,
  };
}

/** A cubic curve from the source's right handle to the target's left handle. */
export function edgePath(from: FlowNode, to: FlowNode): string {
  const source = nodeRect(from);
  const target = nodeRect(to);
  const x1 = source.x + source.width;
  const y1 = source.y + source.height / 2;
  const x2 = target.x;
  const y2 = target.y + target.height / 2;
  const control = Math.max(LAYOUT.columnGap / 2, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + control} ${y1}, ${x2 - control} ${y2}, ${x2} ${y2}`;
}

export function diagramSize(nodes: FlowNode[]) {
  const columns = Math.max(...nodes.map((node) => node.column)) + 1;
  const rows = Math.max(...nodes.map((node) => node.row)) + 1;
  return {
    width: columns * LAYOUT.nodeWidth + (columns - 1) * LAYOUT.columnGap,
    height: rows * LAYOUT.nodeHeight + (rows - 1) * LAYOUT.rowGap,
  };
}
```

`LAYOUT` is exported from `geometry.ts` and re-exported for the test's import from `./flow`: add this line at the end of `flow.ts`:

```ts
export { LAYOUT } from "./geometry";
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
bun test apps/landing/src/flow-diagram/geometry.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
bun run format
git add apps/landing/src/flow-diagram
git commit -m "feat(landing): describe the demo flow and its edge geometry"
```

---

### Task 3: The flow diagram component

**Files:**

- Create: `apps/landing/src/flow-diagram/flow-diagram.tsx`
- Test: none (presentation only; verified in the browser at the end of the task)

**Interfaces:**

- Consumes: `FLOW_NODES`, `FLOW_EDGES`, `FlowNodeState` from `./flow`; `edgePath`, `nodeRect`, `diagramSize`, `LAYOUT` from `./geometry`.
- Produces: `function FlowDiagram({ state, className }: { state: FlowNodeState; className?: string }): ReactElement`.

- [ ] **Step 1: Write the component**

The diagram is one positioned box holding an absolutely-positioned `<svg>` for edges and absolutely-positioned node cards on top. It scales down on narrow viewports with a CSS `zoom`-free approach: the wrapper sets `width: <diagram width>px` and the parent scales it with a `transform` driven by a container-relative CSS variable, so no JavaScript measurement is needed.

```tsx
"use client";

import { RiCheckLine, RiEyeLine } from "@remixicon/react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactElement } from "react";
import { FLOW_EDGES, FLOW_NODES, type FlowNodeState } from "./flow";
import { diagramSize, edgePath, nodeRect } from "./geometry";

const byId = new Map(FLOW_NODES.map((node) => [node.id, node]));
const size = diagramSize(FLOW_NODES);

export function FlowDiagram({
  state,
  className,
}: {
  state: FlowNodeState;
  className?: string;
}): ReactElement {
  const reduced = useReducedMotion();
  return (
    <div
      className={className}
      style={{ width: size.width, height: size.height, position: "relative" }}
      aria-label="A flow: every morning at 9:00, check the treasury balance, and if it is below 500 USDC top it up and post to Discord"
      role="img"
    >
      <svg
        className="absolute inset-0 overflow-visible"
        width={size.width}
        height={size.height}
        aria-hidden="true"
      >
        {FLOW_EDGES.map((edge) => {
          const from = byId.get(edge.from)!;
          const to = byId.get(edge.to)!;
          const lit = state === "ran" && edge.fired;
          return (
            <motion.path
              key={`${edge.from}-${edge.to}`}
              d={edgePath(from, to)}
              fill="none"
              strokeWidth={1.5}
              className={lit ? "stroke-success-foreground" : "stroke-border"}
              initial={reduced ? false : { pathLength: 0 }}
              whileInView={reduced ? undefined : { pathLength: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          );
        })}
      </svg>
      {FLOW_NODES.map((node) => {
        const rect = nodeRect(node);
        const Icon = node.icon;
        return (
          <div
            key={node.id}
            className="absolute flex flex-col justify-center gap-1 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-xs"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          >
            <span className="flex items-center gap-2">
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-label truncate">{node.label}</span>
            </span>
            {state === "idle" ? (
              <span className="text-caption text-muted-foreground">{node.type}</span>
            ) : (
              <span className="text-caption flex items-center gap-1.5 text-muted-foreground">
                {state === "rehearsed" ? (
                  <RiEyeLine className="size-3.5" aria-hidden="true" />
                ) : (
                  <RiCheckLine className="size-3.5 text-success-foreground" aria-hidden="true" />
                )}
                {node.note[state]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Check the token names actually exist**

```bash
grep -nE 'success-foreground|--color-card|--color-border|--color-muted-foreground' packages/tailwind-config/colors.css
```

Expected: each token is defined. If `success-foreground` or `card` is missing under a different name, use the name the file actually defines — do not invent a token, and do not add one to `colors.css` for the landing.

- [ ] **Step 3: Render it temporarily and look at it**

Put the diagram on the page for the duration of this task, in `apps/landing/src/app/page.tsx`:

```tsx
import { FlowDiagram } from "../flow-diagram/flow-diagram";

export default function LandingPage() {
  return (
    <main className="flex flex-col items-center gap-16 p-16">
      <FlowDiagram state="idle" />
      <FlowDiagram state="rehearsed" />
      <FlowDiagram state="ran" />
    </main>
  );
}
```

Run `bun run dev --filter=@automator/landing`, open `http://localhost:3004`, and confirm: edges start and end on the node cards' handles, the three states differ, and nothing overflows its card. Check both themes by toggling the OS appearance.

- [ ] **Step 4: Run the checks**

```bash
bun run lint --filter=@automator/landing
bun run typecheck --filter=@automator/landing
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
bun run format
git add apps/landing
git commit -m "feat(landing): draw the demo flow in three states"
```

---

### Task 4: Page shell — header, section frame, footer

**Files:**

- Create: `apps/landing/src/components/site-header.tsx`
- Create: `apps/landing/src/components/site-footer.tsx`
- Create: `apps/landing/src/components/section.tsx`
- Create: `apps/landing/src/links.ts`
- Modify: `apps/landing/src/app/page.tsx`

**Interfaces:**

- Consumes: `@automator/ui/logo`, `@automator/ui/button`, `@automator/ui/theme-select`.
- Produces:
  - `const LINKS: { app: string; github: string; demo: string | null; submission: string | null }`
  - `function SiteHeader(): ReactElement`
  - `function SiteFooter(): ReactElement`
  - `function Section({ id, eyebrow, title, body, children }: { id: string; eyebrow: string; title: string; body: string; children?: ReactNode }): ReactElement`

- [ ] **Step 1: Write the link table**

`apps/landing/src/links.ts`. The demo video and the ETHOnline submission do not exist yet; they are `null` and every consumer hides its control when a link is `null`. Do not invent URLs.

```ts
export const LINKS = {
  app: "https://app.automator.ardasari.co",
  github: "https://github.com/ardasarico/automator",
  demo: null,
  submission: null,
} satisfies { app: string; github: string; demo: string | null; submission: string | null };
```

- [ ] **Step 2: Write the section frame**

`apps/landing/src/components/section.tsx`. Every content section shares this frame: a 1040 px centred column, an eyebrow, a title on `text-panel`, and a lead paragraph.

```tsx
import type { ReactElement, ReactNode } from "react";

export function Section({
  id,
  eyebrow,
  title,
  body,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <section id={id} className="mx-auto w-full max-w-[1040px] px-6 py-20 sm:py-24">
      <p className="text-caption font-medium text-muted-foreground uppercase">{eyebrow}</p>
      <h2 className="text-panel mt-2 max-w-2xl text-balance">{title}</h2>
      <p className="text-body mt-3 max-w-2xl text-muted-foreground">{body}</p>
      {children ? <div className="mt-10">{children}</div> : null}
    </section>
  );
}
```

- [ ] **Step 3: Write the header**

`apps/landing/src/components/site-header.tsx`:

```tsx
import { Button } from "@automator/ui/button";
import { Logo } from "@automator/ui/logo";
import { ThemeSelect } from "@automator/ui/theme-select";
import type { ReactElement } from "react";
import { LINKS } from "../links";

const SECTIONS = [
  { href: "#rehearse", label: "Rehearse" },
  { href: "#read", label: "Read" },
  { href: "#compose", label: "Compose" },
  { href: "#built-with", label: "Built with" },
];

export function SiteHeader(): ReactElement {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1040px] items-center gap-6 px-6">
        <a href="#top" aria-label="Automator">
          <Logo height={22} width={118} />
        </a>
        <nav className="hidden gap-5 sm:flex" aria-label="Sections">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="text-caption text-muted-foreground hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSelect />
          <Button size="sm" render={<a href={LINKS.app} />}>
            Open app
          </Button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Write the footer**

`apps/landing/src/components/site-footer.tsx`:

```tsx
import { Logo } from "@automator/ui/logo";
import type { ReactElement } from "react";
import { LINKS } from "../links";

export function SiteFooter(): ReactElement {
  const links = [
    { href: LINKS.app, label: "Open app" },
    { href: LINKS.github, label: "GitHub" },
    LINKS.demo ? { href: LINKS.demo, label: "Demo video" } : null,
    LINKS.submission ? { href: LINKS.submission, label: "ETHOnline submission" } : null,
  ].filter((link) => link !== null);

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center">
        <Logo height={20} width={107} className="text-muted-foreground" />
        <p className="text-caption text-muted-foreground sm:ml-4">Built for ETHOnline 2026.</p>
        <nav className="flex gap-4 sm:ml-auto" aria-label="Elsewhere">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-caption text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: Compose them on the page**

`apps/landing/src/app/page.tsx` — the temporary three-diagram scratch from Task 3 goes away here:

```tsx
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="top" />
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 6: Verify and commit**

```bash
bun run lint --filter=@automator/landing
bun run typecheck --filter=@automator/landing
bun run format
git add apps/landing
git commit -m "feat(landing): add the page shell, header and footer"
```

Expected: checks pass; `http://localhost:3004` shows a header with a working theme select and an "Open app" button.

---

### Task 5: Hero

**Files:**

- Create: `apps/landing/src/sections/hero.tsx`
- Create: `apps/landing/src/sections/hero.module.css`
- Modify: `apps/landing/src/app/page.tsx`

**Interfaces:**

- Consumes: `FlowDiagram` (Task 3), `LINKS` (Task 4).
- Produces: `function Hero(): ReactElement`.

- [ ] **Step 1: Write the background module**

`apps/landing/src/sections/hero.module.css`. This is the one CSS module the spec allows: a grid rule plus a radial mask, the same technique `apps/web/src/app/(workspace)/flows/flows.module.css` uses for its empty-state hero. No WebGL.

```css
.hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.hero::before {
  content: "";
  position: absolute;
  z-index: -2;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(var(--border) 1px, transparent 1px),
    linear-gradient(90deg, var(--border) 1px, transparent 1px);
  background-size: 32px 32px;
  background-position: center;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, #000 10%, transparent 75%);
  opacity: 0.7;
}

.hero::after {
  content: "";
  position: absolute;
  z-index: -1;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 70% 50% at 50% 0%,
    color-mix(in oklch, var(--info-surface) 70%, transparent),
    transparent 70%
  );
}
```

Before writing it, confirm `--border` and `--info-surface` are the real variable names:

```bash
grep -nE '^\s*--(border|info-surface):' packages/tailwind-config/colors.css
```

If a name differs, use the one the file defines.

- [ ] **Step 2: Write the hero**

`apps/landing/src/sections/hero.tsx`. The headline is the _visibility_ register agreed in the spec.

```tsx
import { Button } from "@automator/ui/button";
import { RiArrowRightLine, RiGithubLine, RiPlayCircleLine } from "@remixicon/react";
import type { ReactElement } from "react";
import { FlowDiagram } from "../flow-diagram/flow-diagram";
import { LINKS } from "../links";
import styles from "./hero.module.css";

export function Hero(): ReactElement {
  return (
    <section className={styles.hero}>
      <div className="mx-auto w-full max-w-[1040px] px-6 pt-20 pb-16 text-center sm:pt-28">
        <h1 className="text-page mx-auto max-w-3xl text-balance sm:text-[2.75rem] sm:leading-[1.1]">
          See what your onchain automation will do before it does it.
        </h1>
        <p className="text-body mx-auto mt-5 max-w-xl text-pretty text-muted-foreground">
          Automator is a canvas for onchain workflows. Draw a flow or describe it in a sentence,
          rehearse it without spending anything, then read every run node by node.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button render={<a href={LINKS.app} />}>
            Open app
            <RiArrowRightLine />
          </Button>
          {LINKS.demo ? (
            <Button variant="outline" render={<a href={LINKS.demo} />}>
              <RiPlayCircleLine />
              Watch the demo
            </Button>
          ) : (
            <Button variant="outline" render={<a href={LINKS.github} />}>
              <RiGithubLine />
              Read the source
            </Button>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1040px] overflow-x-auto px-6 pb-20">
        <FlowDiagram state="idle" className="mx-auto" />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Put it on the page**

In `apps/landing/src/app/page.tsx`, render `<Hero />` inside `<main id="top">`.

- [ ] **Step 4: Look at it in the browser**

Run the dev server and check at 1440 px and at 400 px: the headline balances onto two or three lines, the diagram scrolls horizontally inside its own container without the page scrolling sideways, and the grid背 background fades out rather than ending in a hard edge. Check both themes.

- [ ] **Step 5: Verify and commit**

```bash
bun run lint --filter=@automator/landing
bun run typecheck --filter=@automator/landing
bun run format
git add apps/landing
git commit -m "feat(landing): add the hero"
```

---

### Task 6: Rehearse and Read sections

**Files:**

- Create: `apps/landing/src/sections/rehearse.tsx`
- Create: `apps/landing/src/sections/read.tsx`
- Modify: `apps/landing/src/app/page.tsx`

**Interfaces:**

- Consumes: `Section` (Task 4), `FlowDiagram` (Task 3).
- Produces: `function Rehearse(): ReactElement`, `function Read(): ReactElement`.

- [ ] **Step 1: Write the Rehearse section**

`apps/landing/src/sections/rehearse.tsx`:

```tsx
import type { ReactElement } from "react";
import { FlowDiagram } from "../flow-diagram/flow-diagram";
import { Section } from "../components/section";

export function Rehearse(): ReactElement {
  return (
    <Section
      id="rehearse"
      eyebrow="Rehearse"
      title="Run it once with the money switched off."
      body="Simulate runs the same flow on the canvas with every onchain write in dry-run mode: it reports the gas each call would cost and decodes the revert when one would fail, and nothing is broadcast. Screens are answered for you, so a flow with a form still runs end to end."
    >
      <div className="overflow-x-auto">
        <FlowDiagram state="rehearsed" className="mx-auto" />
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Write the Read section**

`apps/landing/src/sections/read.tsx`. The run-panel screenshot arrives in Task 9; until then the figure renders the diagram alone, and the image is added in that task.

```tsx
import type { ReactElement } from "react";
import { FlowDiagram } from "../flow-diagram/flow-diagram";
import { Section } from "../components/section";

export function Read(): ReactElement {
  return (
    <Section
      id="read"
      eyebrow="Read"
      title="Then read the run, node by node."
      body="Every run is stored with the trigger that started it, each node's status and elapsed time, the output it produced, and the transaction hash when it moved money. When a node fails, the run says why — and can ask the model to explain it."
    >
      <div className="overflow-x-auto">
        <FlowDiagram state="ran" className="mx-auto" />
      </div>
    </Section>
  );
}
```

- [ ] **Step 3: Put both on the page, in order: Hero, Rehearse, Read**

- [ ] **Step 4: Verify and commit**

```bash
bun run lint --filter=@automator/landing
bun run typecheck --filter=@automator/landing
bun run format
git add apps/landing
git commit -m "feat(landing): show the flow rehearsed and read"
```

Expected: scrolling the page moves through the same five nodes three times, changing state each time.

---

### Task 7: Compose, Triggers and Ship sections

**Files:**

- Create: `apps/landing/src/sections/compose.tsx`
- Create: `apps/landing/src/sections/triggers.tsx`
- Create: `apps/landing/src/sections/ship.tsx`
- Modify: `apps/landing/src/app/page.tsx`

**Interfaces:**

- Consumes: `Section` (Task 4).
- Produces: `function Compose(): ReactElement`, `function Triggers(): ReactElement`, `function Ship(): ReactElement`.

- [ ] **Step 1: Write the Compose section**

`apps/landing/src/sections/compose.tsx`. It shows a prompt turning into a flow: a mono line of the sentence, an arrow, and the five node names as chips.

```tsx
import { Badge } from "@automator/ui/badge";
import { RiArrowRightLine, RiSparkling2Line } from "@remixicon/react";
import type { ReactElement } from "react";
import { FLOW_NODES } from "../flow-diagram/flow";
import { Section } from "../components/section";

export function Compose(): ReactElement {
  return (
    <Section
      id="compose"
      eyebrow="Compose"
      title="Or describe the flow and let the model draft it."
      body="Write what you want in a sentence. The API validates the model's proposal against the same schema the canvas uses and test-runs it against sample scenarios before you can apply it, so a bad draft never reaches your canvas."
    >
      <div className="rounded-3xl border border-border bg-card p-6">
        <p className="text-code flex items-start gap-2 font-mono text-muted-foreground">
          <RiSparkling2Line className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          “Every morning, check the treasury and top it up with 100 USDC if it drops below 500, then
          tell the team on Discord.”
        </p>
        <RiArrowRightLine
          className="mt-4 size-4 rotate-90 text-muted-foreground"
          aria-hidden="true"
        />
        <ul className="mt-4 flex flex-wrap gap-2">
          {FLOW_NODES.map((node) => (
            <li key={node.id}>
              <Badge variant="outline">{node.label}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Write the Triggers section**

`apps/landing/src/sections/triggers.tsx`. Four cards, one per trigger the product actually ships (`trigger.webhook`, `trigger.schedule`, `trigger.price`, `trigger.balance`).

```tsx
import { RiLineChartLine, RiLinksLine, RiTimeLine, RiWallet3Line } from "@remixicon/react";
import type { ReactElement } from "react";
import { Section } from "../components/section";

const TRIGGERS = [
  {
    icon: RiLinksLine,
    title: "Webhook",
    body: "A URL you can post to from anything.",
  },
  {
    icon: RiTimeLine,
    title: "Schedule",
    body: "A fixed interval or a time of day.",
  },
  {
    icon: RiLineChartLine,
    title: "Price",
    body: "A Chainlink feed crossing the level you set.",
  },
  {
    icon: RiWallet3Line,
    title: "Balance",
    body: "A wallet's token balance moving past a threshold.",
  },
];

export function Triggers(): ReactElement {
  return (
    <Section
      id="triggers"
      eyebrow="Triggers"
      title="Then let it run on its own."
      body="Activate a flow and it waits for its trigger. Every run it makes is kept, so an automation you cannot watch never happens here."
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRIGGERS.map((trigger) => (
          <li key={trigger.title} className="rounded-2xl border border-border bg-card p-4">
            <trigger.icon className="size-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-label mt-3">{trigger.title}</p>
            <p className="text-caption mt-1 text-muted-foreground">{trigger.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

- [ ] **Step 3: Write the Ship section**

`apps/landing/src/sections/ship.tsx`:

```tsx
import type { ReactElement } from "react";
import { Section } from "../components/section";

export function Ship(): ReactElement {
  return (
    <Section
      id="ship"
      eyebrow="Ship"
      title="Publish a flow as a link."
      body="A flow with screens becomes a mini-app a visitor can open: it signs them in, can ask them to prove they are human with World ID, and runs the same nodes you rehearsed. Secrets stay on the server; the visitor never sees them."
    />
  );
}
```

- [ ] **Step 4: Put all three on the page, after Read**

- [ ] **Step 5: Verify and commit**

```bash
bun run lint --filter=@automator/landing
bun run typecheck --filter=@automator/landing
bun run format
git add apps/landing
git commit -m "feat(landing): add the compose, triggers and ship sections"
```

---

### Task 8: Built with, and the closing call to action

**Files:**

- Create: `apps/landing/src/sections/built-with.tsx`
- Create: `apps/landing/src/sections/closing.tsx`
- Modify: `apps/landing/src/app/page.tsx`

**Interfaces:**

- Consumes: `Section` (Task 4), `LINKS` (Task 4).
- Produces: `function BuiltWith(): ReactElement`, `function Closing(): ReactElement`.

- [ ] **Step 1: Confirm every claim before writing it**

This is the section the jury reads, so each line must describe what the code does. Check each one:

```bash
grep -rn "world" apps/api/src --include='*.ts' -l | head
grep -rn "chainlink\|aggregator" apps/api/src --include='*.ts' -il | head
grep -rn "token-api\|thegraph\|TOKEN_API_KEY" apps/api/src packages --include='*.ts' -l | head
grep -rn "openrouter" apps/api/src --include='*.ts' -l | head
```

If a claim below does not match what you find, correct the claim — do not keep the sentence.

- [ ] **Step 2: Write the section**

`apps/landing/src/sections/built-with.tsx`:

```tsx
import type { ReactElement } from "react";
import { Section } from "../components/section";

const STACK = [
  {
    name: "Privy",
    body: "Signs people in and holds the embedded wallet that signs a flow's transactions.",
  },
  {
    name: "Circle USDC",
    body: "The token every payout, payment and balance node moves and reads, on testnet.",
  },
  {
    name: "Base",
    body: "Where flows run: Base Sepolia, alongside World Chain Sepolia.",
  },
  {
    name: "World ID",
    body: "A proof-of-human screen a published mini-app can put in front of a run.",
  },
  {
    name: "Chainlink",
    body: "The price feeds behind the price trigger, polled edge-to-edge by the scheduler.",
  },
  {
    name: "The Graph",
    body: "The Token API behind the balance trigger, watching a wallet between runs.",
  },
  {
    name: "OpenRouter",
    body: "The model behind the AI nodes and the flow composer, with an OpenAI fallback.",
  },
  {
    name: "Railway",
    body: "Runs the web app, the API, the mini-app runtime and Postgres.",
  },
];

export function BuiltWith(): ReactElement {
  return (
    <Section
      id="built-with"
      eyebrow="Built with"
      title="What each piece actually does here."
      body="Automator is a Bun and Turborepo monorepo: Next.js on the front, Elysia and Postgres behind it, viem for chain access."
    >
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {STACK.map((item) => (
          <div key={item.name}>
            <dt className="text-label">{item.name}</dt>
            <dd className="text-caption mt-1 text-muted-foreground">{item.body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
```

- [ ] **Step 3: Write the closing call to action**

`apps/landing/src/sections/closing.tsx`:

```tsx
import { Button } from "@automator/ui/button";
import { RiArrowRightLine, RiGithubLine } from "@remixicon/react";
import type { ReactElement } from "react";
import { LINKS } from "../links";

export function Closing(): ReactElement {
  return (
    <section className="mx-auto w-full max-w-[1040px] px-6 pt-8 pb-24">
      <div className="rounded-3xl border border-border bg-card px-6 py-14 text-center">
        <h2 className="text-panel text-balance">Build one, and watch it run.</h2>
        <p className="text-body mx-auto mt-3 max-w-md text-muted-foreground">
          The canvas opens with examples you can fork, and a prompt if you would rather describe
          what you want.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button render={<a href={LINKS.app} />}>
            Open app
            <RiArrowRightLine />
          </Button>
          <Button variant="outline" render={<a href={LINKS.github} />}>
            <RiGithubLine />
            GitHub
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Assemble the final page**

`apps/landing/src/app/page.tsx`:

```tsx
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { BuiltWith } from "../sections/built-with";
import { Closing } from "../sections/closing";
import { Compose } from "../sections/compose";
import { Hero } from "../sections/hero";
import { Read } from "../sections/read";
import { Rehearse } from "../sections/rehearse";
import { Ship } from "../sections/ship";
import { Triggers } from "../sections/triggers";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="top">
        <Hero />
        <Rehearse />
        <Read />
        <Compose />
        <Triggers />
        <Ship />
        <BuiltWith />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 5: Verify and commit**

```bash
bun run lint --filter=@automator/landing
bun run typecheck --filter=@automator/landing
bun run build --filter=@automator/landing
bun run format
git add apps/landing
git commit -m "feat(landing): add the built-with section and the closing call to action"
```

---

### Task 9: The run-panel screenshot

**Files:**

- Create: `apps/landing/public/run-panel-light.png`
- Create: `apps/landing/public/run-panel-dark.png`
- Modify: `apps/landing/src/sections/read.tsx`

**Interfaces:**

- Consumes: the Read section from Task 6.
- Produces: nothing new; the section gains a figure.

- [ ] **Step 1: Get a real run on screen**

Start the stack (`bun run dev`) with `apps/api/.env` and `apps/web/.env.local` in place, open a flow in the builder, run it, and open the run panel so it shows per-node outputs. A run from `/runs` works equally well. Capture the panel at a 2× device pixel ratio in both themes.

If the local stack cannot produce a run (no database, no keys), stop and report it rather than faking a screenshot: an invented run panel would put claims on the page that the product does not make.

- [ ] **Step 2: Save both files under `apps/landing/public/` and check their size**

```bash
ls -lh apps/landing/public
```

Expected: each file well under 1 MB. If not, re-export at a lower scale.

- [ ] **Step 3: Show them in the Read section**

Add, inside `Read`'s `Section` children and above the diagram:

```tsx
<figure className="mb-8 overflow-hidden rounded-3xl border border-border">
  <img
    src="/run-panel-light.png"
    alt="A run panel listing each node with its status, elapsed time and output"
    className="block w-full dark:hidden"
    width={2000}
    height={1200}
  />
  <img
    src="/run-panel-dark.png"
    alt=""
    aria-hidden="true"
    className="hidden w-full dark:block"
    width={2000}
    height={1200}
  />
</figure>
```

Set `width` and `height` to the real pixel dimensions of the exported files so the layout does not shift.

- [ ] **Step 4: Verify and commit**

```bash
bun run lint --filter=@automator/landing
bun run build --filter=@automator/landing
bun run format
git add apps/landing
git commit -m "feat(landing): show a real run panel in the read section"
```

---

### Task 10: Responsive, motion and accessibility pass

**Files:**

- Modify: whichever section files the pass turns up
- Create: `apps/landing/src/app/opengraph-image.tsx`

**Interfaces:**

- Consumes: every section.
- Produces: an Open Graph image at `/opengraph-image`.

- [ ] **Step 1: Write the Open Graph image**

`apps/landing/src/app/opengraph-image.tsx`, using `next/og`, which ships with Next and needs no dependency:

```tsx
import { ImageResponse } from "next/og";

export const alt = "Automator — see what your onchain automation will do";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "#0a0a0a",
        color: "#fafafa",
        fontSize: 56,
        letterSpacing: "-0.02em",
      }}
    >
      <div style={{ fontSize: 28, opacity: 0.6, marginBottom: 24 }}>Automator</div>
      <div>See what your onchain automation will do before it does it.</div>
    </div>,
    size,
  );
}
```

- [ ] **Step 2: Check the page at three widths**

Run the dev server and check 1440 px, 768 px and 400 px. At 400 px: no horizontal page scroll, a side gutter of at least 24 px everywhere, the diagram scrolling inside its own container only, and no text smaller than the `text-caption` token.

- [ ] **Step 3: Check reduced motion**

In the browser's rendering panel, force `prefers-reduced-motion: reduce`, reload, and confirm every edge is drawn immediately with no animation and nothing depends on an animation having run.

- [ ] **Step 4: Check the headings and landmarks**

```bash
grep -rn "<h1\|<h2\|<h3" apps/landing/src | sort
```

Expected: exactly one `h1` (the hero), and every `Section` contributing an `h2`. Confirm each anchor in the header resolves to a section that exists.

- [ ] **Step 5: Run the full repository checks**

```bash
bun run lint
bun run typecheck
bun run test
bun run build
bun run format:check
```

Expected: all pass. Fix anything the pass turned up in the section files.

- [ ] **Step 6: Commit**

```bash
git add apps/landing
git commit -m "feat(landing): add the open graph image and finish the responsive pass"
```

---

### Task 11: Railway service and environment

**Files:**

- Modify: `.railway/railway.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: the built app from Task 10.
- Produces: a `landing` service in the infrastructure definition.

**Gate:** this task changes deployed infrastructure. Show the diff and the `railway config plan` output to the user and get an explicit yes before applying anything.

- [ ] **Step 1: Add the service to `.railway/railway.ts`**

Insert after the `runtime` service, and add `landing` to the `project(...)` resources array:

```ts
const landing = service("landing", {
  source: github("ardasarico/automator", { branch: "main" }),
  build: {
    builder: "RAILPACK",
    buildCommand: "bun run build --filter=@automator/landing",
    watchPatterns: [
      "/apps/landing/**",
      "/packages/ui/**",
      "/packages/tailwind-config/**",
      "/packages/typescript-config/**",
      "/package.json",
      "/bun.lock",
      "/turbo.json",
      "/.railway/**",
    ],
  },
  start: "bun run --filter @automator/landing start",
  healthcheck: "/health",
  healthcheckTimeout: 60,
  deploy: { restartPolicyMaxRetries: 3 },
  env: {
    NODE_ENV: "production",
    PORT: "3004",
    RAILPACK_NODE_VERSION: "22",
  },
  replicas: { sfo: 1 },
});
```

- [ ] **Step 2: Point web and runtime at the new hosts**

In the same file, change `web.env.NEXT_PUBLIC_RUNTIME_URL` to `"https://run.automator.ardasari.co"` and `runtime.env.WEB_URL` to `"https://app.automator.ardasari.co"`.

Leave both `serviceDomains` entries alone: the generated Railway hosts keep working alongside the custom domains, and removing them would break any link that still uses them.

- [ ] **Step 3: Lint the infrastructure definition and plan the change**

```bash
bun run lint:config
bunx railway config plan
```

Expected: the plan creates one service and updates two variables, and touches nothing else. Read it line by line.

- [ ] **Step 4: Show the plan to the user and wait**

Stop here. Post the plan output and ask for an explicit yes before applying.

- [ ] **Step 5: Apply, once approved**

```bash
bunx railway config apply
```

Then watch the deploy and confirm the service becomes healthy on its `/health` route.

- [ ] **Step 6: Update the README's links**

In `README.md`, replace the dead `[Live app](https://automator.ardasari.co)` link so the landing is `https://automator.ardasari.co` and the app is `https://app.automator.ardasari.co`.

- [ ] **Step 7: Commit**

```bash
bun run format
git add .railway/railway.ts README.md
git commit -m "feat(landing): deploy the landing service on Railway"
```

---

### Task 12: Custom domains and DNS

**Files:** none in the repository.

**Interfaces:**

- Consumes: the deployed `landing` service from Task 11.
- Produces: three live hosts.

**Gate:** this task changes DNS for a zone that also serves the user's personal site. Confirm each record with the user before creating it, and never touch the `ardasari.co` apex, the `www` CNAME, the MX records or the TXT records.

- [ ] **Step 1: Add the custom domains in Railway, one service at a time**

For each of `landing` → `automator.ardasari.co`, `web` → `app.automator.ardasari.co`, `runtime` → `run.automator.ardasari.co`, create the custom domain on the production environment and record the CNAME target Railway hands back. Targets differ per domain; do not assume they are the same.

- [ ] **Step 2: Show the user the exact records to be created**

Present a table of host, type, target, proxy status and TTL, and get an explicit yes.

- [ ] **Step 3: Create the three records in Cloudflare**

In the `ardasari.co` zone, create each as `CNAME`, **Proxy status: DNS only**, TTL Auto. Proxying must stay off: the free plan's universal certificate covers only `*.ardasari.co`, so a proxied third-level host would serve an invalid certificate.

- [ ] **Step 4: Verify from the outside**

```bash
for host in automator app.automator run.automator; do
  echo "== $host.ardasari.co"
  dig +short "$host.ardasari.co"
  curl -sS -o /dev/null -w "%{http_code}\n" --max-time 20 "https://$host.ardasari.co/health"
done
```

Expected: each resolves, and `/health` answers 200 once Railway has issued the certificate (this can take a few minutes). `automator.ardasari.co` itself should also serve the landing at `/`.

- [ ] **Step 5: Report the follow-ups the user must do themselves**

Tell the user, without attempting them:

- Privy dashboard: add `https://app.automator.ardasari.co` to the app's allowed origins and login redirect URIs, or sign-in will fail on the new host.
- World developer portal: point the mini-app's URLs at `https://run.automator.ardasari.co`.

---

## Self-review notes

- Spec coverage: the app (Task 1), styling (Tasks 3-8), the three-state diagram (Tasks 2, 3, 6), all nine sections (Tasks 4-8), assets (Task 9), domain and deploy (Tasks 11, 12), verification (Task 10), follow-ups (Task 12 step 5).
- `LAYOUT` is defined in `geometry.ts` and re-exported from `flow.ts`; the test imports it from `./flow` and both spellings resolve to one object.
- `LINKS.demo` and `LINKS.submission` are `null` on purpose. Every consumer branches on them, so no dead link ships.
