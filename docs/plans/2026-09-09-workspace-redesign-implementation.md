# Workspace Redesign Implementation Plan

> **Status:** implemented across `fa4b909`…`63f920a` and described in `docs/web-ui.md` (commit `10e6e01`). Kept for the reasoning, not as a task list. Do not re-execute this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `apps/web` workspace — shell, page frame, Flows, Runs, Home and Connections — as one application-shell interface, leaving the flow canvas untouched.

**Architecture:** The shell keeps its current behaviour (width spring, `Cmd/Ctrl+Shift+S`, cookie-restored state, reduced motion) and changes only proportions and structure. A new page-frame component replaces the `WorkspacePage` + `WorkspaceBreadcrumbs` pair so every screen gets the same title bar, toolbar and gutter. Two screens gain data they do not have today: Flows needs each flow's graph shape and last run, Home needs daily run counts — both arrive as additive contract fields served by `apps/api` over `@automator/db`.

**Tech Stack:** Next.js (App Router), React 19, Coss/Base UI via `@automator/ui/*` subpaths, Tailwind v4 semantic tokens from `@automator/tailwind-config`, Remix Icons, TypeBox contracts in `@automator/contracts`, Elysia + Bun SQL in `apps/api` / `@automator/db`, `bun test` with `renderToString`, Playwright for e2e, Dither Kit charts via `@automator/ui/dither-chart`.

**Spec:** `docs/plans/2026-09-09-workspace-redesign.md`

## Global Constraints

- **Commits are gated.** `AGENTS.md` requires work to stay uncommitted until Arda asks. Each task therefore ends by running checks and leaving the tree dirty — never `git commit`. When a commit is requested, follow `.agents/skills/committing/SKILL.md`.
- **Boundary:** `web/runtime → api → db`. No database import, driver or credential may enter `apps/web`; every read and write goes through `@automator/api-client/server`. Oxlint enforces this.
- **Contracts:** request/response schemas live in `packages/contracts`, types are inferred from them, and both the API handler and the API client validate against the same schema. Never duplicate a DTO inside an app.
- **Icons:** Remix Icons only (`@remixicon/react`), line variants by default.
- **Language:** English for all code, comments, docs and test names.
- **Verification per task:** `bun run lint`, `bun run typecheck`, and `bun test <changed files>` from the repository root. Run the full `bun run test` and `bun run build` before declaring the plan done.
- **Formatting:** `bun run format` (oxfmt, not prettier) before checks.
- **Design detail is settled while coding.** This plan fixes structure, names and data. Spacing, weights and colour choices inside a screen are Arda's call at implementation time — ask rather than invent when a screen's look is ambiguous.
- **Throwaway references:** `apps/ui-lab/src/app/patterns/**` holds the comparisons these decisions came from. Each task deletes the draft it supersedes and removes its entry from `apps/ui-lab/src/components/lab-shell.tsx`.

## Out of scope for this plan

- **Contracts page** (labelled contracts and addresses). It needs a new table, store, contract schemas, API routes and a builder integration — a separate plan. Until it lands the sidebar has no Contracts entry.
- **Approvals, Agents, Scenarios, Simulations, Audit log** — deferred in the spec as engine work.
- **Narrow-viewport layout**, still recorded as out of scope in `docs/web-ui.md`.
- **"Spent today" on Home.** Nothing tracks gas or model cost today; the stat is omitted rather than faked. Add it when cost tracking exists.

---

### Task 1: Navigation model

The sidebar, the command menu and any future breadcrumb all need one list of destinations. Extracting it first means Task 2 has something to render and later tasks have one place to add a page.

**Files:**

- Create: `apps/web/src/components/nav-model.ts`
- Create: `apps/web/src/components/nav-model.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type NavPage = { href: string; label: string; icon: ComponentType<{ className?: string }> }`; `const primaryPages: readonly NavPage[]`; `const resourcePages: readonly NavPage[]`; `const libraryPages: readonly NavPage[]`; `const allPages: readonly NavPage[]`; `function activePage(pathname: string): NavPage | undefined`.

- [ ] **Step 1: Write the failing test**

```tsx
/// <reference types="bun" />
import { expect, test } from "bun:test";
import { activePage, allPages, primaryPages } from "./nav-model";

test("the primary band is Home, Flows and Runs, in that order", () => {
  expect(primaryPages.map((page) => page.label)).toEqual(["Home", "Flows", "Runs"]);
});

test("every destination has a unique href", () => {
  const hrefs = allPages.map((page) => page.href);
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("a nested route resolves to its section", () => {
  expect(activePage("/runs/run-1")?.label).toBe("Runs");
  expect(activePage("/data/table-1")?.label).toBe("Data");
});

test("Home matches only the root, so it does not swallow every route", () => {
  expect(activePage("/")?.label).toBe("Home");
  expect(activePage("/flows")?.label).toBe("Flows");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/web/src/components/nav-model.test.ts`
Expected: FAIL — `Cannot find module './nav-model'`.

- [ ] **Step 3: Write the implementation**

```ts
import {
  RiCompass3Line,
  RiFlowChart,
  RiHome5Line,
  RiPlayCircleLine,
  RiPlugLine,
  RiTableLine,
  RiWallet3Line,
} from "@remixicon/react";
import type { ComponentType } from "react";

export type NavPage = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const primaryPages: readonly NavPage[] = [
  { href: "/", label: "Home", icon: RiHome5Line },
  { href: "/flows", label: "Flows", icon: RiFlowChart },
  { href: "/runs", label: "Runs", icon: RiPlayCircleLine },
];

export const resourcePages: readonly NavPage[] = [
  { href: "/data", label: "Data", icon: RiTableLine },
  { href: "/connections", label: "Connections", icon: RiPlugLine },
  { href: "/wallet", label: "Wallet", icon: RiWallet3Line },
];

export const libraryPages: readonly NavPage[] = [
  { href: "/marketplace", label: "Marketplace", icon: RiCompass3Line },
];

export const allPages: readonly NavPage[] = [...primaryPages, ...resourcePages, ...libraryPages];

/* "/" would prefix-match everything, so the root is compared exactly. */
export function activePage(pathname: string): NavPage | undefined {
  return allPages.find(({ href }) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/web/src/components/nav-model.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck`
Expected: all pass. Leave the change uncommitted.

---

### Task 2: Sidebar

Rebuild the sidebar at workspace proportions with the three bands, keeping every behaviour that already works. `/` stops redirecting so Home can own it.

**Files:**

- Modify: `apps/web/src/components/workspace-shell.tsx`
- Modify: `apps/web/src/components/workspace-shell.module.css`
- Create: `apps/web/src/components/workspace-shell.test.tsx`
- Delete: `apps/web/src/app/(workspace)/page.tsx` (recreated in Task 10; until then it renders a placeholder — see Step 3)
- Delete: `apps/ui-lab/src/app/patterns/sidebar/` and its `lab-shell.tsx` entry

**Interfaces:**

- Consumes: `primaryPages`, `resourcePages`, `libraryPages`, `NavPage` from Task 1.
- Produces: `WorkspaceShell` keeps its current signature — `{ children: ReactNode; defaultState?: SidebarState }`. Collapsed width becomes `52`, open width `208`.

- [ ] **Step 1: Write the failing test**

```tsx
/// <reference types="bun" />
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { WorkspaceShell } from "./workspace-shell";

test("the sidebar renders all three bands with their group labels", () => {
  const html = renderToString(<WorkspaceShell>content</WorkspaceShell>);
  expect(html).toContain('href="/flows"');
  expect(html).toContain('href="/connections"');
  expect(html).toContain('href="/marketplace"');
  expect(html).toContain("Resources");
  expect(html).toContain("Library");
});

test("the skip link and the collapse control survive the rebuild", () => {
  const html = renderToString(<WorkspaceShell>content</WorkspaceShell>);
  expect(html).toContain('href="#workspace-content"');
  expect(html).toContain('aria-label="Collapse sidebar"');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/web/src/components/workspace-shell.test.tsx`
Expected: FAIL — no "Resources" in the output.

- [ ] **Step 3: Write the implementation**

Replace the local `pages` array in `workspace-shell.tsx` with the Task 1 imports and render the three bands. Keep `SidebarHeader`, `SidebarLink`, the `motion.aside` spring, `MotionConfig`, `TooltipProvider`, the skip link and `AccountMenu` exactly as they are; change only the widths and the navigation body:

```tsx
import { libraryPages, primaryPages, resourcePages, type NavPage } from "./nav-model";

function NavBand({ label, pages }: { label?: string; pages: readonly NavPage[] }) {
  return (
    <div className={styles.navBand}>
      {label && (
        <p className={styles.navGroup} aria-hidden="true">
          {label}
        </p>
      )}
      {pages.map((page) => (
        <SidebarLink key={page.href} {...page} />
      ))}
    </div>
  );
}
```

and inside `WorkspaceFrame`:

```tsx
animate={{ width: isOpen ? 208 : 52 }}
```

```tsx
<nav aria-label="Main navigation" className={styles.navigation}>
  <NavBand pages={primaryPages} />
  <NavBand label="Resources" pages={resourcePages} />
  <NavBand label="Library" pages={libraryPages} />
</nav>
```

In `workspace-shell.module.css`, change the proportions and add the two new rules. Leave every `prefers-reduced-motion` block, focus ring and transition in place:

```css
.header {
  width: 208px;
  padding: 12px 8px 8px;
}
.markSlot {
  width: 32px;
  height: 32px;
}
.navLink {
  min-height: 32px;
  padding: 6px 8px;
  font-size: var(--text-caption);
  line-height: var(--text-caption--line-height);
}
.navIcon {
  width: 16px;
  height: 16px;
}
.navBand {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.navGroup {
  padding: 16px 8px 4px;
  font-size: var(--text-code);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  transition: opacity 200ms var(--ease-press);
}
.shell[data-state="collapsed"] .navGroup {
  opacity: 0;
}
```

Replace `apps/web/src/app/(workspace)/page.tsx` — the redirect to `/flows` goes away because Home now owns the root:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Home · Automator" };

/* Replaced by the real dashboard in Task 10. */
export default function HomePage() {
  return <h1 className="text-section">Home</h1>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/web/src/components/workspace-shell.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Check the behaviour in the browser**

Run the workspace (`bun run dev --filter=@automator/web`, API running separately), then confirm by hand: `Cmd/Ctrl+Shift+S` toggles the sidebar; collapsing shows tooltips on every icon; the state survives a reload; tabbing reaches the skip link first. Note anything that regressed instead of moving on.

- [ ] **Step 6: Remove the superseded draft**

```bash
rm -r apps/ui-lab/src/app/patterns/sidebar
```

Delete the `{ href: "/patterns/sidebar", label: "Sidebar (draft)" }` line from `apps/ui-lab/src/components/lab-shell.tsx`.

- [ ] **Step 7: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test apps/web/src/components`
Expected: all pass. Leave the change uncommitted.

---

### Task 3: Page frame

One component owns the title bar, the toolbar and the gutter, so no page improvises again. `WorkspacePage` and `WorkspaceBreadcrumbs` are replaced; breadcrumbs survive as a prop for detail pages.

**Files:**

- Create: `apps/web/src/components/page-frame.tsx`
- Create: `apps/web/src/components/page-frame.test.tsx`
- Create: `apps/web/src/components/page-frame.module.css`
- Delete: `apps/web/src/components/workspace-page.tsx`
- Delete: `apps/web/src/components/workspace-breadcrumbs.tsx`
- Delete: `apps/ui-lab/src/app/patterns/page-frame/` and its `lab-shell.tsx` entry

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `function PageFrame(props: { title: string; parents?: readonly { label: string; href: string }[]; actions?: ReactNode; toolbar?: ReactNode; children: ReactNode }): ReactElement`
  - CSS module classes `frame`, `titleBar`, `toolbar`, `body`, `gutter`.

- [ ] **Step 1: Write the failing test**

```tsx
/// <reference types="bun" />
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { PageFrame } from "./page-frame";

test("the title renders as the page's only h1", () => {
  const html = renderToString(<PageFrame title="Flows">rows</PageFrame>);
  expect(html).toContain("<h1");
  expect(html).toContain("Flows");
  expect(html.match(/<h1/g)?.length).toBe(1);
});

test("parents render as a labelled breadcrumb trail", () => {
  const html = renderToString(
    <PageFrame title="Run 1" parents={[{ label: "Runs", href: "/runs" }]}>
      steps
    </PageFrame>,
  );
  expect(html).toContain('aria-label="Breadcrumb"');
  expect(html).toContain('href="/runs"');
});

test("the toolbar row is absent when a page has no toolbar", () => {
  const withToolbar = renderToString(
    <PageFrame title="Flows" toolbar={<span>filters</span>}>
      rows
    </PageFrame>,
  );
  const without = renderToString(<PageFrame title="Flows">rows</PageFrame>);
  expect(withToolbar).toContain("filters");
  expect(without).not.toContain("pageToolbar");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/web/src/components/page-frame.test.tsx`
Expected: FAIL — `Cannot find module './page-frame'`.

- [ ] **Step 3: Write the implementation**

```tsx
import { RiArrowRightSLine } from "@remixicon/react";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./page-frame.module.css";

export type Breadcrumb = { label: string; href: string };

/**
 * The shared workspace page shell: a title bar, an optional toolbar, and a
 * scrolling body. Every rule stops at the page gutter, so nothing reaches the
 * edge of the content area.
 */
export function PageFrame({
  title,
  parents = [],
  actions,
  toolbar,
  children,
}: {
  title: string;
  parents?: readonly Breadcrumb[];
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.gutter}>
        <div className={styles.titleBar}>
          {parents.length > 0 && (
            <nav aria-label="Breadcrumb">
              <ol className={styles.crumbs}>
                {parents.map(({ label, href }) => (
                  <li key={href}>
                    <Link href={href} className={styles.crumb}>
                      {label}
                    </Link>
                    <RiArrowRightSLine
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
                    />
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <h1 className={styles.title}>{title}</h1>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      </div>
      {toolbar && (
        <div className={styles.gutter}>
          <div className={styles.toolbar}>{toolbar}</div>
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
```

```css
.frame {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
/* The gutter carries the padding so the rule inside it stops short of the edge. */
.gutter {
  flex: none;
  padding-inline: 24px;
}
.titleBar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  border-bottom: 1px solid var(--border);
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
}
.crumbs li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.crumb {
  color: var(--muted-foreground);
  border-radius: 2px;
}
.crumb:hover {
  color: var(--foreground);
}
.crumb:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 4px;
}
.title {
  min-width: 0;
  font-size: var(--text-section);
  line-height: var(--text-section--line-height);
  font-weight: var(--text-section--font-weight);
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 44px;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 24px 24px;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/web/src/components/page-frame.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Do not delete the old components yet**

`WorkspacePage` and `WorkspaceBreadcrumbs` still have callers. Leave both files in place; Tasks 4, 7 and 8 remove their last usages, and Task 8 deletes the files.

- [ ] **Step 6: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test apps/web/src/components`
Expected: all pass. Leave the change uncommitted.

---

### Task 4: Flow summary gains shape and last run

The mini-graph card needs each flow's graph outline and the list needs its last run. Both are additive contract fields, so the schema, the store, the API response and the client validator move together.

**Files:**

- Modify: `packages/contracts/src/flows.ts`
- Modify: `packages/contracts/src/flows.test.ts`
- Modify: `packages/db/src/flows.ts`
- Modify: `packages/db/src/flow-persistence.integration.test.ts`

**Interfaces:**

- Consumes: `flowNodeTypeSchema`, `flowRunStatusSchema` (from `./flow-runs`).
- Produces: `flowSummarySchema` gains
  - `shape: { nodes: { id: string; type: FlowNodeType }[]; edges: { source: string; target: string }[] }`
  - `lastRun: { status: FlowRunStatus; startedAt: string } | null`

  and `type FlowSummary` follows. `createFlowStore(sql).list(ownerId)` returns the same enriched shape.

- [ ] **Step 1: Write the failing contract test**

Add to `packages/contracts/src/flows.test.ts`:

```ts
test("a summary carries the graph shape and the last run", () => {
  const summary = {
    id: "flow-1",
    name: "Payout",
    description: "",
    updatedAt: "2026-09-09T10:00:00.000Z",
    enabled: true,
    triggerTypes: ["trigger.schedule"],
    nodeCount: 2,
    shape: {
      nodes: [
        { id: "a", type: "trigger.schedule" },
        { id: "b", type: "usdc.payout" },
      ],
      edges: [{ source: "a", target: "b" }],
    },
    lastRun: { status: "succeeded", startedAt: "2026-09-09T09:00:00.000Z" },
  };
  expect(Value.Check(flowSummarySchema, summary)).toBe(true);
  expect(Value.Check(flowSummarySchema, { ...summary, lastRun: null })).toBe(true);
  expect(Value.Check(flowSummarySchema, { ...summary, shape: undefined })).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/contracts/src/flows.test.ts`
Expected: FAIL — the schema rejects the extra keys.

- [ ] **Step 3: Extend the schema**

In `packages/contracts/src/flows.ts`, above `flowSummarySchema`:

```ts
/* A compact outline of the graph: enough for `layoutFlowPositions` to draw a
 * card-sized miniature without shipping every node's config. */
export const flowShapeSchema = Type.Object({
  nodes: Type.Array(Type.Object({ id: Type.String(), type: flowNodeTypeSchema })),
  edges: Type.Array(Type.Object({ source: Type.String(), target: Type.String() })),
});
export type FlowShape = Static<typeof flowShapeSchema>;

export const flowLastRunSchema = Type.Object({
  status: flowRunStatusSchema,
  startedAt: Type.String(),
});
```

Add both fields to `flowSummarySchema`:

```ts
  shape: flowShapeSchema,
  lastRun: Type.Union([flowLastRunSchema, Type.Null()]),
```

Import `flowRunStatusSchema` from `./flow-runs` at the top of the file.

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `bun test packages/contracts/src/flows.test.ts`
Expected: PASS.

- [ ] **Step 5: Widen the store query**

In `packages/db/src/flows.ts`, replace the `list` method's query and mapping:

```ts
    async list(ownerId: string): Promise<FlowSummary[]> {
      const db = connection();
      const rows = await db<
        (Omit<FlowSummary, "updatedAt" | "triggerTypes" | "lastRun"> & {
          updatedAt: Date;
          nodes: { id: string; type: FlowNodeType }[];
          lastRunStatus: FlowRunStatus | null;
          lastRunStartedAt: Date | null;
        })[]
      >`
        SELECT f.id, f.name, f.description, f.updated_at AS "updatedAt", f.enabled,
          jsonb_array_length(f.document->'nodes') AS "nodeCount",
          (SELECT coalesce(jsonb_agg(jsonb_build_object('id', n->>'id', 'type', n->>'type')), '[]'::jsonb)
             FROM jsonb_array_elements(f.document->'nodes') n) AS nodes,
          jsonb_build_object(
            'nodes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', n->>'id', 'type', n->>'type')), '[]'::jsonb)
                        FROM jsonb_array_elements(f.document->'nodes') n),
            'edges', (SELECT coalesce(jsonb_agg(jsonb_build_object('source', e->>'source', 'target', e->>'target')), '[]'::jsonb)
                        FROM jsonb_array_elements(f.document->'edges') e)
          ) AS shape,
          r.status AS "lastRunStatus", r.started_at AS "lastRunStartedAt"
        FROM automator_flows f
        LEFT JOIN LATERAL (
          SELECT status, started_at FROM automator_runs
          WHERE flow_id = f.id ORDER BY started_at DESC LIMIT 1
        ) r ON true
        WHERE f.owner_id = ${ownerId}
        ORDER BY f.updated_at DESC, f.id`;
      return rows.map(({ nodes, lastRunStatus, lastRunStartedAt, ...row }) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
        triggerTypes: documentTriggerTypes(nodes),
        lastRun:
          lastRunStatus && lastRunStartedAt
            ? { status: lastRunStatus, startedAt: lastRunStartedAt.toISOString() }
            : null,
      }));
    },
```

Import `FlowRunStatus` from `@automator/contracts`.

- [ ] **Step 6: Extend the integration test**

Add to `packages/db/src/flow-persistence.integration.test.ts`, inside the existing describe block that already creates a flow:

```ts
test("a listed flow carries its graph shape and its most recent run", async () => {
  const [summary] = await store.list(ownerId);
  expect(summary?.shape.nodes.length).toBe(summary?.nodeCount);
  expect(summary?.lastRun).toBeNull();
});
```

- [ ] **Step 7: Run the tests**

Run: `bun test packages/contracts packages/db/src/flow-persistence.integration.test.ts`
Expected: PASS. The integration test needs a local database — if `DATABASE_URL` is unset it skips; say so in the report rather than claiming it passed.

- [ ] **Step 8: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck`
Expected: all pass. The API route needs no change — Elysia validates against the same schema. Leave uncommitted.

---

### Task 5: Flow mini-graph

A card-sized miniature of the flow's real shape, so no two cards look alike.

**Files:**

- Create: `apps/web/src/flows/flow-miniature.tsx`
- Create: `apps/web/src/flows/flow-miniature.test.tsx`

**Interfaces:**

- Consumes: `FlowShape` from Task 4; `layoutFlowPositions`, `layoutGrid` from `@automator/contracts`.
- Produces: `function FlowMiniature({ shape, className }: { shape: FlowShape; className?: string }): ReactElement`.

- [ ] **Step 1: Write the failing test**

```tsx
/// <reference types="bun" />
import type { FlowShape } from "@automator/contracts";
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { FlowMiniature } from "./flow-miniature";

const shape: FlowShape = {
  nodes: [
    { id: "a", type: "trigger.schedule" },
    { id: "b", type: "logic.condition" },
    { id: "c", type: "usdc.payout" },
  ],
  edges: [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
  ],
};

test("every node becomes a mark and every edge a connector", () => {
  const html = renderToString(<FlowMiniature shape={shape} />);
  expect(html.match(/<rect/g)?.length).toBe(3);
  expect(html.match(/<line/g)?.length).toBe(2);
});

test("an empty flow renders a labelled placeholder rather than an empty box", () => {
  const html = renderToString(<FlowMiniature shape={{ nodes: [], edges: [] }} />);
  expect(html).toContain("Empty flow");
  expect(html).not.toContain("<rect");
});

test("the miniature is described for assistive technology", () => {
  const html = renderToString(<FlowMiniature shape={shape} />);
  expect(html).toContain('role="img"');
  expect(html).toContain("3 nodes");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test apps/web/src/flows/flow-miniature.test.tsx`
Expected: FAIL — `Cannot find module './flow-miniature'`.

- [ ] **Step 3: Write the implementation**

```tsx
import { layoutFlowPositions, layoutGrid, type FlowShape } from "@automator/contracts";

const nodeWidth = 16;
const nodeHeight = 10;
const padding = 8;

/**
 * A card-sized miniature of the flow's real graph. Positions come from the same
 * `layoutFlowPositions` the canvas uses, then scale into the viewBox — so the
 * card and the canvas agree on the flow's shape.
 */
export function FlowMiniature({ shape, className }: { shape: FlowShape; className?: string }) {
  if (shape.nodes.length === 0) {
    return (
      <p className={className} role="img" aria-label="Empty flow">
        Empty flow
      </p>
    );
  }
  const positions = layoutFlowPositions(shape.nodes, shape.edges);
  const points = shape.nodes.map((node) => positions.get(node.id) ?? { x: 0, y: 0 });
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  /* One grid step of headroom keeps a single-column flow from filling the box. */
  const width = maxX - layoutGrid.startX + layoutGrid.columnGap;
  const height = maxY - layoutGrid.startY + layoutGrid.rowGap;
  const place = ({ x, y }: { x: number; y: number }) => ({
    x: ((x - layoutGrid.startX) / width) * (100 - padding * 2) + padding,
    y: ((y - layoutGrid.startY) / height) * (60 - padding * 2) + padding,
  });

  return (
    <svg
      viewBox="0 0 100 60"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={`Flow shape, ${shape.nodes.length} nodes`}
    >
      {shape.edges.map((edge) => {
        const from = positions.get(edge.source);
        const to = positions.get(edge.target);
        if (!from || !to) return null;
        const a = place(from);
        const b = place(to);
        return (
          <line
            key={`${edge.source}-${edge.target}`}
            x1={a.x + nodeWidth / 2}
            y1={a.y + nodeHeight / 2}
            x2={b.x + nodeWidth / 2}
            y2={b.y + nodeHeight / 2}
            stroke="var(--edge)"
            strokeWidth="0.75"
          />
        );
      })}
      {shape.nodes.map((node) => {
        const point = place(positions.get(node.id) ?? { x: 0, y: 0 });
        return (
          <rect
            key={node.id}
            x={point.x}
            y={point.y}
            width={nodeWidth}
            height={nodeHeight}
            rx="2.5"
            fill="var(--muted-foreground)"
            fillOpacity="0.45"
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/web/src/flows/flow-miniature.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck`
Expected: all pass. Leave uncommitted.

---

### Task 6: Flows page

Move Flows onto the page frame, make the miniature card the default view and keep the table as the second view.

**Files:**

- Modify: `apps/web/src/app/(workspace)/flows/flow-browser.tsx`
- Modify: `apps/web/src/app/(workspace)/flows/flows.module.css`
- Create: `apps/web/src/app/(workspace)/flows/flow-browser.test.tsx`
- Modify: `apps/web/e2e/workspace.e2e.ts`
- Delete: `apps/ui-lab/src/app/patterns/flow-list/` and its `lab-shell.tsx` entry

**Interfaces:**

- Consumes: `PageFrame` (Task 3), `FlowMiniature` (Task 5), the widened `FlowSummary` (Task 4).
- Produces: `FlowBrowser` keeps its props — `{ flows, initialView, examples }` — with `initialView` still `"grid" | "table"` and `"grid"` still the default.

- [ ] **Step 1: Write the failing test**

```tsx
/// <reference types="bun" />
import type { FlowSummary } from "@automator/contracts";
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { FlowBrowser } from "./flow-browser";

const flow: FlowSummary = {
  id: "flow-1",
  name: "USDC payout run",
  description: "",
  updatedAt: "2026-09-09T10:00:00.000Z",
  enabled: true,
  triggerTypes: ["trigger.schedule"],
  nodeCount: 2,
  shape: {
    nodes: [
      { id: "a", type: "trigger.schedule" },
      { id: "b", type: "usdc.payout" },
    ],
    edges: [{ source: "a", target: "b" }],
  },
  lastRun: { status: "failed", startedAt: "2026-09-09T09:00:00.000Z" },
};

test("a grid card carries the flow's own miniature, not a shared glyph", () => {
  const html = renderToString(<FlowBrowser flows={[flow]} initialView="grid" />);
  expect(html).toContain('aria-label="Flow shape, 2 nodes"');
});

test("a card states the live state and the last run outcome", () => {
  const html = renderToString(<FlowBrowser flows={[flow]} initialView="grid" />);
  expect(html).toContain("Live");
  expect(html).toContain("Failed");
});

test("the page title renders once, from the frame", () => {
  const html = renderToString(<FlowBrowser flows={[flow]} initialView="grid" />);
  expect(html.match(/<h1/g)?.length).toBe(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test "apps/web/src/app/(workspace)/flows/flow-browser.test.tsx"`
Expected: FAIL — no miniature label in the output.

- [ ] **Step 3: Rework the browser**

In `flow-browser.tsx`:

1. Replace the `WorkspaceBreadcrumbs` + bare `<div>` wrapper with `PageFrame`, passing the search field and the `New flow` action as `actions`, and the state filter plus the view toggle as `toolbar`.
2. Replace the card's `.flowPreview` block with `<FlowMiniature shape={flow.shape} className={styles.miniature} />`.
3. Add a last-run line to both the card and the table row, reading `flow.lastRun`. Render `Never run` when it is `null`, and use `--destructive-text` with an `RiCloseLine` for a failed run, `--muted-foreground` with `RiCheckLine` otherwise. Never colour alone — the icon and the word both carry the state.
4. Delete `sortLabels`-adjacent dead code only if it becomes unused; leave the sort menu working.

In `flows.module.css`, drop `.page` (the frame owns the gutter now), drop `.flowPreview`, and let the grid reflow past three columns:

```css
.grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@container flows (min-width: 900px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@container flows (min-width: 1180px) {
  .grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.miniature {
  display: block;
  width: 100%;
  height: 56px;
}
```

Keep `container: flows / inline-size` by moving it onto the browser's own wrapper inside `PageFrame`'s body.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test "apps/web/src/app/(workspace)/flows"`
Expected: PASS, including the existing `flow-start-options.test.tsx`.

- [ ] **Step 5: Update the e2e expectations**

`apps/web/e2e/workspace.e2e.ts` asserts against the old Flows markup. Run it, read the failures, and update the selectors to the new structure — do not weaken an assertion to make it pass.

Run: `bun run --cwd apps/web e2e -- workspace`
Expected: PASS. Two e2e failures predate this work; if they are still the only failures, report them as pre-existing rather than fixing them here.

- [ ] **Step 6: Remove the superseded draft**

```bash
rm -r apps/ui-lab/src/app/patterns/flow-list
```

Delete its `lab-shell.tsx` entry.

- [ ] **Step 7: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test apps/web`
Expected: all pass. Leave uncommitted.

---

### Task 7: Runs list and side panel

The list keeps its full width and a run opens in a panel over the right-hand side. The panel is generic so Data and Marketplace can reuse it.

**Files:**

- Create: `apps/web/src/components/side-panel.tsx`
- Create: `apps/web/src/components/side-panel.test.tsx`
- Create: `apps/web/src/components/side-panel.module.css`
- Modify: `apps/web/src/app/(workspace)/runs/page.tsx`
- Modify: `apps/web/src/app/(workspace)/runs/run-history.tsx`
- Modify: `apps/web/src/app/(workspace)/runs/[id]/run-detail.tsx`
- Modify: `apps/web/src/app/(workspace)/runs/runs.module.css`
- Delete: `apps/ui-lab/src/app/patterns/runs/` and its `lab-shell.tsx` entry

**Interfaces:**

- Consumes: `PageFrame` (Task 3).
- Produces: `function SidePanel({ title, description, actions, onClose, children }: { title: string; description?: ReactNode; actions?: ReactNode; onClose: () => void; children: ReactNode }): ReactElement`. It renders a `<aside role="complementary">`, traps nothing (the list stays reachable), closes on Escape, and restores focus to the opener.

- [ ] **Step 1: Write the failing test**

```tsx
/// <reference types="bun" />
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { SidePanel } from "./side-panel";

test("the panel is a labelled complementary region with a close control", () => {
  const html = renderToString(
    <SidePanel title="USDC payout run" onClose={() => {}}>
      steps
    </SidePanel>,
  );
  expect(html).toContain('role="complementary"');
  expect(html).toContain('aria-label="USDC payout run"');
  expect(html).toContain('aria-label="Close panel"');
});

test("the description renders beneath the title", () => {
  const html = renderToString(
    <SidePanel title="Run" description="r_8f21 · Schedule" onClose={() => {}}>
      steps
    </SidePanel>,
  );
  expect(html).toContain("r_8f21 · Schedule");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test apps/web/src/components/side-panel.test.tsx`
Expected: FAIL — `Cannot find module './side-panel'`.

- [ ] **Step 3: Write the panel**

```tsx
"use client";

import { Button } from "@automator/ui/button";
import { RiCloseLine } from "@remixicon/react";
import { useEffect, type ReactNode } from "react";
import styles from "./side-panel.module.css";

/**
 * A detail panel beside a list. The list stays interactive behind it, so this
 * is a complementary region rather than a dialog — no focus trap, no overlay.
 */
export function SidePanel({
  title,
  description,
  actions,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside role="complementary" aria-label={title} className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.title}>{title}</p>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions}
        <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
          <RiCloseLine aria-hidden="true" />
        </Button>
      </div>
      <div className={styles.body}>{children}</div>
    </aside>
  );
}
```

```css
.panel {
  display: flex;
  flex-direction: column;
  width: 420px;
  flex: none;
  min-height: 0;
  border-inline-start: 1px solid var(--border);
  background: var(--card);
}
.header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: none;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.heading {
  min-width: 0;
}
.title {
  font-size: var(--text-label);
  line-height: var(--text-label--line-height);
  font-weight: var(--text-label--font-weight);
}
.description {
  font-size: var(--text-caption);
  line-height: var(--text-caption--line-height);
  color: var(--muted-foreground);
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/web/src/components/side-panel.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire Runs to the panel**

Keep `/runs/[id]` as a real route so links stay shareable: the runs page reads the selected run from the route and renders the list plus the panel side by side. Concretely:

1. `runs/page.tsx` renders `PageFrame` with the flow/status filters as `toolbar` and `RunHistory` in the body.
2. Move `runs/[id]/page.tsx`'s data fetch into a layout at `runs/layout.tsx` so the list is not re-rendered when the panel changes, and have `runs/[id]/page.tsx` render `RunDetail` inside `SidePanel`.
3. `SidePanel`'s `onClose` navigates to `runsHref(flowId, status)` with `router.push`, preserving the current filters.
4. `run-history.tsx` marks the selected row with `aria-current="true"`.

Give Runs its own column widths in `runs.module.css` instead of importing `flows.module.css` — the 60 % name column is tuned for two columns, and Runs has five.

- [ ] **Step 6: Check it by hand**

With the app running: open `/runs`, click a run, confirm the URL becomes `/runs/<id>`, the list stays readable, Escape closes the panel and returns to `/runs` with filters intact, and focus lands back on the row that opened it.

- [ ] **Step 7: Run the Runs tests**

Run: `bun test "apps/web/src/app/(workspace)/runs"`
Expected: PASS — `run-history.test.tsx`, `run-labels.test.ts`, `page.test.tsx` and `[id]/run-detail.test.tsx`. Update assertions that describe the old full-page detail; do not delete a test to make it pass.

- [ ] **Step 8: Remove the superseded draft**

```bash
rm -r apps/ui-lab/src/app/patterns/runs
```

Delete its `lab-shell.tsx` entry.

- [ ] **Step 9: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test apps/web`
Expected: all pass. Leave uncommitted.

---

### Task 8: Move the remaining pages onto the frame

Data, Marketplace and Wallet still call `WorkspacePage` and `WorkspaceBreadcrumbs`. Once they move, both old components can go.

**Files:**

- Modify: `apps/web/src/app/(workspace)/data/page.tsx`, `data/[tableId]/page.tsx`, `data/data-browser.tsx`, `data/[tableId]/record-browser.tsx`
- Modify: `apps/web/src/app/(workspace)/marketplace/page.tsx`, `marketplace/[slug]/page.tsx`, `marketplace/marketplace-browser.tsx`
- Modify: `apps/web/src/app/(workspace)/wallet/page.tsx`
- Modify: `apps/web/src/app/(workspace)/runs/[id]/page.tsx` if it still references the old components
- Delete: `apps/web/src/components/workspace-page.tsx`, `apps/web/src/components/workspace-breadcrumbs.tsx`

**Interfaces:**

- Consumes: `PageFrame`, `Breadcrumb` (Task 3).
- Produces: no new exports. After this task nothing imports `WorkspacePage` or `WorkspaceBreadcrumbs`.

- [ ] **Step 1: Find every caller**

Run: `grep -rn "WorkspacePage\|WorkspaceBreadcrumbs" apps/web/src`
Record the list; each one is a conversion.

- [ ] **Step 2: Convert each page**

For every caller, replace

```tsx
<WorkspacePage>
  <WorkspaceBreadcrumbs parents={[{ label: "Data", href: "/data" }]} current={table.name} />
  {content}
</WorkspacePage>
```

with

```tsx
<PageFrame title={table.name} parents={[{ label: "Data", href: "/data" }]} actions={actions}>
  {content}
</PageFrame>
```

Move each page's primary button and search field into `actions`, and its filters or view toggles into `toolbar`. Delete the per-page `.page` wrapper rules from `data`, `marketplace` and `wallet` CSS modules — the frame owns the gutter.

- [ ] **Step 3: Delete the old components**

```bash
rm apps/web/src/components/workspace-page.tsx apps/web/src/components/workspace-breadcrumbs.tsx
```

Run: `grep -rn "workspace-page\|workspace-breadcrumbs" apps/web/src`
Expected: no matches.

- [ ] **Step 4: Run the affected tests**

Run: `bun test apps/web`
Expected: PASS. Update the assertions that describe the old wrappers.

- [ ] **Step 5: Update the e2e suites**

Run: `bun run --cwd apps/web e2e`
Expected: the two known pre-existing failures and nothing else. Update `data.e2e.ts`, `demo-path.e2e.ts` and `responsive-canvas.e2e.ts` selectors where the markup moved.

- [ ] **Step 6: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun run build`
Expected: all pass. Leave uncommitted.

---

### Task 9: Chart palette and marks

Before Home ships a chart, the vendored pack has to speak our tokens and follow the mark specs. Doing it here keeps Task 10 about layout.

**Files:**

- Modify: `packages/ui/src/dither-kit/palette.ts`
- Modify: `packages/ui/src/dither-kit/bar-canvas.tsx`
- Create: `packages/ui/src/dither-kit/palette.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `PALETTE` keeps its `Record<DitherColor, Seed>` shape and its keys, so no call site changes; only the RGB values move. `barSlot` consumers are untouched.

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="bun" />
import { expect, test } from "bun:test";
import { PALETTE } from "./palette";

test("the seeds are the token palette, not the upstream defaults", () => {
  /* green-300 oklch(0.79 0.195 150) — the same hue --success resolves to. */
  expect(PALETTE.green.fill).toEqual([46, 204, 113]);
  expect(PALETTE.red.fill).toEqual([232, 76, 61]);
});

test("every seed keeps a fill, a line and a star", () => {
  for (const seed of Object.values(PALETTE)) {
    expect(seed.fill).toHaveLength(3);
    expect(seed.line).toHaveLength(3);
    expect(seed.star).toHaveLength(3);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/ui/src/dither-kit/palette.test.ts`
Expected: FAIL — the seeds still hold the upstream values.

- [ ] **Step 3: Re-seed the palette**

Convert each token to sRGB and replace the seed values. Compute them rather than guessing:

```bash
bun -e 'const c=["oklch(0.79 0.195 150)","oklch(0.55 0.2 25)","oklch(0.79 0.147 223.092)"];console.log(c)'
```

Use a colour tool or the `oklch-skill` to convert `--green-300`, `--red-300`, `--blue-300`, `--amber-300` and `--neutral-500` to `[r, g, b]`, then write them into `PALETTE`. Keep `line` one step lighter than `fill` and `star` lighter still, as upstream does. Record the exact source token for each seed in a comment.

- [ ] **Step 4: Cap the bar width and gap the stack**

In `bar-canvas.tsx`, the painter walks `slot.x` to `slot.x + slot.width`. Cap the painted width and inset the top of each stacked segment:

```ts
const slot = s.barSlot(i, si, keys.length);
/* Mark spec: bars stay <= 24px and never fill their slot; the
 * leftover band is air. Stacked segments are separated by a 2px
 * surface gap rather than a stroke. */
const painted = Math.min(slot.width, 24);
const inset = (slot.width - painted) / 2;
const c0 = Math.round((slot.x + inset) * fx);
const c1 = Math.round((slot.x + inset + painted) * fx);
const gapped = stacked && si > 0 ? bottom - 2 : bottom;
```

and pass `gapped` where `bottom` was passed to `paintColumn`.

- [ ] **Step 5: Run the tests and look at the result**

Run: `bun test packages/ui && bun run --cwd packages/ui lint && bun run --cwd packages/ui typecheck`
Expected: PASS.

Then open `http://localhost:3003/patterns/home` in both light and dark and confirm the bars are capped, the stack shows a visible gap, and the colours match `--success` / `--destructive`. Screenshot both themes and report what you saw — the tests do not check appearance.

- [ ] **Step 6: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck`
Expected: all pass. Leave uncommitted.

---

### Task 10: Home dashboard data

Home needs daily run counts. This is the only new API surface in the plan.

**Files:**

- Create: `packages/contracts/src/home.ts`
- Create: `packages/contracts/src/home.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/home.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/api/src/home/routes.ts`
- Create: `apps/api/src/home/routes.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/web/src/flows/server.ts`

**Interfaces:**

- Consumes: `flowRunStatusSchema`.
- Produces:
  - `homeSummarySchema` / `type HomeSummary = { days: { date: string; succeeded: number; failed: number }[]; runsToday: number; failedToday: number; successRate: number; liveFlows: number }`
  - `homeSummaryContract = { path: "/home/summary", method: "GET" }`
  - `createHomeStore(sql).summary(ownerId, days: number): Promise<HomeSummary>`
  - `getHomeSummary(): Promise<HomeSummary>` in `apps/web/src/flows/server.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
/// <reference types="bun" />
import { Value } from "@sinclair/typebox/value";
import { expect, test } from "bun:test";
import { homeSummarySchema } from "./home";

test("a summary is a dated series plus today's counters", () => {
  const summary = {
    days: [{ date: "2026-09-09", succeeded: 36, failed: 2 }],
    runsToday: 38,
    failedToday: 2,
    successRate: 0.94,
    liveFlows: 4,
  };
  expect(Value.Check(homeSummarySchema, summary)).toBe(true);
  expect(Value.Check(homeSummarySchema, { ...summary, successRate: 1.4 })).toBe(false);
  expect(Value.Check(homeSummarySchema, { ...summary, runsToday: -1 })).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/contracts/src/home.test.ts`
Expected: FAIL — `Cannot find module './home'`.

- [ ] **Step 3: Write the contract**

```ts
import { Type, type Static } from "@sinclair/typebox";

const count = Type.Integer({ minimum: 0 });

export const homeDaySchema = Type.Object({
  date: Type.String({ format: "date" }),
  succeeded: count,
  failed: count,
});

export const homeSummarySchema = Type.Object({
  days: Type.Array(homeDaySchema),
  runsToday: count,
  failedToday: count,
  successRate: Type.Number({ minimum: 0, maximum: 1 }),
  liveFlows: count,
});
export type HomeSummary = Static<typeof homeSummarySchema>;

export const homeSummaryContract = { path: "/home/summary", method: "GET" } as const;
```

Export it from `packages/contracts/src/index.ts` next to the other modules.

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `bun test packages/contracts/src/home.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the store**

`packages/db/src/home.ts`, following the shape of `createFlowStore`:

```ts
    async summary(ownerId: string, days: number): Promise<HomeSummary> {
      const db = connection();
      const rows = await db<{ date: string; succeeded: number; failed: number }[]>`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
          count(*) FILTER (WHERE r.status = 'succeeded')::int AS succeeded,
          count(*) FILTER (WHERE r.status = 'failed')::int AS failed
        FROM generate_series(
          date_trunc('day', now()) - make_interval(days => ${days - 1}),
          date_trunc('day', now()),
          '1 day'
        ) AS d(day)
        LEFT JOIN automator_runs r
          ON r.owner_id = ${ownerId} AND date_trunc('day', r.started_at) = d.day
        GROUP BY d.day ORDER BY d.day`;
      const [live] = await db<{ liveFlows: number }[]>`
        SELECT count(*)::int AS "liveFlows" FROM automator_flows
        WHERE owner_id = ${ownerId} AND enabled`;
      const today = rows.at(-1) ?? { date: "", succeeded: 0, failed: 0 };
      const runsToday = today.succeeded + today.failed;
      const total = rows.reduce((sum, day) => sum + day.succeeded + day.failed, 0);
      const succeeded = rows.reduce((sum, day) => sum + day.succeeded, 0);
      return {
        days: rows,
        runsToday,
        failedToday: today.failed,
        /* An owner with no runs has no rate to report; 1 reads better than NaN. */
        successRate: total === 0 ? 1 : succeeded / total,
        liveFlows: live?.liveFlows ?? 0,
      };
    },
```

- [ ] **Step 6: Write the API route and its test**

`apps/api/src/home/routes.ts` mirrors `apps/api/src/account/routes.ts`: one authenticated `GET` handler returning `home.summary(claims.id, 14)`, with `response: homeSummarySchema`. Register it in `apps/api/src/index.ts` alongside the account routes. In `apps/api/src/home/routes.test.ts`, follow `account/routes.test.ts`: assert a 401 without a bearer token and a schema-valid body with one.

Run: `bun test apps/api/src/home/routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the web-side reader**

In `apps/web/src/flows/server.ts`, add `getHomeSummary()` next to `listRuns`, going through `@automator/api-client/server` so the response is validated against `homeSummarySchema`.

- [ ] **Step 8: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test packages/contracts packages/db apps/api`
Expected: all pass. Leave uncommitted.

---

### Task 11: Home page

The prompt-first entry page over the dashboard, in the X layout: a full-width chart, then stat tiles on the left and recent runs on the right.

**Files:**

- Modify: `apps/web/src/app/(workspace)/page.tsx`
- Create: `apps/web/src/app/(workspace)/home/flow-prompt.tsx`
- Create: `apps/web/src/app/(workspace)/home/flow-prompt.test.tsx`
- Create: `apps/web/src/app/(workspace)/home/runs-chart.tsx`
- Create: `apps/web/src/app/(workspace)/home/home.module.css`
- Delete: `apps/ui-lab/src/app/patterns/home/`, `apps/ui-lab/src/app/patterns/nav-model.tsx`, `apps/ui-lab/src/app/patterns/workspace-sidebar.tsx` and their `lab-shell.tsx` entries

**Interfaces:**

- Consumes: `PageFrame` (Task 3), `getHomeSummary` (Task 10), `BarChart`/`Bar`/`Grid`/`XAxis`/`YAxis`/`Legend` from `@automator/ui/dither-chart` (Task 9).
- Produces: `FlowPrompt` — a client component whose submit calls the existing AI draft endpoint at `apps/web/src/app/api/ai/flows` and navigates to the created flow's canvas.

- [ ] **Step 1: Write the failing test**

```tsx
/// <reference types="bun" />
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { FlowPrompt } from "./flow-prompt";

test("the prompt is a labelled textarea with a submit control", () => {
  const html = renderToString(<FlowPrompt />);
  expect(html).toContain("<textarea");
  expect(html).toContain('aria-label="Describe a flow"');
  expect(html).toContain('aria-label="Draft this flow"');
});

test("the example prompts are buttons, so they are reachable by keyboard", () => {
  const html = renderToString(<FlowPrompt />);
  expect(html.match(/type="button"/g)?.length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test "apps/web/src/app/(workspace)/home/flow-prompt.test.tsx"`
Expected: FAIL — `Cannot find module './flow-prompt'`.

- [ ] **Step 3: Build the prompt**

A centred column capped at 640 px: a heading, `Textarea` from `@automator/ui/textarea`, the model name and a `Button size="icon-sm"` submit inside the field, and example prompts as buttons that fill the textarea. Submitting posts to the AI draft route the builder already uses and routes to `/flows/<id>`. Reuse the wiring in `apps/web/src/builder/ai-panel.tsx` rather than inventing a second client.

Ask Arda before settling the heading copy, the example prompts and the vertical rhythm — the spec deliberately leaves the look open.

- [ ] **Step 4: Build the chart and the page**

`runs-chart.tsx` renders the Task 10 series:

```tsx
<BarChart data={summary.days} config={runsConfig} stackType="stacked" className="h-40">
  <Legend />
  <Grid strokeDasharray="0" />
  <XAxis dataKey="date" maxTicks={7} />
  <YAxis />
  <Bar dataKey="succeeded" />
  <Bar dataKey="failed" />
</BarChart>
```

with

```tsx
const runsConfig: ChartConfig = {
  succeeded: { label: "Succeeded", color: "green" },
  failed: { label: "Failed", color: "red" },
};
```

`page.tsx` becomes a server component: fetch `getHomeSummary()` and `listRuns({ limit: 5 })` in parallel, render `PageFrame title="Home"`, then `FlowPrompt`, the chart, and a two-column row — stat tiles (`Runs today`, `Success rate`, `Failed today`, `Live flows`) on the left, recent runs on the right. There is no "Spent today" tile; nothing tracks cost yet.

- [ ] **Step 5: Run the tests**

Run: `bun test "apps/web/src/app/(workspace)/home"`
Expected: PASS, 2 tests.

- [ ] **Step 6: Check it in the browser**

Open `/` in light and dark. Confirm the chart reads correctly in both, the legend names both series, an owner with no runs shows an honest empty state rather than a flat chart, and the page does not scroll horizontally at 1280 px.

- [ ] **Step 7: Remove the superseded drafts**

```bash
rm -r apps/ui-lab/src/app/patterns
```

Delete the remaining `patterns/*` entries from `apps/ui-lab/src/components/lab-shell.tsx`.

- [ ] **Step 8: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test`
Expected: all pass. Leave uncommitted.

---

### Task 12: Connections page

Secrets and connected apps move out of the settings dialog onto their own page. No new API — `apps/web/src/app/api/secrets` and `connected-apps.ts` already cover it.

**Files:**

- Create: `apps/web/src/app/(workspace)/connections/page.tsx`
- Create: `apps/web/src/app/(workspace)/connections/connections-browser.tsx`
- Create: `apps/web/src/app/(workspace)/connections/connections-browser.test.tsx`
- Modify: `apps/web/src/components/settings-dialog.tsx`
- Modify: `apps/web/src/components/settings-dialog.test.tsx`

**Interfaces:**

- Consumes: `PageFrame` (Task 3); the existing secrets client and `connectedApps` from `apps/web/src/components/connected-apps.ts`.
- Produces: `ConnectionsBrowser` — `{ secrets: readonly SecretSummary[] }`, rendering a secrets section and a connected-apps section.

- [ ] **Step 1: Write the failing test**

```tsx
/// <reference types="bun" />
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { ConnectionsBrowser } from "./connections-browser";

test("both sections render, each with its own heading", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} />);
  expect(html).toContain("Secrets");
  expect(html).toContain("Connected apps");
});

test("an empty secrets list explains what a secret is for", () => {
  const html = renderToString(<ConnectionsBrowser secrets={[]} />);
  expect(html).toContain("No secrets yet");
});

test("a secret's value is never rendered, only its name", () => {
  const html = renderToString(
    <ConnectionsBrowser
      secrets={[{ name: "TELEGRAM_TOKEN", updatedAt: "2026-09-09T10:00:00.000Z" }]}
    />,
  );
  expect(html).toContain("TELEGRAM_TOKEN");
  expect(html).not.toContain("value");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test "apps/web/src/app/(workspace)/connections/connections-browser.test.tsx"`
Expected: FAIL — `Cannot find module './connections-browser'`.

- [ ] **Step 3: Move the sections**

Lift the secrets section and the connected-apps section out of `settings-dialog.tsx` into `connections-browser.tsx` unchanged in behaviour, then render them inside `PageFrame title="Connections"`. The dialog keeps profile, theme and anything else that is genuinely a setting, and gains a link to `/connections` where the moved sections were.

Redaction must survive the move: secret values are never sent to the client today and must not start being sent now.

- [ ] **Step 4: Run the tests**

Run: `bun test "apps/web/src/app/(workspace)/connections" apps/web/src/components/settings-dialog.test.tsx`
Expected: PASS. Update the dialog test to assert the sections moved out rather than deleting its coverage.

- [ ] **Step 5: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test && bun run build`
Expected: all pass. Leave uncommitted.

---

### Task 13: Documentation

`docs/web-ui.md` describes the interface that this plan replaced.

**Files:**

- Modify: `docs/web-ui.md`

**Interfaces:**

- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Rewrite the affected sections**

Update "Shell and navigation" (208/52 px, three bands, `/` is Home), replace the page-shell paragraph with `PageFrame`, and rewrite "Flows", "Runs" and the new "Home" and "Connections" sections to describe what now exists. Keep the mobile note — narrow viewports are still out of scope. Describe implemented behaviour only.

- [ ] **Step 2: Check the doc against the code**

Re-read each claim beside the file it describes. Anything you cannot point at gets deleted rather than softened.

- [ ] **Step 3: Verify and hold**

Run: `bun run format:check`
Expected: pass. Leave uncommitted, and tell Arda the plan is done and what remains unverified.

---

### Task 14: Record queries gain filters, sort and search

`packages/db`'s `find` already filters with every operator and sorts, tested
operator by operator; the list endpoint never offered it. This task opens that
door and adds the one branch `find` lacks: a search across a table's text
columns.

**Files:**

- Modify: `packages/contracts/src/data-tables.ts`
- Modify: `packages/contracts/src/data-tables.test.ts`
- Modify: `packages/db/src/data-records.ts`
- Modify: `packages/db/src/data.integration.test.ts`

**Interfaces:**

- Produces: `parseDataRecordFilters(value)` → `DataFilterRow[] | null` (null on
  malformed JSON, an unknown operator, or an operator the column type forbids)
  and `parseDataRecordSort(value)` → `{ column, direction } | null`, beside the
  existing `parseDataRecordListLimit`.
- Produces: `dataRecordListQuerySchema` gains optional `filters`, `sort` and `q`;
  `dataRecordListSchema` gains optional `truncated`.
- Produces: `DataRecordQuery` gains `search?: { columns: readonly string[]; text: string }`.

- [ ] **Step 1: Write the failing contract tests**

In `data-tables.test.ts`: `parseDataRecordFilters` accepts a well-formed array,
rejects malformed JSON, rejects an unknown operator, and rejects `contains` on a
`checkbox` column (`isDataFilterOperatorAllowed` already encodes that rule).
`parseDataRecordSort` accepts `name:asc` and `name:desc`, rejects `name:sideways`
and a bare `name`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test packages/contracts/src/data-tables.test.ts`
Expected: FAIL — the parsers do not exist.

- [ ] **Step 3: Write the parsers and widen the schemas**

Follow `parseDataRecordListLimit`'s shape: `undefined` in means `undefined` out,
a malformed value means `null`, so the route answers 400 rather than guessing.
`filters` is a JSON array of `{ column, operator, value? }`; `sort` is
`<column>:asc|desc`; `q` is a plain string, trimmed, capped at 200 characters.

- [ ] **Step 4: Run the contract tests to verify they pass**

Run: `bun test packages/contracts/src/data-tables.test.ts`

- [ ] **Step 5: Add the search branch to the store**

`find` ANDs its filters; search is an OR over the columns the caller names:

```ts
const search = query.search;
const searching =
  !search || search.columns.length === 0
    ? db``
    : db`AND (${search.columns
        .map((column) => db`r."values"->>${column} ILIKE ${`%${escapeLike(search.text)}%`}`)
        .reduce((left, right) => db`${left} OR ${right}`)})`;
```

Escape `%`, `_` and the escape character itself before interpolating, so a search
for `50%` does not become a wildcard. Fetch `limit + 1` rows and return
`{ records, truncated }` rather than a bare array, so the caller reports the cap
from knowledge instead of inferring it from a full page. Update the one existing
caller — the `data.findRecords` executor — to read `.records`.

- [ ] **Step 6: Extend the integration test**

Beside the existing operator sweep, assert that a search matches across two text
columns, that it is case-insensitive, that `%` is matched literally, and that
`truncated` is true only when more rows exist than the limit.

- [ ] **Step 7: Run the tests**

Run: `bun test packages/contracts packages/db`
Expected: PASS. The integration tests skip without `DATABASE_URL`; run them
against the local test database before moving on and say so.

- [ ] **Step 8: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck`

---

### Task 15: The records endpoint serves the query

**Files:**

- Modify: `apps/api/src/data/routes.ts`
- Modify: `apps/api/src/data/routes.test.ts`

**Interfaces:**

- Consumes: the Task 14 parsers and `DataRecordQuery`.
- Produces: `GET /data/tables/:id/records` honouring `filters`, `sort` and `q`.

- [ ] **Step 1: Write the failing route tests**

A filtered request returns only matching records; an unknown column in a filter
answers 400; a filter whose operator its column type forbids answers 400; `q`
matches across text columns; a filtered response carries no `cursor` and sets
`truncated` when the cap is hit; an unfiltered request still pages by cursor.

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Wire the route**

Parse the three parameters; `null` from any parser answers 400 `invalid_query`.
Validate every named column against the table's own columns — a filter naming a
column the table does not have is a 400, not an empty result. With no filter, no
sort and no search, keep today's cursor path untouched. Otherwise call `find`
with the table's text, address and select column ids as the search columns.

- [ ] **Step 4: Run the tests**

Run: `bun test apps/api/src/data`

- [ ] **Step 5: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck`

---

### Task 16: The Data section's shell — rail and gallery

**Files:**

- Create: `apps/web/src/app/(workspace)/data/layout.tsx`
- Create: `apps/web/src/app/(workspace)/data/data.module.css`
- Create: `apps/web/src/app/(workspace)/data/table-rail.tsx`
- Create: `apps/web/src/app/(workspace)/data/table-rail.test.tsx`
- Create: `apps/web/src/app/(workspace)/data/@panel/default.tsx`
- Modify: `apps/web/src/app/(workspace)/data/page.tsx`
- Modify: `apps/web/src/app/(workspace)/data/data-browser.tsx`
- Modify: `apps/web/src/app/(workspace)/data/data-browser.test.tsx`

**Interfaces:**

- Consumes: `PageFrame`, `listDataTables`, the sidebar's cookie idiom.
- Produces: `TableRail` — `{ tables, activeId?, collapsed }`; `DataBrowser`
  becomes the card gallery.

- [ ] **Step 1: Write the failing tests**

`TableRail` renders one link per table with its record count, marks the active
one with `aria-current="page"`, and still renders `New table` with no tables.
`DataBrowser` renders each table's first four column names and their types, its
record count and its description, and keeps today's empty state.

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Build the layout, the rail and the gallery**

`layout.tsx` mirrors `runs/layout.tsx`: read the tables once, render
`<TableRail>` beside `{children}` and `{panel}`. The rail is 200 px on `--card`
with its head on the title bar's line, 30 px rows, `+ New table` at the foot, and
a collapse control whose state rides the same cookie idiom as the sidebar.
Collapsing does not remove the navigation — Task 17's title bar shows the table
menu instead — and below 900 px the rail collapses on its own.

The gallery keeps `PageFrame title="Data"` with the search and `New table` in the
title bar, and swaps the current row table for cards that lead with the schema
strip. `apps/ui-lab/src/app/patterns/data/page.tsx` holds the drawn version.

- [ ] **Step 4: Run the tests**

Run: `bun test "apps/web/src/app/(workspace)/data"`

- [ ] **Step 5: Check it in the browser**

`/data` in both themes, rail open and collapsed, and with one table and none.

- [ ] **Step 6: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck`

---

### Task 17: The record grid

**Files:**

- Create: `apps/web/src/app/(workspace)/data/[tableId]/record-grid.tsx`
- Create: `apps/web/src/app/(workspace)/data/[tableId]/record-grid.test.tsx`
- Create: `apps/web/src/app/(workspace)/data/[tableId]/record-query.ts`
- Create: `apps/web/src/app/(workspace)/data/[tableId]/record-query.test.ts`
- Modify: `apps/web/src/app/(workspace)/data/[tableId]/page.tsx`
- Modify: `apps/web/src/app/(workspace)/data/[tableId]/record-browser.tsx`
- Modify: `apps/web/src/data/server.ts`

**Interfaces:**

- Consumes: `RecordCell`, `LocalTime`, the Task 15 query.
- Produces: `recordsHref(tableId, query)` and its parser, so the toolbar's state
  lives in the URL and the server renders it.

- [ ] **Step 1: Write the failing tests**

`record-query` round-trips a filter, a sort and a search through the URL and
drops empty parts. The grid renders a column header per column carrying its type,
draws a `select` as a chip, an `address` shortened, a `number` right-aligned, and
gives every row an expand control linking to the record.

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Build the grid**

Header cells carry the type icon; a row-number gutter reveals the expand control
on hover and focus; the last row is `+ New record`; the header is sticky within
the content region. Cell editing stays `RecordCell`, untouched.

The toolbar carries `Filter`, `Sort` and the record search, each writing to the
URL. Unfiltered, keep the existing cursor pager. Filtered or sorted, show the
`find` results and, when `truncated`, say "Showing the first 100 matches" — never
imply the table holds only what is on screen.

- [ ] **Step 4: Run the tests**

Run: `bun test "apps/web/src/app/(workspace)/data"`

- [ ] **Step 5: Check it in the browser**

Filter, sort and search against the local test database; confirm the truncation
note appears only when it is true, and that the grid does not scroll the page
horizontally at 1280 px with the rail open.

- [ ] **Step 6: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck`

---

### Task 18: The record panel

**Files:**

- Create: `apps/web/src/app/(workspace)/data/@panel/[tableId]/[recordId]/page.tsx`
- Create: `apps/web/src/app/(workspace)/data/record-panel.tsx`
- Create: `apps/web/src/app/(workspace)/data/record-panel.test.tsx`
- Modify: `apps/web/src/data/server.ts`
- Delete: `apps/web/src/app/(workspace)/data/[tableId]/record-dialog.tsx` and its test
- Delete: `apps/ui-lab/src/app/patterns/data/page.tsx` and its `lab-shell.tsx` entry
- Modify: `docs/web-ui.md`

**Interfaces:**

- Consumes: `SidePanel`, the record PATCH client, `validateRecordValues`.
- Produces: `RecordPanel` — `{ table, record }`, where an absent record is the
  create state at `/data/<table>/new`.

- [ ] **Step 1: Write the failing tests**

Every column renders as a labelled field carrying its type; the panel's heading
is the record's label; the create state's heading says so and its save control
reads `Add record`; a `select` column renders its options.

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Build the panel and retire the dialog**

Reuse the dialog's field rendering and validation rather than writing a second
copy, then delete the dialog. Saving carries `expectedUpdatedAt`, and a 409
conflict tells the reader the record changed elsewhere and offers to reload —
the same rule `RecordCell` already follows. Delete lives in the panel's menu and
keeps its confirmation.

- [ ] **Step 4: Run the tests**

Run: `bun test "apps/web/src/app/(workspace)/data"`

- [ ] **Step 5: Check it in the browser**

Open a record, edit a field, close with Escape, and confirm Back closes the panel
rather than leaving the section.

- [ ] **Step 6: Update the documentation**

Describe the Data section in `docs/web-ui.md` as it now is. Implemented
behaviour only.

- [ ] **Step 7: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test && bun run build`
Expected: all pass. Leave uncommitted.

---

## Self-review

**Spec coverage.** Data → Tasks 14-18. Shell → Task 2. Information architecture → Tasks 1, 2, 12 (Contracts is explicitly out of scope and named as its own plan). Page frame → Tasks 3, 6, 7, 8. Flows → Tasks 4, 5, 6. Runs → Task 7. Home → Tasks 9, 10, 11. Charts → Task 9. Connections → Task 12. Deferred features → not implemented, as specified. Documentation → Task 13.

**Known gaps, stated rather than hidden.** "Spent today" is dropped because no cost tracking exists. The Contracts page is a separate plan, so the sidebar ships with seven entries, not eight. Two `apps/web` e2e failures predate this work and are expected to remain.

**Type consistency.** `FlowShape` is defined in Task 4 and consumed by name in Tasks 5 and 6. `PageFrame`'s props are fixed in Task 3 and used unchanged in 6, 7, 8, 11 and 12. `SidePanel`'s props are fixed in Task 7. `HomeSummary` is defined in Task 10 and consumed in Task 11. `NavPage` is defined in Task 1 and consumed in Task 2.
