# AI Chat Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** complete on branch `feat/ai-chat`, 2026-09-11; every task below is done and the live-check results are kept under Task 15.

**Goal:** Replace the builder's AI panel with a streaming, tool-calling canvas agent whose conversation is stored per flow, rendered with Streamdown, and previewed live on the canvas.

**Architecture:** The API gains four `/flows/:id/ai/messages` routes; the `POST` one runs a canvas agent (a `LanguageModel` tool loop over a working copy of the flow, each tool validated as it lands) and streams typed events as SSE, persisting the turn as message `parts`. The web app replaces `builder/ai-*` with a `builder/ai/` folder: an SSE transport, a zustand chat store whose reducer applies events, a panel built from `@automator/ui` and Streamdown, and a `preview` field on the builder store that the canvas draws read-only while a draft streams. Home hands its prompt to the builder, which sends it as the first message.

**Tech Stack:** Bun, Elysia 1.4, TypeBox contracts, Bun SQL migrations, Next 16 / React 19, zustand 5, React Flow 12, `streamdown` 2.6 + `@streamdown/code` 1.1, Tailwind v4, bun:test + happy-dom, Playwright.

**Spec:** `docs/plans/2026-09-11-ai-chat-redesign.md`

## Global Constraints

- Work on branch `feat/ai-chat` in worktree `/Users/ardasari/Documents/GitHub/Automator-ai`. Run every command from that root.
- Keep work uncommitted until Arda asks; the commit steps below are "ready to commit" checkpoints: show the staged files and the message, and wait for approval (repo rule, `.agents/skills/committing/SKILL.md`).
- Icons: Remix Icons only (`@remixicon/react`), line variants.
- UI primitives from `@automator/ui/<subpath>`; new styles in `apps/web/src/builder/ai/panel.module.css`; never add rules to `flow-builder.module.css` for `.sidePanel`, `.rail` or `.panelHeader`.
- The model never receives a credential: blank secrets with `redactFlowSecrets` in the browser and again in the route; restore with `restoreFlowSecrets` on apply.
- Nothing lands on the canvas until the user applies a proposal.
- Files owned by the node-settings session (`left-panel.tsx`, `node-palette`, `node-settings`, `flow-outline`, `flow-history`, `variables-panel`, `components/schema-form`) are not edited except the one-line `left-panel.tsx` change in Task 14, announced to session `automator-01` when made.
- Run `bun run lint`, `bun run typecheck`, `bun run test` from the worktree root before every checkpoint. `bun run test` skips db integration tests; run those with `TEST_DATABASE_URL="postgres://localhost:5432/automator_test" bun test packages/db` when the schema changes.
- English everywhere in code, comments, docs and messages.

---

## File map

**Contracts** (`packages/contracts/src/ai.ts`, rewritten): message, part, context, stream event schemas; the four contracts; the redaction helpers kept as they are.

**DB** (`packages/db`): `src/migrations.ts` (+ `0020_flow_ai_messages`), `src/ai-messages.ts` (new store), `src/index.ts` (wire + export), `src/ai-messages.integration.test.ts`.

**API** (`apps/api/src/ai/`):

- `draft.ts` — what survives from `generate-flow.ts`: `generatableNodeTypes`, `FlowGenerationError`, `AiDataTable`, `describeDataTables`, `describeNodeTypes`, `materialize`, `withoutPositions`, the `Draft*` types. `generate-flow.ts` and `explain-run.ts` are deleted.
- `prompt.ts` — the tool-oriented system prompt and the user-turn builder.
- `working-copy.ts` — the mutable working copy and its per-call validation.
- `tools.ts` — tool definitions for the model.
- `canvas-agent.ts` — the loop, end-of-turn checks, event emission.
- `sse.ts` — event encoding.
- `routes.ts` — rewritten for the four routes.
- `config.ts` / `index.ts` — `AI_SCRIPTED_MODEL`.

**flow-engine**: `src/language-model.ts` (`onText` on `ChatRequest`), `apps/api/src/ai/client.ts` (streamed completions when `onText` is set).

**Web** (`apps/web/src/builder/ai/`, new): `transport.ts`, `sse.ts`, `chat-store.ts`, `chat-store-provider.tsx`, `apply-event.ts`, `diff.ts`, `use-send-message.ts`, `use-ask-ai.ts`, `panel.tsx`, `message.tsx`, `steps.tsx`, `proposal-card.tsx`, `composer.tsx`, `context-strip.tsx`, `markdown.tsx`, `ask-ai-button.tsx`, `panel.module.css`, and tests beside them. Deleted: `builder/ai-panel.tsx`, `ai-panel.module.css`, `ai-panel.test.ts(x)`, `ai-store.ts`, `ai-store.test.ts`, `ai-store-provider.tsx`, `ai-client.ts`, `use-explain-run.ts`.

**Web, touched**: `builder/store.ts` (+ `preview`), `builder/flow-canvas.tsx`, `builder/flow-node.tsx`, `builder/flow-builder.module.css` (only new `.node[data-draft]` and `.edgeDraft*` rules), `builder/right-panels.tsx`, `builder/flow-builder.tsx`, `builder/run-panel.tsx`, `builder/left-panel.tsx` (one line), `home/prompt.tsx`, `home/prompt.test.tsx`, `app/globals.css`, `apps/web/package.json`.

---

### Task 1: Contracts for messages, events and the four routes

**Files:**

- Modify: `packages/contracts/src/ai.ts` (replace everything above `redactedValue`; keep the redaction helpers and `aiErrorDetail`)
- Modify: `packages/contracts/src/ai.test.ts` (drop tests for removed schemas, add the ones below)
- Modify: `packages/contracts/src/index.ts` only if `ai.ts` is re-exported by name (check with `grep -n "ai" packages/contracts/src/index.ts`; a `export * from "./ai"` needs nothing)

**Interfaces:**

- Produces: `AiContext`, `AiPart`, `AiMessage`, `AiStreamEvent`, `AiProposalState`, `SendAiMessageRequest`, `aiStreamEventSchema`, `aiMessageSchema`, `listAiMessagesContract`, `sendAiMessageContract`, `setAiProposalStateContract`, `clearAiMessagesContract`, `aiVerificationSchema` / `AiVerification` (kept), `aiFlowTestSchema` / `AiFlowTest` (kept), `aiFlowExpectationSchema` (kept), `aiErrorSchema` / `AiError` (kept), `aiRequestTimeoutMs` (kept), `aiErrorDetail` and the redaction helpers (kept). Removed: `generateFlow*`, `explainRun*`, `aiHistory*`, `aiFlowAnswerSchema`, `aiMessageAnswerSchema`.

- [x] **Step 1: Write the failing tests**

Append to `packages/contracts/src/ai.test.ts` (keep the existing redaction tests; delete tests that import `generateFlowRequestSchema`, `explainRunRequestSchema`, `aiHistoryTurnSchema` or `generateFlowResponseSchema`):

```ts
import {
  aiMessageSchema,
  aiStreamEventSchema,
  sendAiMessageRequestSchema,
  setAiProposalStateContract,
} from "./ai";
import { Value } from "@sinclair/typebox/value";

describe("ai message contracts", () => {
  const document = {
    version: 1 as const,
    name: "Ping",
    description: "",
    nodes: [
      { id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    ],
    edges: [],
  };

  test("a message is a role, ordered parts and a timestamp", () => {
    expect(
      Value.Check(aiMessageSchema, {
        id: "m1",
        role: "assistant",
        createdAt: "2026-09-11T00:00:00.000Z",
        parts: [
          { type: "text", text: "Added a trigger." },
          {
            type: "tool",
            id: "c1",
            name: "add_node",
            args: { id: "n1" },
            ok: true,
            detail: "Added n1",
          },
          {
            type: "question",
            text: "Which chain?",
            options: ["Base Sepolia", "World Chain Sepolia"],
          },
          {
            type: "proposal",
            document,
            verification: { checks: [], warnings: [] },
            replaces: true,
            state: "pending",
          },
          { type: "suggestions", items: ["Add a Discord message"] },
          { type: "error", error: "unavailable" },
        ],
      }),
    ).toBe(true);
    expect(
      Value.Check(aiMessageSchema, { id: "m1", role: "system", parts: [], createdAt: "x" }),
    ).toBe(false);
  });

  test("stream events are discriminated by type", () => {
    for (const event of [
      { type: "message", id: "m2" },
      { type: "text.delta", delta: "Add" },
      { type: "tool.call", id: "c1", name: "add_node", args: {} },
      { type: "tool.result", id: "c1", ok: false, detail: 'Unknown node type "x"' },
      { type: "tool.result", id: "c1", ok: true, detail: "Added n1", document },
      { type: "status", phase: "checking" },
      { type: "question", text: "Which chain?", options: ["Base Sepolia"] },
      { type: "proposal", document, verification: { checks: [], warnings: [] }, replaces: false },
      { type: "suggestions", items: ["Add a test"] },
      { type: "error", error: "invalid_flow", detail: "No trigger" },
      { type: "done" },
    ])
      expect(Value.Check(aiStreamEventSchema, event), JSON.stringify(event)).toBe(true);
    expect(Value.Check(aiStreamEventSchema, { type: "tool.call", id: "c1" })).toBe(false);
  });

  test("a send request needs text and bounds its context", () => {
    expect(Value.Check(sendAiMessageRequestSchema, { text: "hi" })).toBe(true);
    expect(
      Value.Check(sendAiMessageRequestSchema, {
        text: "fix these",
        document,
        context: {
          selection: ["n1"],
          problems: [{ severity: "error", message: "No trigger" }],
        },
      }),
    ).toBe(true);
    expect(Value.Check(sendAiMessageRequestSchema, { text: "" })).toBe(false);
    expect(Value.Check(sendAiMessageRequestSchema, { text: "x".repeat(4001) })).toBe(false);
  });

  test("the proposal state route takes only applied or discarded", () => {
    expect(Value.Check(setAiProposalStateContract.body, { state: "applied" })).toBe(true);
    expect(Value.Check(setAiProposalStateContract.body, { state: "stale" })).toBe(false);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/contracts/src/ai.test.ts`
Expected: FAIL, `aiMessageSchema` is not exported.

- [x] **Step 3: Write the schemas and contracts**

Replace the top of `packages/contracts/src/ai.ts` (everything before `export const redactedValue`) with:

```ts
import { Type, type Static } from "@sinclair/typebox";
import { apiErrorCodeSchema } from "./contract";
import { flowProblemSchema } from "./flow-problems";
import { flowRunNodeResultSchema, flowRunStatusSchema, flowRunTriggerSchema } from "./flow-runs";
import { flowDocumentInputSchema } from "./flows";

/** One agent turn: model hops, tool calls, checks and one repair share this client budget. */
export const aiRequestTimeoutMs = 300_000;

export const aiMessageTextMaxLength = 4000;

/* ---- Verification (unchanged shapes) ---- */

export const aiFlowExpectationSchema = Type.Object({
  nodeId: Type.String(),
  output: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
  equals: Type.Optional(Type.Unknown()),
  greaterThan: Type.Optional(Type.Number()),
  lessThan: Type.Optional(Type.Number()),
  contains: Type.Optional(Type.String()),
  screenBody: Type.Optional(Type.String()),
});
export type AiFlowExpectation = Static<typeof aiFlowExpectationSchema>;

export const aiFlowTestSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  triggerNodeId: Type.Optional(Type.String()),
  payload: Type.Optional(Type.Unknown()),
  answers: Type.Optional(
    Type.Record(
      Type.String(),
      Type.Object({
        port: Type.String(),
        data: Type.Optional(Type.Record(Type.String(), Type.String())),
      }),
    ),
  ),
  expect: Type.Array(aiFlowExpectationSchema, { minItems: 1, maxItems: 12 }),
});
export type AiFlowTest = Static<typeof aiFlowTestSchema>;

export const aiVerificationSchema = Type.Object({
  checks: Type.Array(
    Type.Object({
      name: Type.String(),
      status: Type.Union([Type.Literal("passed"), Type.Literal("failed"), Type.Literal("skipped")]),
      detail: Type.String(),
    }),
    { maxItems: 8 },
  ),
  warnings: Type.Array(Type.String(), { maxItems: 20 }),
});
export type AiVerification = Static<typeof aiVerificationSchema>;

/* ---- Errors ---- */

export const aiErrorDetailMaxLength = 300;

export const aiErrorSchema = Type.Object({
  error: apiErrorCodeSchema,
  detail: Type.Optional(Type.String({ maxLength: aiErrorDetailMaxLength })),
});
export type AiError = Static<typeof aiErrorSchema>;

const aiErrorResponses = {
  400: aiErrorSchema,
  401: aiErrorSchema,
  403: aiErrorSchema,
  404: aiErrorSchema,
  409: aiErrorSchema,
  422: aiErrorSchema,
  429: aiErrorSchema,
  500: aiErrorSchema,
  503: aiErrorSchema,
} as const;

/* ---- Context the panel sends with a message ---- */

export const aiRunContextSchema = Type.Object({
  status: flowRunStatusSchema,
  trigger: flowRunTriggerSchema,
  nodes: Type.Array(flowRunNodeResultSchema),
  error: Type.Optional(Type.String()),
  /** The node to explain; else the first failed node, else the run-wide error. */
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
});
export type AiRunContext = Static<typeof aiRunContextSchema>;

export const aiContextSchema = Type.Object({
  selection: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 50 })),
  problems: Type.Optional(Type.Array(flowProblemSchema, { maxItems: 50 })),
  run: Type.Optional(aiRunContextSchema),
});
export type AiContext = Static<typeof aiContextSchema>;

/* ---- Messages and their parts ---- */

export const aiProposalStateSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("applied"),
  Type.Literal("discarded"),
  Type.Literal("stale"),
]);
export type AiProposalState = Static<typeof aiProposalStateSchema>;

export const aiStatusPhaseSchema = Type.Union([
  Type.Literal("thinking"),
  Type.Literal("checking"),
  Type.Literal("repairing"),
]);
export type AiStatusPhase = Static<typeof aiStatusPhaseSchema>;

const textPart = Type.Object({ type: Type.Literal("text"), text: Type.String() });
const toolPart = Type.Object({
  type: Type.Literal("tool"),
  id: Type.String(),
  name: Type.String(),
  args: Type.Record(Type.String(), Type.Unknown()),
  /* Absent while the call is still running. */
  ok: Type.Optional(Type.Boolean()),
  detail: Type.Optional(Type.String()),
});
const questionPart = Type.Object({
  type: Type.Literal("question"),
  text: Type.String(),
  options: Type.Array(Type.String(), { maxItems: 4 }),
});
const proposalPart = Type.Object({
  type: Type.Literal("proposal"),
  document: flowDocumentInputSchema,
  verification: aiVerificationSchema,
  /* A new flow replaces the canvas; an edit keeps the canvas's secrets for nodes it kept. */
  replaces: Type.Boolean(),
  state: aiProposalStateSchema,
});
const suggestionsPart = Type.Object({
  type: Type.Literal("suggestions"),
  items: Type.Array(Type.String(), { maxItems: 3 }),
});
const errorPart = Type.Object({
  type: Type.Literal("error"),
  error: apiErrorCodeSchema,
  detail: Type.Optional(Type.String({ maxLength: aiErrorDetailMaxLength })),
});

export const aiPartSchema = Type.Union([
  textPart,
  toolPart,
  questionPart,
  proposalPart,
  suggestionsPart,
  errorPart,
]);
export type AiPart = Static<typeof aiPartSchema>;
export type AiProposalPart = Static<typeof proposalPart>;
export type AiToolPart = Static<typeof toolPart>;

export const aiMessageSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  role: Type.Union([Type.Literal("user"), Type.Literal("assistant")]),
  parts: Type.Array(aiPartSchema),
  context: Type.Optional(aiContextSchema),
  createdAt: Type.String(),
});
export type AiMessage = Static<typeof aiMessageSchema>;

/* ---- Stream events ---- */

export const aiStreamEventSchema = Type.Union([
  Type.Object({ type: Type.Literal("message"), id: Type.String({ minLength: 1 }) }),
  Type.Object({ type: Type.Literal("text.delta"), delta: Type.String() }),
  Type.Object({
    type: Type.Literal("tool.call"),
    id: Type.String(),
    name: Type.String(),
    args: Type.Record(Type.String(), Type.Unknown()),
  }),
  Type.Object({
    type: Type.Literal("tool.result"),
    id: Type.String(),
    ok: Type.Boolean(),
    detail: Type.String(),
    /* The working copy after a successful mutation, laid out, for the canvas preview. */
    document: Type.Optional(flowDocumentInputSchema),
  }),
  Type.Object({
    type: Type.Literal("status"),
    phase: aiStatusPhaseSchema,
    detail: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("question"),
    text: Type.String(),
    options: Type.Array(Type.String(), { maxItems: 4 }),
  }),
  Type.Object({
    type: Type.Literal("proposal"),
    document: flowDocumentInputSchema,
    verification: aiVerificationSchema,
    replaces: Type.Boolean(),
  }),
  Type.Object({
    type: Type.Literal("suggestions"),
    items: Type.Array(Type.String(), { maxItems: 3 }),
  }),
  Type.Object({
    type: Type.Literal("error"),
    error: apiErrorCodeSchema,
    detail: Type.Optional(Type.String({ maxLength: aiErrorDetailMaxLength })),
  }),
  Type.Object({ type: Type.Literal("done") }),
]);
export type AiStreamEvent = Static<typeof aiStreamEventSchema>;

/* ---- Routes ---- */

const flowParams = Type.Object({ id: Type.String({ minLength: 1 }) });
const messageParams = Type.Object({
  id: Type.String({ minLength: 1 }),
  messageId: Type.String({ minLength: 1 }),
});

export const listAiMessagesContract = {
  method: "GET",
  path: "/flows/:id/ai/messages",
  params: flowParams,
  response: { 200: Type.Object({ messages: Type.Array(aiMessageSchema) }), ...aiErrorResponses },
} as const;

export const sendAiMessageRequestSchema = Type.Object({
  text: Type.String({ minLength: 1, maxLength: aiMessageTextMaxLength }),
  /* The canvas when it has unsaved changes; absent, the API reads the saved flow. */
  document: Type.Optional(flowDocumentInputSchema),
  context: Type.Optional(aiContextSchema),
});
export type SendAiMessageRequest = Static<typeof sendAiMessageRequestSchema>;

/** Answers `text/event-stream` of `aiStreamEventSchema`; the 200 body is not JSON. */
export const sendAiMessageContract = {
  method: "POST",
  path: "/flows/:id/ai/messages",
  params: flowParams,
  body: sendAiMessageRequestSchema,
  response: { 200: Type.Unknown(), ...aiErrorResponses },
} as const;

export const setAiProposalStateContract = {
  method: "PATCH",
  path: "/flows/:id/ai/messages/:messageId",
  params: messageParams,
  body: Type.Object({
    state: Type.Union([Type.Literal("applied"), Type.Literal("discarded")]),
  }),
  response: { 200: Type.Object({ message: aiMessageSchema }), ...aiErrorResponses },
} as const;

export const clearAiMessagesContract = {
  method: "DELETE",
  path: "/flows/:id/ai/messages",
  params: flowParams,
  response: { 200: Type.Object({ cleared: Type.Boolean() }), ...aiErrorResponses },
} as const;
```

Keep `redactedValue`, the regexes, `redactSensitiveText`, `redactSensitiveValue`, `redactRunOutputs` and `aiErrorDetail` below it. Change `redactRunOutputs`'s generic to `<T extends Pick<AiRunContext, "trigger" | "error" | "nodes">>`.

- [x] **Step 4: Run the tests**

Run: `bun test packages/contracts/src/ai.test.ts`
Expected: PASS.

- [x] **Step 5: Find every import of a removed name**

Run: `grep -rn "generateFlow\|explainRun\|aiHistory\|AiHistoryTurn\|GenerateFlowResponse\|ExplainRun" apps packages --include='*.ts' --include='*.tsx' -l | grep -v node_modules`
Expected: a list of API and web files. They are handled in Tasks 5, 6 and 9 to 13; `bun run typecheck` stays red until then, which is why the checkpoint below is contracts-only.

- [x] **Step 6: Checkpoint**

Run `bun test packages/contracts` (green) and note the branch is mid-migration. Proposed message: `feat(contracts): describe AI conversations as messages, parts and stream events`.

---

### Task 2: The messages table and store

**Files:**

- Modify: `packages/db/src/migrations.ts` (append after `0019_run_source_api`)
- Create: `packages/db/src/ai-messages.ts`
- Create: `packages/db/src/ai-messages.integration.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface AiMessageStore {
    list(flowId: string): Promise<AiMessage[]>;
    append(flowId: string, message: Omit<AiMessage, "createdAt">): Promise<AiMessage>;
    setProposalState(
      flowId: string,
      messageId: string,
      state: "applied" | "discarded",
    ): Promise<AiMessage | null>;
    markPendingStale(flowId: string): Promise<void>;
    clear(flowId: string): Promise<boolean>;
  }
  export function createAiMessageStore(sql: SQL | undefined): AiMessageStore;
  ```

  `createDatabase()` returns it as `aiMessages`.

- [x] **Step 1: Write the failing integration test**

`packages/db/src/ai-messages.integration.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createAiMessageStore } from "./ai-messages";
import { createFlowStore } from "./flows";
import { migrate } from "./migrations";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

const input = {
  version: 1 as const,
  name: "Ping",
  description: "",
  nodes: [
    {
      id: "n1",
      type: "trigger.manual" as const,
      position: { x: 0, y: 0 },
      label: "Run",
      config: {},
    },
  ],
  edges: [],
};

describe.skipIf(!url)("ai messages store", () => {
  test.skipIf(!url)("appends in order, updates proposal state, and cascades", async () => {
    // Never point this at a database with real data: the test users are deleted.
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const messages = createAiMessageStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", null);
      const flow = await flows.create("did:privy:test-a", input);

      const user = await messages.append(flow.flow.id, {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Make a flow" }],
        context: { selection: ["n1"] },
      });
      expect(user.createdAt).toMatch(/^\d{4}-/);
      await messages.append(flow.flow.id, {
        id: "m2",
        role: "assistant",
        parts: [
          { type: "text", text: "Here it is." },
          {
            type: "proposal",
            document: input,
            verification: { checks: [], warnings: [] },
            replaces: true,
            state: "pending",
          },
        ],
      });

      const listed = await messages.list(flow.flow.id);
      expect(listed.map((message) => message.id)).toEqual(["m1", "m2"]);
      expect(listed[0]!.context).toEqual({ selection: ["n1"] });

      const applied = await messages.setProposalState(flow.flow.id, "m2", "applied");
      expect(applied?.parts[1]).toMatchObject({ type: "proposal", state: "applied" });
      expect(await messages.setProposalState(flow.flow.id, "nope", "applied")).toBeNull();

      await messages.append(flow.flow.id, {
        id: "m3",
        role: "assistant",
        parts: [
          {
            type: "proposal",
            document: input,
            verification: { checks: [], warnings: [] },
            replaces: false,
            state: "pending",
          },
        ],
      });
      await messages.markPendingStale(flow.flow.id);
      const afterStale = await messages.list(flow.flow.id);
      expect(afterStale[1]!.parts[1]).toMatchObject({ state: "applied" });
      expect(afterStale[2]!.parts[0]).toMatchObject({ state: "stale" });

      expect(await messages.clear(flow.flow.id)).toBe(true);
      expect(await messages.list(flow.flow.id)).toEqual([]);

      await messages.append(flow.flow.id, { id: "m4", role: "user", parts: [] });
      await sql`DELETE FROM automator_flows WHERE id = ${flow.flow.id}`;
      expect(await messages.list(flow.flow.id)).toEqual([]);
    } finally {
      await sql.close();
    }
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `TEST_DATABASE_URL="postgres://localhost:5432/automator_test" bun test packages/db/src/ai-messages.integration.test.ts`
Expected: FAIL, module `./ai-messages` not found. (If the local test database is not running, start it as the memory note `reference-worktree-e2e-env` / project memory describes; do not skip this task's test.)

- [x] **Step 3: Add the migration**

Append to `migrations` in `packages/db/src/migrations.ts`:

```ts
  {
    name: "0020_flow_ai_messages",
    sql: `CREATE TABLE IF NOT EXISTS automator_flow_ai_messages (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL REFERENCES automator_flows(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      parts JSONB NOT NULL DEFAULT '[]'::jsonb,
      context JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS automator_flow_ai_messages_flow_created
      ON automator_flow_ai_messages (flow_id, created_at, id)`,
  },
```

- [x] **Step 4: Write the store**

`packages/db/src/ai-messages.ts`:

```ts
import type { AiMessage, AiPart } from "@automator/contracts";
import type { SQL } from "bun";

export interface AiMessageStore {
  list(flowId: string): Promise<AiMessage[]>;
  append(flowId: string, message: Omit<AiMessage, "createdAt">): Promise<AiMessage>;
  setProposalState(
    flowId: string,
    messageId: string,
    state: "applied" | "discarded",
  ): Promise<AiMessage | null>;
  /** Sending a new message supersedes every proposal still waiting for a decision. */
  markPendingStale(flowId: string): Promise<void>;
  clear(flowId: string): Promise<boolean>;
}

type Row = {
  id: string;
  role: AiMessage["role"];
  parts: AiPart[];
  context: AiMessage["context"] | null;
  createdAt: Date;
};

const columns = `id, role, parts, context, created_at AS "createdAt"`;

function toMessage(row: Row): AiMessage {
  return {
    id: row.id,
    role: row.role,
    parts: row.parts,
    ...(row.context === null ? {} : { context: row.context }),
    createdAt: row.createdAt.toISOString(),
  };
}

function withProposalState(
  parts: AiPart[],
  state: AiMessage["parts"][number] extends infer P
    ? Extract<P, { type: "proposal" }>["state"]
    : never,
  only?: "pending",
) {
  return parts.map((part) =>
    part.type === "proposal" && (only === undefined || part.state === only)
      ? { ...part, state }
      : part,
  );
}

export function createAiMessageStore(sql: SQL | undefined): AiMessageStore {
  const connection = () => {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  };
  return {
    async list(flowId) {
      const db = connection();
      const rows = await db<Row[]>`
        SELECT ${db.unsafe(columns)} FROM automator_flow_ai_messages
        WHERE flow_id = ${flowId}
        ORDER BY created_at ASC, id ASC`;
      return rows.map(toMessage);
    },
    async append(flowId, message) {
      const db = connection();
      // Bun SQL sends objects and arrays as JSON text only when told so; see the memory note on JSONB.
      const rows = await db<Row[]>`
        INSERT INTO automator_flow_ai_messages (id, flow_id, role, parts, context)
        VALUES (
          ${message.id}, ${flowId}, ${message.role},
          ${JSON.stringify(message.parts)}::jsonb,
          ${message.context === undefined ? null : JSON.stringify(message.context)}::jsonb
        )
        RETURNING ${db.unsafe(columns)}`;
      return toMessage(rows[0]!);
    },
    async setProposalState(flowId, messageId, state) {
      const db = connection();
      const rows = await db<Row[]>`
        SELECT ${db.unsafe(columns)} FROM automator_flow_ai_messages
        WHERE flow_id = ${flowId} AND id = ${messageId}`;
      const row = rows[0];
      if (!row) return null;
      const parts = withProposalState(row.parts, state);
      const updated = await db<Row[]>`
        UPDATE automator_flow_ai_messages SET parts = ${JSON.stringify(parts)}::jsonb
        WHERE flow_id = ${flowId} AND id = ${messageId}
        RETURNING ${db.unsafe(columns)}`;
      return toMessage(updated[0]!);
    },
    async markPendingStale(flowId) {
      const db = connection();
      const rows = await db<Row[]>`
        SELECT ${db.unsafe(columns)} FROM automator_flow_ai_messages
        WHERE flow_id = ${flowId} AND parts @> '[{"type":"proposal","state":"pending"}]'::jsonb`;
      for (const row of rows) {
        const parts = withProposalState(row.parts, "stale", "pending");
        await db`
          UPDATE automator_flow_ai_messages SET parts = ${JSON.stringify(parts)}::jsonb
          WHERE id = ${row.id}`;
      }
    },
    async clear(flowId) {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        DELETE FROM automator_flow_ai_messages WHERE flow_id = ${flowId} RETURNING id`;
      return rows.length > 0;
    },
  };
}
```

Simplify the `withProposalState` signature to `(parts: AiPart[], state: AiProposalState, only?: "pending")` importing `AiProposalState` from contracts; the inline conditional type above is only there to show the intent.

- [x] **Step 5: Wire and export**

In `packages/db/src/index.ts`: `import { createAiMessageStore } from "./ai-messages";`, add `aiMessages: createAiMessageStore(sql),` to the object `createDatabase` returns, and `export { type AiMessageStore } from "./ai-messages";`.

- [x] **Step 6: Run the integration test and the migration ledger test**

Run: `TEST_DATABASE_URL="postgres://localhost:5432/automator_test" bun test packages/db`
Expected: PASS, including `migrations.test.ts`. If a Bun SQL JSONB insert fails with "invalid input syntax for type json", the memory note `project-marketplace-2026-09` records the fix: pass `JSON.stringify(...)` and cast with `::jsonb`, as written above.

- [x] **Step 7: Checkpoint**

Proposed message: `feat(db): store AI conversations per flow`.

---

### Task 3: Draft helpers extracted from generate-flow

**Files:**

- Rename: `apps/api/src/ai/generate-flow.ts` → `apps/api/src/ai/draft.ts` (`git mv`)
- Rename: `apps/api/src/ai/generate-flow.test.ts` → `apps/api/src/ai/draft.test.ts`
- Delete: `apps/api/src/ai/explain-run.ts`, `apps/api/src/ai/explain-run.test.ts`

**Interfaces:**

- Produces (all already exist in `generate-flow.ts`, keep their signatures): `generatableNodeTypes`, `FlowGenerationError`, `AiDataTable`, `describeDataTables(tables)`, `describeNodeTypes()`, `materialize(draft: Draft, tables?): FlowDocumentInput`, `withoutPositions(document)`, and the exported types `Draft`, `DraftNode`, `DraftEdge` (make the three interfaces `export`).
- Removed: `systemPrompt`, `historyMessages`, `askForFlow`, `generateFlow`, `modelAttempts`, `checkFlow` (moves to `canvas-agent.ts` in Task 5).

- [x] **Step 1: Rename and prune**

```bash
git mv apps/api/src/ai/generate-flow.ts apps/api/src/ai/draft.ts
git mv apps/api/src/ai/generate-flow.test.ts apps/api/src/ai/draft.test.ts
git rm apps/api/src/ai/explain-run.ts apps/api/src/ai/explain-run.test.ts
```

In `draft.ts` delete `systemPrompt`, `modelHistoryLimit`, `modelHistoryTurnLength`, `historyMessages`, `checkFlow`, `askForFlow`, `generateFlow`, `modelAttempts` and the `readDraft`/`readMessage`/`isRecord` helpers if nothing left uses them (`materialize` takes a `Draft`, so `readDraft` goes; keep `isRecord` only if used). Prefix the three `interface Draft*` declarations with `export`. Remove imports that become unused (`verify-flow`, `client`, `parseJsonAnswer`, `LanguageModelError`, `ChatMessage`, `LanguageModel`, `aiFlowTestSchema`, `Value`, `Type`, `AiHistoryTurn`, `GenerateFlowResponse`, `AiVerification`).

- [x] **Step 2: Prune the tests**

In `draft.test.ts` keep every test that exercises `materialize`, `describeNodeTypes`, `describeDataTables`, `withoutPositions` and `generatableNodeTypes`; delete tests of `askForFlow`, `generateFlow`, `historyMessages` and the system prompt text. Fix the import path to `./draft`.

- [x] **Step 3: Run**

Run: `bun test apps/api/src/ai/draft.test.ts`
Expected: PASS. (`apps/api/src/ai/routes.ts` and `routes.test.ts` still import removed modules; they are rewritten in Task 6.)

---

### Task 4: The working copy and its per-call validation

**Files:**

- Create: `apps/api/src/ai/working-copy.ts`
- Create: `apps/api/src/ai/working-copy.test.ts`

**Interfaces:**

- Consumes: `generatableNodeTypes`, `Draft`, `DraftNode`, `DraftEdge` from `./draft`; `flowNodePorts`, `flowNodeConfigSchemas`, `screenConfigSchemas`, `parseNodeConfig`, `layoutFlowPositions`, `chainIdSchema` from `@automator/contracts`.
- Produces:

  ```ts
  export class ToolCallError extends Error {} // a rejected call: the message goes back to the model
  export class WorkingCopy {
    constructor(current?: FlowDocumentInput);
    readonly changed: boolean;
    addNode(args: unknown): string; // returns the detail sentence
    updateNode(args: unknown): string;
    removeNode(args: unknown): string;
    connect(args: unknown): string;
    disconnect(args: unknown): string;
    setFlow(args: unknown): string;
    toDraft(): Draft; // for materialize()
    toPreview(): FlowDocumentInput; // laid out, configs as-is, for tool.result events
  }
  ```

- [x] **Step 1: Write the failing tests**

`apps/api/src/ai/working-copy.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ToolCallError, WorkingCopy } from "./working-copy";

describe("working copy", () => {
  test("adds, connects and lays out nodes", () => {
    const copy = new WorkingCopy();
    expect(copy.addNode({ id: "t", type: "trigger.manual", label: "Run", config: {} })).toBe(
      'Added "Run" (trigger.manual) as t',
    );
    copy.addNode({ id: "d", type: "notify.discord", label: "Post", config: { content: "hi" } });
    expect(
      copy.connect({ source: "t", sourceHandle: "run", target: "d", targetHandle: "message" }),
    ).toBe("Connected t.run → d.message");
    const preview = copy.toPreview();
    expect(preview.nodes.map((node) => node.id)).toEqual(["t", "d"]);
    expect(preview.nodes[1]!.position.x).toBeGreaterThan(preview.nodes[0]!.position.x);
    expect(preview.edges).toHaveLength(1);
    expect(copy.changed).toBe(true);
  });

  test("rejects an unknown type, a duplicate id, and an unknown handle", () => {
    const copy = new WorkingCopy();
    expect(() => copy.addNode({ id: "x", type: "notify.pigeon", label: "", config: {} })).toThrow(
      ToolCallError,
    );
    copy.addNode({ id: "t", type: "trigger.manual", label: "Run", config: {} });
    expect(() =>
      copy.addNode({ id: "t", type: "trigger.manual", label: "Run", config: {} }),
    ).toThrow(/already exists/);
    copy.addNode({ id: "d", type: "notify.discord", label: "Post", config: {} });
    expect(() =>
      copy.connect({ source: "t", sourceHandle: "run", target: "d", targetHandle: "content" }),
    ).toThrow(/"content" is not an input of notify\.discord; inputs are \[message\]/);
  });

  test("allows one edge per input, no self edge, no cycle", () => {
    const copy = new WorkingCopy();
    copy.addNode({ id: "t", type: "trigger.manual", label: "Run", config: {} });
    copy.addNode({
      id: "a",
      type: "logic.set-variable",
      label: "A",
      config: { name: "x", value: "1" },
    });
    copy.addNode({
      id: "b",
      type: "logic.set-variable",
      label: "B",
      config: { name: "y", value: "2" },
    });
    copy.connect({ source: "t", sourceHandle: "run", target: "a", targetHandle: "value" });
    expect(() =>
      copy.connect({ source: "t", sourceHandle: "run", target: "a", targetHandle: "value" }),
    ).toThrow(/already has an edge/);
    expect(() =>
      copy.connect({ source: "a", sourceHandle: "value", target: "a", targetHandle: "value" }),
    ).toThrow(/itself/);
    copy.connect({ source: "a", sourceHandle: "value", target: "b", targetHandle: "value" });
    expect(() =>
      copy.connect({ source: "b", sourceHandle: "value", target: "t", targetHandle: "value" }),
    ).toThrow(/cycle|has no input/);
  });

  test("cleans config through the node schema and reports unknown fields", () => {
    const copy = new WorkingCopy();
    copy.addNode({
      id: "d",
      type: "notify.discord",
      label: "Post",
      config: { content: "hi", nope: 1 },
    });
    expect(copy.toDraft().nodes[0]!.config).not.toHaveProperty("nope");
    expect(copy.updateNode({ id: "d", config: { content: "hello" } })).toBe('Updated "Post"');
    expect(copy.toDraft().nodes[0]!.config).toMatchObject({ content: "hello" });
    expect(() => copy.updateNode({ id: "zz" })).toThrow(/No node "zz"/);
  });

  test("starts from the current document and tracks change", () => {
    const copy = new WorkingCopy({
      version: 1,
      name: "Ping",
      description: "",
      nodes: [
        { id: "t", type: "trigger.manual", position: { x: 5, y: 5 }, label: "Run", config: {} },
      ],
      edges: [],
    });
    expect(copy.changed).toBe(false);
    expect(copy.setFlow({ name: "Pong" })).toBe('Renamed the flow to "Pong"');
    expect(copy.changed).toBe(true);
    expect(() => copy.setFlow({ chainId: 1 })).toThrow(/chainId/);
    expect(copy.removeNode({ id: "t" })).toBe('Removed "Run" and 0 edges');
    expect(copy.toDraft().nodes).toEqual([]);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `bun test apps/api/src/ai/working-copy.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Implement**

`apps/api/src/ai/working-copy.ts`:

```ts
import {
  chainIdSchema,
  flowNodeConfigSchemas,
  flowNodePorts,
  layoutFlowPositions,
  parseNodeConfig,
  screenConfigSchemas,
  Value,
  type FlowDocumentInput,
  type FlowNodeType,
  type TObject,
} from "@automator/contracts";
import { generatableNodeTypes, type Draft, type DraftEdge, type DraftNode } from "./draft";

/** A tool call the working copy refuses. Its message is the tool result the model reads. */
export class ToolCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolCallError";
  }
}

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

const maxNodes = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(args: Record<string, unknown>, key: string, required = true): string | undefined {
  const value = args[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || (required && !value.trim()))
    throw new ToolCallError(`"${key}" must be a non-empty string`);
  return value.trim();
}

function record(args: unknown): Record<string, unknown> {
  if (!isRecord(args)) throw new ToolCallError("Arguments must be an object");
  return args;
}

function edgeKey(edge: DraftEdge): string {
  return `${edge.source}.${edge.sourceHandle}→${edge.target}.${edge.targetHandle}`;
}

export class WorkingCopy {
  private name: string;
  private description: string;
  private chainId: FlowDocumentInput["chainId"];
  private nodes: DraftNode[];
  private edges: DraftEdge[];
  private mutations = 0;

  constructor(current?: FlowDocumentInput) {
    this.name = current?.name ?? "Untitled flow";
    this.description = current?.description ?? "";
    this.chainId = current?.chainId;
    this.nodes = (current?.nodes ?? []).map(({ id, type, label, config }) => ({
      id,
      type,
      label,
      config: { ...config },
    }));
    this.edges = (current?.edges ?? []).map((edge) => ({
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? "",
      target: edge.target,
      targetHandle: edge.targetHandle ?? "",
    }));
  }

  get changed(): boolean {
    return this.mutations > 0;
  }

  private node(id: string): DraftNode {
    const node = this.nodes.find((entry) => entry.id === id);
    if (!node)
      throw new ToolCallError(`No node "${id}" exists; add it first or use an existing id`);
    return node;
  }

  private clean(type: FlowNodeType, config: unknown): Record<string, unknown> {
    const schema = configSchemas[type];
    if (!schema) return isRecord(config) ? config : {};
    try {
      return parseNodeConfig(schema, isRecord(config) ? config : {}) as Record<string, unknown>;
    } catch (error) {
      throw new ToolCallError(
        `Config for ${type} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  addNode(raw: unknown): string {
    const args = record(raw);
    const id = text(args, "id")!;
    const type = text(args, "type")!;
    if (!(generatableNodeTypes as readonly string[]).includes(type))
      throw new ToolCallError(
        `Unknown node type "${type}". Use one of: ${generatableNodeTypes.join(", ")}`,
      );
    if (this.nodes.some((node) => node.id === id))
      throw new ToolCallError(`Node "${id}" already exists; use update_node or another id`);
    if (this.nodes.length >= maxNodes)
      throw new ToolCallError(`A flow is limited to ${maxNodes} nodes`);
    const label = text(args, "label", false) || type;
    const node: DraftNode = {
      id,
      type: type as FlowNodeType,
      label,
      config: this.clean(type as FlowNodeType, args.config),
    };
    this.nodes.push(node);
    this.mutations += 1;
    return `Added "${label}" (${type}) as ${id}`;
  }

  updateNode(raw: unknown): string {
    const args = record(raw);
    const node = this.node(text(args, "id")!);
    const label = text(args, "label", false);
    if (label !== undefined) node.label = label;
    if (args.config !== undefined)
      node.config = this.clean(node.type, { ...node.config, ...record(args.config) });
    this.mutations += 1;
    return `Updated "${node.label}"`;
  }

  removeNode(raw: unknown): string {
    const args = record(raw);
    const node = this.node(text(args, "id")!);
    const before = this.edges.length;
    this.edges = this.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id);
    this.nodes = this.nodes.filter((entry) => entry.id !== node.id);
    this.mutations += 1;
    return `Removed "${node.label}" and ${before - this.edges.length} edges`;
  }

  private edgeArgs(raw: unknown): DraftEdge {
    const args = record(raw);
    return {
      source: text(args, "source")!,
      sourceHandle: text(args, "sourceHandle")!,
      target: text(args, "target")!,
      targetHandle: text(args, "targetHandle")!,
    };
  }

  private reaches(from: string, to: string, seen = new Set<string>()): boolean {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return this.edges
      .filter((edge) => edge.source === from)
      .some((edge) => this.reaches(edge.target, to, seen));
  }

  connect(raw: unknown): string {
    const edge = this.edgeArgs(raw);
    const source = this.node(edge.source);
    const target = this.node(edge.target);
    if (source.id === target.id) throw new ToolCallError("A node cannot connect to itself");
    const { outputs } = flowNodePorts[source.type];
    const { inputs } = flowNodePorts[target.type];
    if (!outputs.includes(edge.sourceHandle))
      throw new ToolCallError(
        `"${edge.sourceHandle}" is not an output of ${source.type}; outputs are [${outputs.join(", ")}]`,
      );
    if (inputs.length === 0)
      throw new ToolCallError(`${target.type} is a trigger and has no input`);
    if (!inputs.includes(edge.targetHandle))
      throw new ToolCallError(
        `"${edge.targetHandle}" is not an input of ${target.type}; inputs are [${inputs.join(", ")}]`,
      );
    if (this.edges.some((e) => e.target === edge.target && e.targetHandle === edge.targetHandle))
      throw new ToolCallError(
        `${edge.target}.${edge.targetHandle} already has an edge; each input takes one. Use logic.merge to combine branches`,
      );
    if (this.reaches(edge.target, edge.source))
      throw new ToolCallError("That edge would create a cycle; flows are acyclic");
    this.edges.push(edge);
    this.mutations += 1;
    return `Connected ${edge.source}.${edge.sourceHandle} → ${edge.target}.${edge.targetHandle}`;
  }

  disconnect(raw: unknown): string {
    const edge = this.edgeArgs(raw);
    const key = edgeKey(edge);
    const before = this.edges.length;
    this.edges = this.edges.filter((entry) => edgeKey(entry) !== key);
    if (this.edges.length === before) throw new ToolCallError(`No edge ${key} exists`);
    this.mutations += 1;
    return `Disconnected ${key}`;
  }

  setFlow(raw: unknown): string {
    const args = record(raw);
    const changes: string[] = [];
    const name = text(args, "name", false);
    if (name !== undefined) {
      this.name = name.slice(0, 120);
      changes.push(`Renamed the flow to "${this.name}"`);
    }
    const description = text(args, "description", false);
    if (description !== undefined) {
      this.description = description.slice(0, 1000);
      changes.push("Set the description");
    }
    if (args.chainId !== undefined) {
      if (!Value.Check(chainIdSchema, args.chainId))
        throw new ToolCallError(`chainId ${String(args.chainId)} is not a supported chain`);
      this.chainId = args.chainId;
      changes.push(`Set the chain to ${args.chainId}`);
    }
    if (changes.length === 0)
      throw new ToolCallError("set_flow needs name, description or chainId");
    this.mutations += 1;
    return changes.join("; ");
  }

  toDraft(): Draft {
    return {
      name: this.name,
      description: this.description,
      summary: "",
      nodes: this.nodes.map((node) => ({ ...node, config: { ...node.config } })),
      edges: [...this.edges],
    };
  }

  /** The canvas preview: laid out and shaped as a document, but not put through the document checks. */
  toPreview(): FlowDocumentInput {
    const positions = layoutFlowPositions(this.nodes, this.edges);
    return {
      version: 1,
      name: this.name || "Untitled flow",
      description: this.description,
      ...(this.chainId === undefined ? {} : { chainId: this.chainId }),
      nodes: this.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? { x: 0, y: 0 },
      })),
      edges: this.edges.map((edge) => ({ id: `e-${edgeKey(edge)}`, ...edge })),
    };
  }
}
```

Check `materialize` in `draft.ts` reads `chainId`: if it does not, add an optional `chainId` to `Draft` and have `materialize` carry it into the document (`...(draft.chainId === undefined ? {} : { chainId: draft.chainId })`), and set it in `toDraft()`.

- [x] **Step 4: Run the tests**

Run: `bun test apps/api/src/ai/working-copy.test.ts`
Expected: PASS. Adjust the exact wording asserted in the tests only if `flowNodePorts` names differ from the plan's assumptions (`trigger.manual` output `run`, `notify.discord` input `message`, `logic.set-variable` input and output `value`); verify with `grep -n '"trigger.manual"\|"notify.discord"\|"logic.set-variable"' packages/contracts/src/flow-ports.ts`.

---

### Task 5: The canvas agent and its prompt

**Files:**

- Create: `apps/api/src/ai/tools.ts`
- Create: `apps/api/src/ai/prompt.ts`
- Create: `apps/api/src/ai/canvas-agent.ts`
- Create: `apps/api/src/ai/canvas-agent.test.ts`

**Interfaces:**

- Consumes: `WorkingCopy`, `ToolCallError` (Task 4); `materialize`, `describeNodeTypes`, `describeDataTables`, `withoutPositions`, `FlowGenerationError`, `AiDataTable` (Task 3); `verifyFlow`, `FlowTestError`, `VerificationTimeoutError`, `verificationBudgetMs`, `maxTestScenarios` from `./verify-flow`; `withRequestDeadline`, `requestBudgetMs` from `./client`; `LanguageModel`, `ChatMessage`, `LanguageModelError` from `@automator/flow-engine`; contracts types from Task 1.
- Produces:

  ```ts
  export const maxToolCalls = 40;
  export interface CanvasAgentInput {
    model: LanguageModel;
    text: string;
    current?: FlowDocumentInput; // secrets already blanked
    context?: AiContext;
    history: readonly AiMessage[]; // earlier messages of this flow
    tables?: readonly AiDataTable[];
    emit(event: AiStreamEvent): void; // never receives "message" or "done"; the route sends those
    signal?: AbortSignal;
    deadlineAt?: number;
    verificationBudget?: number;
  }
  export async function runCanvasAgent(input: CanvasAgentInput): Promise<AiPart[]>;
  ```

  `runCanvasAgent` returns the assistant message's parts (text merged, tools with results, question, proposal with `state: "pending"`, suggestions). It throws `LanguageModelError` for model failures; every other failure is turned into an `error` part and event.

- [x] **Step 1: Write the failing tests**

`apps/api/src/ai/canvas-agent.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { AiStreamEvent } from "@automator/contracts";
import { scriptedModel, type ChatResponse } from "@automator/flow-engine";
import { runCanvasAgent } from "./canvas-agent";

const call = (id: string, name: string, args: Record<string, unknown>) => ({
  id,
  name,
  arguments: args,
});

function turn(content: string | null, ...toolCalls: ReturnType<typeof call>[]): ChatResponse {
  return { content, toolCalls };
}

async function run(
  turns: ChatResponse[],
  options: { text?: string; current?: Parameters<typeof runCanvasAgent>[0]["current"] } = {},
) {
  const { model, requests } = scriptedModel(turns);
  const events: AiStreamEvent[] = [];
  const parts = await runCanvasAgent({
    model,
    text: options.text ?? "Post hi to Discord when I run it",
    current: options.current,
    history: [],
    emit: (event) => events.push(event),
    verificationBudget: 2000,
  });
  return { parts, events, requests };
}

describe("canvas agent", () => {
  test("builds a flow through tools, checks it and proposes it", async () => {
    const { parts, events } = await run([
      turn(
        "Adding a manual trigger and a Discord message.",
        call("c1", "add_node", { id: "t", type: "trigger.manual", label: "Run", config: {} }),
        call("c2", "add_node", {
          id: "d",
          type: "notify.discord",
          label: "Post",
          config: { content: "hi" },
        }),
        call("c3", "connect", {
          source: "t",
          sourceHandle: "run",
          target: "d",
          targetHandle: "message",
        }),
      ),
      turn(
        "Done. Fill in the webhook URL before running it.",
        call("c4", "suggest_next", { items: ["Add a condition"] }),
      ),
      turn("Ready.", []),
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "text.delta",
      "tool.call",
      "tool.result",
      "tool.call",
      "tool.result",
      "tool.call",
      "tool.result",
      "text.delta",
      "tool.call",
      "tool.result",
      "suggestions",
      "text.delta",
      "status",
      "proposal",
    ]);
    const proposal = events.find((event) => event.type === "proposal");
    expect(proposal).toMatchObject({ replaces: true });
    expect(parts.filter((part) => part.type === "text")).toHaveLength(1);
    expect(parts.at(-1)).toMatchObject({ type: "proposal", state: "pending" });
    expect(parts.find((part) => part.type === "suggestions")).toEqual({
      type: "suggestions",
      items: ["Add a condition"],
    });
  });

  test("a rejected tool call returns its problem and the loop continues", async () => {
    const { parts, events, requests } = await run([
      turn(
        null,
        call("c1", "add_node", { id: "t", type: "trigger.rocket", label: "Run", config: {} }),
      ),
      turn(
        null,
        call("c2", "add_node", { id: "t", type: "trigger.manual", label: "Run", config: {} }),
      ),
      turn("A trigger alone.", []),
    ]);
    expect(events[1]).toMatchObject({ type: "tool.result", id: "c1", ok: false });
    const toolMessage = requests[1]!.messages.at(-1)!;
    expect(toolMessage.role).toBe("tool");
    expect(toolMessage.content).toMatch(/Unknown node type "trigger.rocket"/);
    expect(parts[0]).toMatchObject({ type: "tool", ok: false });
    expect(parts.at(-1)).toMatchObject({ type: "proposal" });
  });

  test("ask_user ends the turn with a question and no proposal", async () => {
    const { parts, events } = await run([
      turn(
        "One thing first.",
        call("c1", "ask_user", {
          question: "Which chain?",
          options: ["Base Sepolia", "World Chain Sepolia"],
        }),
      ),
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "text.delta",
      "tool.call",
      "tool.result",
      "question",
    ]);
    expect(parts.some((part) => part.type === "proposal")).toBe(false);
    expect(parts.at(-1)).toEqual({
      type: "question",
      text: "Which chain?",
      options: ["Base Sepolia", "World Chain Sepolia"],
    });
  });

  test("a prose-only turn makes no proposal", async () => {
    const { parts, events } = await run([turn("This flow posts to Discord when you run it.", [])], {
      text: "What does this flow do?",
      current: {
        version: 1,
        name: "Ping",
        description: "",
        nodes: [
          { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
        ],
        edges: [],
      },
    });
    expect(events).toEqual([
      { type: "text.delta", delta: "This flow posts to Discord when you run it." },
    ]);
    expect(parts).toEqual([{ type: "text", text: "This flow posts to Discord when you run it." }]);
  });

  test("document checks that fail get one repair, then the draft is offered with a failed check", async () => {
    const { parts, events, requests } = await run([
      // A node with no trigger: the document check rejects it at the end of the turn.
      turn(
        null,
        call("c1", "add_node", {
          id: "d",
          type: "notify.discord",
          label: "Post",
          config: { content: "hi" },
        }),
      ),
      turn("Done.", []),
      // The repair turn changes nothing.
      turn("I cannot fix that.", []),
    ]);
    expect(
      events
        .filter((event) => event.type === "status")
        .map((event) => (event as { phase: string }).phase),
    ).toEqual(["checking", "repairing", "checking"]);
    expect(requests[2]!.messages.at(-1)!.content).toMatch(/not a valid flow/);
    const proposal = parts.at(-1);
    expect(proposal).toMatchObject({
      type: "proposal",
      verification: { checks: [{ status: "failed" }] },
    });
  });

  test("the tool call cap ends the turn", async () => {
    const calls = Array.from({ length: 41 }, (_, index) =>
      turn(null, call(`c${index}`, "set_flow", { description: `v${index}` })),
    );
    const { parts } = await run(calls);
    expect(parts.filter((part) => part.type === "tool")).toHaveLength(40);
    expect(parts.find((part) => part.type === "error")).toMatchObject({ error: "invalid_flow" });
  });

  test("history and context reach the model", async () => {
    const { requests } = await (async () => {
      const { model, requests } = scriptedModel([turn("ok", [])]);
      await runCanvasAgent({
        model,
        text: "fix it",
        history: [
          {
            id: "m1",
            role: "user",
            parts: [{ type: "text", text: "earlier ask" }],
            createdAt: "2026-09-11T00:00:00.000Z",
          },
          {
            id: "m2",
            role: "assistant",
            parts: [
              { type: "text", text: "earlier answer" },
              {
                type: "tool",
                id: "x",
                name: "add_node",
                args: { id: "t" },
                ok: true,
                detail: "Added t",
              },
            ],
            createdAt: "2026-09-11T00:00:01.000Z",
          },
        ],
        context: {
          selection: ["t"],
          problems: [{ severity: "error", nodeId: "t", message: '"Run": needs an edge' }],
        },
        emit: () => {},
      });
      return { requests };
    })();
    const messages = requests[0]!.messages;
    expect(messages[0]!.role).toBe("system");
    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "user",
    ]);
    expect(messages.at(-1)!.content).toMatch(/Selected nodes: t/);
    expect(messages.at(-1)!.content).toMatch(/needs an edge/);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `bun test apps/api/src/ai/canvas-agent.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Write the tool definitions**

`apps/api/src/ai/tools.ts`:

```ts
import type { ToolDefinition } from "@automator/flow-engine";

const edgeParameters = {
  type: "object",
  properties: {
    source: { type: "string", description: "Source node id" },
    sourceHandle: { type: "string", description: "An output handle of the source node" },
    target: { type: "string", description: "Target node id" },
    targetHandle: { type: "string", description: "An input handle of the target node" },
  },
  required: ["source", "sourceHandle", "target", "targetHandle"],
} as const;

export const canvasTools: ToolDefinition[] = [
  {
    name: "add_node",
    description:
      "Add a node to the flow. Returns an error if the type, id or config is not usable.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Short unique id such as n1" },
        type: { type: "string", description: "One of the listed node types" },
        label: { type: "string", description: "Short human label" },
        config: {
          type: "object",
          description: "Config fields listed for the type; leave secrets empty",
        },
      },
      required: ["id", "type", "label"],
    },
  },
  {
    name: "update_node",
    description: "Change a node's label or merge fields into its config.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        config: { type: "object" },
      },
      required: ["id"],
    },
  },
  {
    name: "remove_node",
    description: "Remove a node and every edge touching it.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "connect",
    description: "Connect an output handle to an input handle. Each input takes one edge.",
    parameters: edgeParameters,
  },
  { name: "disconnect", description: "Remove an edge.", parameters: edgeParameters },
  {
    name: "set_flow",
    description: "Set the flow's name, description or chain id.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        chainId: {
          type: "number",
          description: "84532 (Base Sepolia) or 4801 (World Chain Sepolia)",
        },
      },
    },
  },
  {
    name: "add_test",
    description:
      "Add a behavioral test scenario the automatic checks run against the flow: concrete visitor answers or a trigger payload and expected results. Required for mini-apps with a form.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        triggerNodeId: { type: "string" },
        payload: {},
        answers: {
          type: "object",
          description: "Screen node id → { port, data } with the visitor's answers",
        },
        expect: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string" },
              output: { type: "string" },
              path: { type: "string" },
              equals: {},
              greaterThan: { type: "number" },
              lessThan: { type: "number" },
              contains: { type: "string" },
              screenBody: { type: "string" },
            },
            required: ["nodeId"],
          },
        },
      },
      required: ["name", "expect"],
    },
  },
  {
    name: "ask_user",
    description:
      "Ask the user one short question with up to four options when the request cannot be built without it. Ends your turn; do not change the flow in the same turn.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" }, maxItems: 4 },
      },
      required: ["question", "options"],
    },
  },
  {
    name: "suggest_next",
    description:
      "Offer up to three short follow-up requests the user might make next. Call it once, at the end of a turn that changed the flow.",
    parameters: {
      type: "object",
      properties: { items: { type: "array", items: { type: "string" }, maxItems: 3 } },
      required: ["items"],
    },
  },
];
```

- [x] **Step 4: Write the prompt**

`apps/api/src/ai/prompt.ts`. Move the body of the old `systemPrompt` here (the paragraphs about the graph, templates, `logic.for-each`, execution rules and examples, the node type list and the data tables, verbatim from git history of `generate-flow.ts`), and replace its final "Answer with one JSON object" section with:

```ts
export const systemPrompt = (
  tables?: readonly AiDataTable[],
) => `You design automation flows for Automator, a visual canvas for onchain workflows.
${graphRules}
${templateRules}
${executionRules}

Node types you may use, with their handles and full config schemas:
${describeNodeTypes()}

The data tables of the account making this request:
${describeDataTables(tables ?? [])}

You work on the flow with tools. Build or change it with add_node, update_node, remove_node, connect, disconnect and set_flow; each call is checked as you make it and a rejected call tells you why, so fix that one thing and continue. The flow is complete when it has a trigger (a type whose inputs list is empty), every other node has an incoming edge, and there is no cycle. Use short unique ids such as "n1". Only set config fields listed above; leave secrets such as webhook URLs empty for the user to fill in.
A mini-app with a form MUST get at least one add_test scenario (two when it branches) with concrete answers and expected screens or values from the user's request; include boundary cases. A non-mini-app flow may get a test with triggerNodeId and payload. Use actual node ids.
When the request is a question or asks for an explanation, answer in prose and call no tool. When you need one clarification before you can build anything, call ask_user and stop. After a turn that changed the flow, call suggest_next once with up to three follow-ups.
Write your answer for the user in short Markdown: what you did or found, and anything they must fill in. Never paste JSON of the flow. The user decides what lands on the canvas.`;
```

Also export the user-turn builder:

```ts
export function userTurn(
  text: string,
  current: FlowDocumentInput | undefined,
  context: AiContext | undefined,
): string {
  const sections: string[] = [];
  if (current)
    sections.push(
      `Current flow as JSON:\n${JSON.stringify(withoutPositions(current))}\nChange it with the tools, keeping everything else (ids included) unless the request requires otherwise.`,
    );
  else sections.push("The canvas is empty: design a new flow with the tools.");
  if (context?.selection?.length) sections.push(`Selected nodes: ${context.selection.join(", ")}`);
  if (context?.problems?.length)
    sections.push(
      `The builder reports these problems:\n${context.problems
        .map(
          (problem) =>
            `- [${problem.severity}] ${problem.nodeId ? `${problem.nodeId}: ` : ""}${problem.message}`,
        )
        .join("\n")}`,
    );
  if (context?.run) sections.push(describeRun(context.run));
  sections.push(`Request: ${text}`);
  return sections.join("\n\n");
}
```

`describeRun` is the old `explain-run.ts` formatting: results in execution order, outputs cut to 600 characters, then "Explain node <id>" (the named one, else the first failed node, else the run-wide error), and "If the fix is a config or wiring change, make it with the tools; otherwise explain the cause and one concrete fix." Take the text from git history of `explain-run.ts` (`git show main:apps/api/src/ai/explain-run.ts`).

- [x] **Step 5: Write the agent**

`apps/api/src/ai/canvas-agent.ts`:

```ts
import {
  aiErrorDetail,
  aiFlowTestSchema,
  Value,
  type AiContext,
  type AiMessage,
  type AiPart,
  type AiStreamEvent,
  type AiVerification,
  type FlowDocumentInput,
} from "@automator/contracts";
import { LanguageModelError, type ChatMessage, type LanguageModel } from "@automator/flow-engine";
import { requestBudgetMs, withRequestDeadline } from "./client";
import { FlowGenerationError, materialize, type AiDataTable } from "./draft";
import { systemPrompt, userTurn } from "./prompt";
import { canvasTools } from "./tools";
import {
  FlowTestError,
  maxTestScenarios,
  verificationBudgetMs,
  VerificationTimeoutError,
  verifyFlow,
} from "./verify-flow";
import { ToolCallError, WorkingCopy } from "./working-copy";

export const maxToolCalls = 40;
const historyMessages = 12;
const historyTextLength = 1500;

export interface CanvasAgentInput {
  model: LanguageModel;
  text: string;
  current?: FlowDocumentInput;
  context?: AiContext;
  history: readonly AiMessage[];
  tables?: readonly AiDataTable[];
  emit(event: AiStreamEvent): void;
  signal?: AbortSignal;
  deadlineAt?: number;
  verificationBudget?: number;
}

/** Earlier turns as the model saw them: text, tool calls and their results; never a proposal. */
export function historyToMessages(history: readonly AiMessage[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const message of history.slice(-historyMessages)) {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .slice(0, historyTextLength);
    const tools = message.parts.filter((part) => part.type === "tool");
    if (message.role === "user") {
      messages.push({ role: "user", content: text });
      continue;
    }
    messages.push({
      role: "assistant",
      content: text,
      ...(tools.length
        ? {
            toolCalls: tools.map((tool) => ({
              id: tool.id,
              name: tool.name,
              arguments: tool.args,
            })),
          }
        : {}),
    });
    for (const tool of tools)
      messages.push({ role: "tool", toolCallId: tool.id, content: tool.detail ?? "" });
  }
  return messages;
}

async function checkFlow(
  document: FlowDocumentInput,
  tests: unknown,
  budgetMs: number,
  deadlineAt: number,
  tables: readonly AiDataTable[],
): Promise<AiVerification> {
  const deadline = Math.min(Date.now() + budgetMs, deadlineAt);
  try {
    return await verifyFlow(document, tests, deadline, tables);
  } catch (error) {
    if (!(error instanceof FlowTestError))
      throw new FlowGenerationError(
        error instanceof Error ? error.message : "Automatic checks failed",
      );
    const unusable =
      error instanceof VerificationTimeoutError
        ? `The automatic checks did not finish in time: ${error.message}`
        : `The model's own test scenarios could not be used: ${error.message}`;
    if (Date.now() >= deadline) return { checks: [], warnings: [unusable] };
    try {
      const fallback = await verifyFlow(document, undefined, deadline, tables);
      return { ...fallback, warnings: [...fallback.warnings, unusable] };
    } catch (fallbackError) {
      if (!(fallbackError instanceof FlowTestError))
        throw new FlowGenerationError(
          fallbackError instanceof Error ? fallbackError.message : "Automatic checks failed",
        );
      return { checks: [], warnings: [unusable] };
    }
  }
}

export async function runCanvasAgent(input: CanvasAgentInput): Promise<AiPart[]> {
  const deadlineAt = input.deadlineAt ?? Date.now() + requestBudgetMs;
  const ask = withRequestDeadline(input.model, deadlineAt);
  const tables = input.tables ?? [];
  const copy = new WorkingCopy(input.current);
  const parts: AiPart[] = [];
  const tests: unknown[] = [];
  let text = "";
  let calls = 0;
  let asked = false;
  let repaired = false;

  const emit = input.emit;
  const pushText = (content: string | null) => {
    if (!content) return;
    text += (text ? "\n\n" : "") + content;
    emit({ type: "text.delta", delta: content });
  };
  const flushText = () => {
    if (text) parts.push({ type: "text", text });
    text = "";
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(tables) },
    ...historyToMessages(input.history),
    { role: "user", content: userTurn(input.text, input.current, input.context) },
  ];

  const execute = (name: string, args: Record<string, unknown>): string => {
    switch (name) {
      case "add_node":
        return copy.addNode(args);
      case "update_node":
        return copy.updateNode(args);
      case "remove_node":
        return copy.removeNode(args);
      case "connect":
        return copy.connect(args);
      case "disconnect":
        return copy.disconnect(args);
      case "set_flow":
        return copy.setFlow(args);
      case "add_test": {
        if (!Value.Check(aiFlowTestSchema, args))
          throw new ToolCallError(
            "The test does not match the scenario shape: name, optional triggerNodeId/payload/answers, and expect[]",
          );
        if (tests.length >= maxTestScenarios)
          throw new ToolCallError(`At most ${maxTestScenarios} test scenarios`);
        tests.push(args);
        return `Added test "${args.name}"`;
      }
      case "ask_user": {
        const options = Array.isArray(args.options)
          ? args.options.filter((o) => typeof o === "string").slice(0, 4)
          : [];
        if (typeof args.question !== "string" || !args.question.trim())
          throw new ToolCallError("ask_user needs a question");
        asked = true;
        flushText();
        parts.push({ type: "question", text: args.question.trim(), options });
        return "Asked. Wait for the user's answer.";
      }
      case "suggest_next": {
        const items = Array.isArray(args.items)
          ? args.items.filter((i) => typeof i === "string").slice(0, 3)
          : [];
        if (items.length === 0) throw new ToolCallError("suggest_next needs at least one item");
        // Kept apart from the running text so it renders as chips after everything else.
        parts.push({ type: "suggestions", items });
        return "Noted.";
      }
      default:
        throw new ToolCallError(`Unknown tool "${name}"`);
    }
  };

  const loop = async (): Promise<void> => {
    for (;;) {
      input.signal?.throwIfAborted();
      const answer = await ask({ messages, tools: canvasTools, temperature: 0.2 });
      pushText(answer.content);
      if (answer.toolCalls.length === 0) return;
      messages.push({
        role: "assistant",
        content: answer.content ?? "",
        toolCalls: answer.toolCalls,
      });
      for (const call of answer.toolCalls) {
        if (calls >= maxToolCalls)
          throw new FlowGenerationError(
            `The agent stopped after ${maxToolCalls} tool calls without finishing`,
          );
        calls += 1;
        emit({ type: "tool.call", id: call.id, name: call.name, args: call.arguments });
        let ok = true;
        let detail: string;
        const before = copy.changed;
        try {
          detail = execute(call.name, call.arguments);
        } catch (error) {
          if (!(error instanceof ToolCallError)) throw error;
          ok = false;
          detail = error.message;
        }
        const mutated =
          ok &&
          ["add_node", "update_node", "remove_node", "connect", "disconnect", "set_flow"].includes(
            call.name,
          );
        emit({
          type: "tool.result",
          id: call.id,
          ok,
          detail,
          ...(mutated ? { document: copy.toPreview() } : {}),
        });
        if (call.name !== "ask_user" && call.name !== "suggest_next")
          parts.push({
            type: "tool",
            id: call.id,
            name: call.name,
            args: call.arguments,
            ok,
            detail,
          });
        messages.push({ role: "tool", toolCallId: call.id, content: detail });
        void before;
        if (asked) return;
      }
      const suggestions = parts.find((part) => part.type === "suggestions");
      if (suggestions) emit({ type: "suggestions", items: suggestions.items });
    }
  };

  try {
    await loop();
    if (asked) {
      const question = parts.find((part) => part.type === "question")!;
      emit({ type: "question", text: question.text, options: question.options });
      flushText();
      return orderParts(parts);
    }
    if (!copy.changed) {
      flushText();
      return orderParts(parts);
    }
    emit({ type: "status", phase: "checking" });
    let document: FlowDocumentInput | undefined;
    let problem: string | undefined;
    try {
      document = materialize(copy.toDraft(), tables);
    } catch (error) {
      if (!(error instanceof FlowGenerationError)) throw error;
      problem = error.message;
    }
    if (problem !== undefined && !repaired) {
      repaired = true;
      emit({ type: "status", phase: "repairing", detail: problem });
      messages.push({
        role: "user",
        content: `That is not a valid flow yet: ${problem}. Fix it with the tools, keeping ids, then stop.`,
      });
      await loop();
      emit({ type: "status", phase: "checking" });
      try {
        document = materialize(copy.toDraft(), tables);
        problem = undefined;
      } catch (error) {
        if (!(error instanceof FlowGenerationError)) throw error;
        problem = error.message;
      }
    }
    flushText();
    const replaces = input.current === undefined;
    if (document === undefined) {
      /* A visible fault on the canvas beats a lost draft: offer the preview with a failed check. */
      const draft = copy.toPreview();
      const verification: AiVerification = {
        checks: [
          {
            name: "Automatic checks",
            status: "failed",
            detail: aiErrorDetail(problem ?? "") ?? "The checks did not pass.",
          },
        ],
        warnings: [
          "This draft did not pass its automatic checks. Fix it on the canvas and do not turn the flow on until it passes.",
        ],
      };
      emit({ type: "proposal", document: draft, verification, replaces });
      parts.push({ type: "proposal", document: draft, verification, replaces, state: "pending" });
      return orderParts(parts);
    }
    const verification = await checkFlow(
      document,
      tests.length ? tests : undefined,
      input.verificationBudget ?? verificationBudgetMs,
      deadlineAt,
      tables,
    );
    emit({ type: "proposal", document, verification, replaces });
    parts.push({ type: "proposal", document, verification, replaces, state: "pending" });
    return orderParts(parts);
  } catch (error) {
    if (error instanceof LanguageModelError) throw error;
    flushText();
    const detail = aiErrorDetail(error instanceof Error ? error.message : String(error));
    const code =
      error instanceof FlowGenerationError ? ("invalid_flow" as const) : ("unavailable" as const);
    emit({ type: "error", error: code, ...(detail ? { detail } : {}) });
    parts.push({ type: "error", error: code, ...(detail ? { detail } : {}) });
    return orderParts(parts);
  }
}

/** Text first, then tools in order, then question, proposal and suggestions: the render order. */
function orderParts(parts: AiPart[]): AiPart[] {
  const rank: Record<AiPart["type"], number> = {
    text: 0,
    tool: 1,
    question: 2,
    proposal: 3,
    suggestions: 4,
    error: 5,
  };
  return [...parts].sort((a, b) => rank[a.type] - rank[b.type]);
}
```

Note on `orderParts`: `Array.prototype.sort` is stable in Bun, so tools keep their call order. Remove the `before`/`void before` lines; they are scaffolding. The `LanguageModelError` for a `timeout` propagates to the route, which answers an `error` event with `unavailable` (Task 6).

- [x] **Step 6: Run the tests**

Run: `bun test apps/api/src/ai/canvas-agent.test.ts`
Expected: PASS. If `materialize` rejects the two-node Discord flow for a reason other than a missing trigger (for example a required config field), read the error and adjust the fixture's config, not the assertion.

- [x] **Step 7: Checkpoint**

Proposed message: `feat(api): build flows with a tool-calling canvas agent`.

---

### Task 6: SSE routes for the conversation

**Files:**

- Create: `apps/api/src/ai/sse.ts`
- Create: `apps/api/src/ai/sse.test.ts`
- Rewrite: `apps/api/src/ai/routes.ts`
- Rewrite: `apps/api/src/ai/routes.test.ts`
- Modify: `apps/api/src/app.ts` (pass `flows` and `aiMessages` to `createAiRoutes`; `AppDependencies` gains `aiMessages?: AiMessageStore`)
- Modify: `apps/api/src/index.ts` (`aiMessages: database.aiMessages`)

**Interfaces:**

- Consumes: `runCanvasAgent` (Task 5), `AiMessageStore` (Task 2), `FlowStore.find(ownerId, id)`, `redactFlowSecrets`, contracts (Task 1).
- Produces:

  ```ts
  export function encodeSseEvent(event: AiStreamEvent): string; // `data: <json>\n\n`
  export interface AiDependencies {
    identity: IdentityProvider | undefined;
    model: LanguageModel | undefined;
    flows: Pick<FlowStore, "find">;
    messages: AiMessageStore;
    dataTables?: Pick<DataTableStore, "list">;
    log?: boolean;
    callsPerMinute?: number;
    now?: () => number;
    newId?: () => string;
  }
  export function createAiRoutes(deps: AiDependencies): Elysia;
  ```

- [x] **Step 1: SSE encoder test and implementation**

`apps/api/src/ai/sse.test.ts`:

```ts
import { expect, test } from "bun:test";
import { encodeSseEvent } from "./sse";

test("one event is one data frame", () => {
  expect(encodeSseEvent({ type: "text.delta", delta: "a\nb" })).toBe(
    'data: {"type":"text.delta","delta":"a\\nb"}\n\n',
  );
});
```

`apps/api/src/ai/sse.ts`:

```ts
import type { AiStreamEvent } from "@automator/contracts";

/** JSON never contains a raw newline, so one `data:` line per event is enough. */
export function encodeSseEvent(event: AiStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
```

Run `bun test apps/api/src/ai/sse.test.ts`: PASS.

- [x] **Step 2: Write the failing route tests**

Replace `apps/api/src/ai/routes.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import {
  aiStreamEventSchema,
  clearAiMessagesContract,
  listAiMessagesContract,
  sendAiMessageContract,
  setAiProposalStateContract,
  Value,
  type AiMessage,
  type AiStreamEvent,
  type FlowRecord,
} from "@automator/contracts";
import type { AiMessageStore } from "@automator/db";
import { scriptedModel, type ChatResponse, type LanguageModel } from "@automator/flow-engine";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import { createAiRoutes } from "./routes";

const identity: IdentityProvider = {
  verify: async (token) => (token === "alice" ? { id: "did:privy:alice", expiresAt: 2e9 } : null),
  walletAddress: async () => null,
};

const flowRecord: FlowRecord = {
  flow: { version: 1, id: "f1", name: "Ping", description: "", nodes: [], edges: [] },
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
  enabled: false,
};

function memoryMessages(): AiMessageStore & { rows: Map<string, AiMessage[]> } {
  const rows = new Map<string, AiMessage[]>();
  const of = (flowId: string) => rows.get(flowId) ?? [];
  return {
    rows,
    async list(flowId) {
      return of(flowId);
    },
    async append(flowId, message) {
      const stored = { ...message, createdAt: new Date().toISOString() };
      rows.set(flowId, [...of(flowId), stored]);
      return stored;
    },
    async setProposalState(flowId, messageId, state) {
      const message = of(flowId).find((m) => m.id === messageId);
      if (!message) return null;
      message.parts = message.parts.map((p) => (p.type === "proposal" ? { ...p, state } : p));
      return message;
    },
    async markPendingStale(flowId) {
      for (const message of of(flowId))
        message.parts = message.parts.map((p) =>
          p.type === "proposal" && p.state === "pending" ? { ...p, state: "stale" } : p,
        );
    },
    async clear(flowId) {
      const had = of(flowId).length > 0;
      rows.delete(flowId);
      return had;
    },
  };
}

const flows = {
  find: async (ownerId: string, id: string) =>
    ownerId === "did:privy:alice" && id === "f1" ? flowRecord : null,
};

function fixture(model: LanguageModel | undefined, options: { callsPerMinute?: number } = {}) {
  const messages = memoryMessages();
  let n = 0;
  const app = new Elysia().use(
    createAiRoutes({ identity, model, flows, messages, newId: () => `id${(n += 1)}`, ...options }),
  );
  const call = (
    method: string,
    path: string,
    body?: unknown,
    token: string | undefined = "alice",
  ) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  return { app, messages, call };
}

async function readEvents(response: Response): Promise<AiStreamEvent[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => JSON.parse(frame.slice(6)) as AiStreamEvent);
}

const turns: ChatResponse[] = [
  {
    content: "Adding a trigger.",
    toolCalls: [
      {
        id: "c1",
        name: "add_node",
        arguments: { id: "t", type: "trigger.manual", label: "Run", config: {} },
      },
    ],
  },
  { content: "Done.", toolCalls: [] },
];

describe("ai routes", () => {
  test("streams a turn and stores both messages", async () => {
    const { model } = scriptedModel(turns);
    const { call, messages } = fixture(model);
    const response = await call("POST", "/flows/f1/ai/messages", {
      text: "Make a trigger",
      context: { selection: [] },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const events = await readEvents(response);
    for (const event of events)
      expect(Value.Check(aiStreamEventSchema, event), JSON.stringify(event)).toBe(true);
    expect(events[0]).toEqual({ type: "message", id: "id2" });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(events.some((event) => event.type === "proposal")).toBe(true);

    const stored = messages.rows.get("f1")!;
    expect(stored.map((message) => [message.id, message.role])).toEqual([
      ["id1", "user"],
      ["id2", "assistant"],
    ]);
    expect(stored[0]!.parts).toEqual([{ type: "text", text: "Make a trigger" }]);
    expect(stored[1]!.parts.at(-1)).toMatchObject({ type: "proposal", state: "pending" });
  });

  test("lists, patches a proposal and clears", async () => {
    const { model } = scriptedModel(turns);
    const { call } = fixture(model);
    await call("POST", "/flows/f1/ai/messages", { text: "Make a trigger" });
    const listed = await call("GET", "/flows/f1/ai/messages");
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { messages: AiMessage[] };
    expect(body.messages).toHaveLength(2);

    const patched = await call("PATCH", "/flows/f1/ai/messages/id2", { state: "applied" });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { message: AiMessage }).message.parts.at(-1)).toMatchObject({
      state: "applied",
    });
    expect((await call("PATCH", "/flows/f1/ai/messages/nope", { state: "applied" })).status).toBe(
      404,
    );

    const cleared = await call("DELETE", "/flows/f1/ai/messages");
    expect(await cleared.json()).toEqual({ cleared: true });
    expect(
      ((await (await call("GET", "/flows/f1/ai/messages")).json()) as { messages: AiMessage[] })
        .messages,
    ).toEqual([]);
  });

  test("a new message supersedes pending proposals", async () => {
    const { model } = scriptedModel([...turns, ...turns]);
    const { call, messages } = fixture(model);
    await call("POST", "/flows/f1/ai/messages", { text: "one" });
    await call("POST", "/flows/f1/ai/messages", { text: "two" });
    const stored = messages.rows.get("f1")!;
    expect(stored[1]!.parts.at(-1)).toMatchObject({ state: "stale" });
    expect(stored[3]!.parts.at(-1)).toMatchObject({ state: "pending" });
  });

  test("enforces ownership, auth, the model and the rate limit", async () => {
    const { model } = scriptedModel([]);
    const { call } = fixture(model, { callsPerMinute: 1 });
    expect((await call("GET", "/flows/f2/ai/messages")).status).toBe(404);
    expect((await call("GET", "/flows/f1/ai/messages", undefined, undefined)).status).toBe(401);
    expect((await call("GET", "/flows/f1/ai/messages")).status).toBe(200);
    expect((await call("GET", "/flows/f1/ai/messages")).status).toBe(429);

    const noModel = fixture(undefined);
    expect((await noModel.call("POST", "/flows/f1/ai/messages", { text: "hi" })).status).toBe(503);
    expect((await noModel.call("POST", "/flows/f1/ai/messages", { text: "" })).status).toBe(400);
  });

  test("a model failure mid-stream becomes an error event and a stored error part", async () => {
    const model: LanguageModel = async () => {
      throw new (await import("@automator/flow-engine")).LanguageModelError("upstream", "boom");
    };
    const { call, messages } = fixture(model);
    const events = await readEvents(await call("POST", "/flows/f1/ai/messages", { text: "hi" }));
    expect(events.at(-2)).toEqual({ type: "error", error: "unavailable" });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(messages.rows.get("f1")![1]!.parts).toEqual([{ type: "error", error: "unavailable" }]);
  });
});
```

Check the exact `FlowRecord` shape in `packages/contracts/src/flows.ts` (`flowRecordSchema`) and fix the fixture if fields differ (`enabled`, `appPublished`, `webhookToken`).

- [x] **Step 3: Run to verify failure**

Run: `bun test apps/api/src/ai/routes.test.ts`
Expected: FAIL (imports of the old contracts).

- [x] **Step 4: Rewrite the routes**

`apps/api/src/ai/routes.ts`:

```ts
import {
  clearAiMessagesContract,
  listAiMessagesContract,
  redactFlowSecrets,
  redactRunOutputs,
  sendAiMessageContract,
  setAiProposalStateContract,
  Type,
  Value,
  type AiContext,
  type AiMessage,
  type AiPart,
  type AiStreamEvent,
} from "@automator/contracts";
import type { AiMessageStore, DataTableStore, FlowStore } from "@automator/db";
import { LanguageModelError, type LanguageModel } from "@automator/flow-engine";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";
import { runCanvasAgent } from "./canvas-agent";
import { encodeSseEvent } from "./sse";

export interface AiDependencies {
  identity: IdentityProvider | undefined;
  model: LanguageModel | undefined;
  flows: Pick<FlowStore, "find">;
  messages: AiMessageStore;
  dataTables?: Pick<DataTableStore, "list">;
  log?: boolean;
  callsPerMinute?: number;
  now?: () => number;
  newId?: () => string;
}

export function createAiRoutes({
  identity,
  model,
  flows,
  messages,
  dataTables,
  log = false,
  callsPerMinute = defaultRateLimits.ai,
  now = Date.now,
  newId = () => crypto.randomUUID(),
}: AiDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  return new Elysia({ name: "ai" })
    .use(createAuthGuard(identity))
    .onBeforeHandle(({ claims, set, status }) => {
      if (limiter.allow(claims.id)) return;
      set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
      return status(429, { error: "rate_limited" });
    })
    .get(
      listAiMessagesContract.path,
      async ({ claims, params, status }) => {
        if (!(await flows.find(claims.id, params.id))) return status(404, { error: "not_found" });
        return { messages: await messages.list(params.id) };
      },
      { params: listAiMessagesContract.params, response: listAiMessagesContract.response },
    )
    .post(
      sendAiMessageContract.path,
      async ({ claims, params, body, status, request }) => {
        if (!Value.Check(sendAiMessageContract.body, body))
          return status(400, { error: "invalid_request" });
        if (!model) return status(503, { error: "unavailable" });
        const record = await flows.find(claims.id, params.id);
        if (!record) return status(404, { error: "not_found" });
        const { id: _id, ...saved } = record.flow;
        // The builder already blanks secret fields; doing it here too keeps them off the model.
        const current = redactFlowSecrets(body.document ?? saved);
        const context: AiContext | undefined = body.context && {
          ...body.context,
          ...(body.context.run ? { run: redactRunOutputs(body.context.run) } : {}),
        };
        const tables = dataTables ? await dataTables.list(claims.id) : [];
        const history = await messages.list(params.id);
        await messages.markPendingStale(params.id);
        await messages.append(params.id, {
          id: newId(),
          role: "user",
          parts: [{ type: "text", text: body.text }],
          ...(context ? { context } : {}),
        });
        const assistantId = newId();
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const emit = (event: AiStreamEvent) =>
              controller.enqueue(encoder.encode(encodeSseEvent(event)));
            emit({ type: "message", id: assistantId });
            let parts: AiPart[];
            try {
              parts = await runCanvasAgent({
                model,
                text: body.text,
                // An empty canvas is a new flow; the model gets no document to edit.
                current: current.nodes.length === 0 ? undefined : current,
                context,
                history,
                tables,
                emit,
                signal: request.signal,
              });
            } catch (error) {
              if (log)
                console.warn("AI turn failed", error instanceof Error ? error.message : error);
              const part: AiPart = { type: "error", error: "unavailable" };
              if (!(error instanceof LanguageModelError) && !request.signal.aborted) {
                controller.error(error);
                return;
              }
              emit(part);
              parts = [part];
            }
            try {
              await messages.append(params.id, { id: assistantId, role: "assistant", parts });
            } catch (error) {
              if (log)
                console.warn(
                  "AI message not stored",
                  error instanceof Error ? error.message : error,
                );
            }
            emit({ type: "done" });
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
          },
        });
      },
      /* No response schema: the 200 is a stream, and Elysia would try to validate it as JSON. */
      { params: sendAiMessageContract.params, body: Type.Unknown() },
    )
    .patch(
      setAiProposalStateContract.path,
      async ({ claims, params, body, status }) => {
        if (!Value.Check(setAiProposalStateContract.body, body))
          return status(400, { error: "invalid_request" });
        if (!(await flows.find(claims.id, params.id))) return status(404, { error: "not_found" });
        const message = await messages.setProposalState(params.id, params.messageId, body.state);
        if (!message) return status(404, { error: "not_found" });
        return { message };
      },
      {
        params: setAiProposalStateContract.params,
        body: Type.Unknown(),
        response: setAiProposalStateContract.response,
      },
    )
    .delete(
      clearAiMessagesContract.path,
      async ({ claims, params, status }) => {
        if (!(await flows.find(claims.id, params.id))) return status(404, { error: "not_found" });
        return { cleared: await messages.clear(params.id) };
      },
      { params: clearAiMessagesContract.params, response: clearAiMessagesContract.response },
    );
}
```

Two details to verify while writing: the route's `request` is Elysia's `Request` (its `signal` aborts when the client disconnects); and `redactRunOutputs`'s generic must accept `AiRunContext` (Task 1 changed it). `FlowStore.find` returns `FlowRecord | null` where `record.flow` is a `FlowDocument` (with `id`); the destructuring above strips it.

- [x] **Step 5: Wire the app**

In `apps/api/src/app.ts`: add `aiMessages?: AiMessageStore;` to `AppDependencies` (import the type from `@automator/db`), destructure it in `createApp`, and change the `createAiRoutes` call to:

```ts
    .use(
      flows && aiMessages
        ? createAiRoutes({ identity, model, flows, messages: aiMessages, dataTables, log, callsPerMinute: limits.ai })
        : new Elysia({ name: "ai" }),
    )
```

(Look at how the file guards other optional stores, for example the data routes at the `dataTables && dataRecords && flows` line, and copy that shape.) In `apps/api/src/index.ts` pass `aiMessages: database.aiMessages`.

- [x] **Step 6: Run the tests and the API typecheck**

Run: `bun test apps/api/src/ai` then `bun run typecheck --filter=@automator/api`
Expected: PASS and clean. `bun run typecheck` for the whole repo is still red in `apps/web` until Task 9.

- [x] **Step 7: Checkpoint**

Proposed message: `feat(api): stream AI turns per flow and store the conversation`.

---

### Task 7: `AI_SCRIPTED_MODEL` for end-to-end runs

**Files:**

- Modify: `apps/api/src/config.ts` (`aiScriptedModel: boolean`, refused in production)
- Create: `apps/api/src/ai/scripted.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/config.test.ts` (if it exists; else add the assertion to whichever test covers `readConfig`)

**Interfaces:**

- Produces: `createScriptedCanvasModel(): LanguageModel` — a model that, for any request, answers a two-node manual-trigger → Discord flow through tool calls and then "Done.".

- [x] **Step 1: Test the config guard**

Add to the config test:

```ts
test("AI_SCRIPTED_MODEL is refused in production", () => {
  expect(() => readConfig({ ...base, NODE_ENV: "production", AI_SCRIPTED_MODEL: "1" })).toThrow(
    /AI_SCRIPTED_MODEL/,
  );
  expect(readConfig({ ...base, AI_SCRIPTED_MODEL: "1" }).aiScriptedModel).toBe(true);
  expect(readConfig({ ...base }).aiScriptedModel).toBe(false);
});
```

(`base` is whatever minimal env the existing tests use.)

- [x] **Step 2: Implement**

`config.ts`: beside the `E2E_TEST_TOKEN` guard add `if (env.AI_SCRIPTED_MODEL && env.NODE_ENV === "production") throw new Error("AI_SCRIPTED_MODEL must not be set in production");` and `aiScriptedModel: env.AI_SCRIPTED_MODEL === "1",` in the returned object and the `ApiConfig` interface.

`apps/api/src/ai/scripted.ts`:

```ts
import type { LanguageModel } from "@automator/flow-engine";

/** A model for end-to-end tests: every conversation gets the same two-node flow. */
export function createScriptedCanvasModel(): LanguageModel {
  return async (request) => {
    const built = request.messages.some((message) => message.role === "tool");
    if (built)
      return { content: "Done. Fill in the Discord webhook URL before running it.", toolCalls: [] };
    return {
      content: "Adding a manual trigger and a Discord message.",
      toolCalls: [
        {
          id: "s1",
          name: "add_node",
          arguments: { id: "t", type: "trigger.manual", label: "Run", config: {} },
        },
        {
          id: "s2",
          name: "add_node",
          arguments: {
            id: "d",
            type: "notify.discord",
            label: "Post to Discord",
            config: { content: "Hello from Automator" },
          },
        },
        {
          id: "s3",
          name: "connect",
          arguments: { source: "t", sourceHandle: "run", target: "d", targetHandle: "message" },
        },
      ],
    };
  };
}
```

`index.ts`: `const model = config.aiScriptedModel ? createScriptedCanvasModel() : <existing expression>;`.

- [x] **Step 3: Run**

Run: `bun test apps/api/src/config.test.ts && bun run typecheck --filter=@automator/api`
Expected: PASS.

---

### Task 8: Streamed model text (`onText`)

**Files:**

- Modify: `packages/flow-engine/src/language-model.ts` (`onText?: (delta: string) => void` on `ChatRequest`)
- Modify: `apps/api/src/ai/client.ts` (when `request.onText` is set, send `stream: true`, parse the SSE chunks, call `onText` per content delta, assemble tool calls from the deltas, and return the same `ChatResponse`)
- Modify: `apps/api/src/ai/client.test.ts` (one streamed test)
- Modify: `apps/api/src/ai/canvas-agent.ts` (pass `onText`, emit `text.delta` per delta instead of once per turn)
- Modify: `apps/api/src/ai/canvas-agent.test.ts` (the prose-only test asserts the joined deltas, not a single event)

**Interfaces:**

- `scriptedModel` ignores `onText`, so every existing test keeps working; the agent falls back to one delta per turn when the model never calls `onText` (it checks whether any delta arrived before pushing the whole `content`).

- [x] **Step 1: Write the failing client test**

In `client.test.ts`, next to the existing fetch-stubbing tests, add:

```ts
test("streams content deltas and assembles tool calls when onText is given", async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"add_node","arguments":"{\\"id\\":"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"t\\"}"}}]}}]}\n\n',
    "data: [DONE]\n\n",
  ];
  const fetcher: typeof fetch = async (_url, init) => {
    expect(JSON.parse(String(init?.body)).stream).toBe(true);
    return new Response(
      new ReadableStream({
        start(c) {
          for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
          c.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  };
  const model = createOpenAiModel({ apiKey: "k", model: "m", fetcher })!;
  const deltas: string[] = [];
  const answer = await model({
    messages: [{ role: "user", content: "hi" }],
    onText: (d) => deltas.push(d),
  });
  expect(deltas).toEqual(["Hel", "lo"]);
  expect(answer.content).toBe("Hello");
  expect(answer.toolCalls).toEqual([{ id: "c1", name: "add_node", arguments: { id: "t" } }]);
});
```

- [x] **Step 2: Run it**

Run: `bun test apps/api/src/ai/client.test.ts -t "streams content"`
Expected: FAIL (`stream` is not sent; body is read as JSON).

- [x] **Step 3: Implement streaming in the client**

In `createChatCompletionsModel`, when `request.onText` is defined: add `stream: true` to the wire body; after `response.ok`, read `response.body` with a `TextDecoder`, split on `\n\n`, take lines starting with `data: `, stop at `[DONE]`, `JSON.parse` each, and for `choices[0].delta`: append `content` (calling `request.onText`) and merge `tool_calls` by `index` (first chunk carries `id`, `function.name`; later ones append `function.arguments`). At the end build the `ChatResponse` through the existing `fromWire` for each assembled call (so invalid calls raise the same `invalid_response`). Keep the timeout: the existing `AbortController` still bounds the whole read. Non-streaming path unchanged.

In `language-model.ts` add to `ChatRequest`: `/** Called with each content delta when the provider streams; absent, the answer arrives whole. */ onText?: (delta: string) => void;`. `structuredClone` in `scriptedModel` cannot copy a function: strip `onText` before cloning (`const { onText: _onText, ...rest } = request; requests.push(structuredClone(rest));`).

- [x] **Step 4: Use it in the agent**

In `runCanvasAgent`, replace the `ask({...})` call with:

```ts
let streamed = false;
const answer = await ask({
  messages,
  tools: canvasTools,
  temperature: 0.2,
  onText: (delta) => {
    streamed = true;
    text += delta;
    emit({ type: "text.delta", delta });
  },
});
if (!streamed) pushText(answer.content);
else if (answer.content) text += ""; // already accumulated by deltas
```

Make `pushText` insert the `\n\n` separator only when `text` is non-empty and does not already end with whitespace, and apply the same rule before the first streamed delta of a later hop (emit a `text.delta` with `"\n\n"` when `text` is non-empty at hop start). Update the prose-only agent test to join deltas: `expect(events.filter(e => e.type === "text.delta").map(e => e.delta).join("")).toBe("This flow posts to Discord when you run it.")`.

- [x] **Step 5: Run all API and engine tests**

Run: `bun test apps/api packages/flow-engine`
Expected: PASS.

- [x] **Step 6: Checkpoint**

Proposed message: `feat(api): stream model text into AI turns`.

---

### Task 9: Web transport and SSE reader

**Files:**

- Create: `apps/web/src/builder/ai/sse.ts`, `sse.test.ts`
- Create: `apps/web/src/builder/ai/transport.ts`, `transport.test.ts`
- Delete: `apps/web/src/builder/ai-client.ts` (its `describeAiFailure`, `AiRequestError`, `formatElapsed` move to `transport.ts` unchanged)

**Interfaces:**

- Produces:

  ```ts
  export function parseSseFrames(buffer: string): { events: AiStreamEvent[]; rest: string }; // throws AiRequestError("invalid_response") on a frame that fails the schema
  export class AiRequestError extends Error {
    code: string;
    detail?: string;
  }
  export function describeAiFailure(error: unknown): string;
  export function formatElapsed(seconds: number): string;
  export async function listAiMessages(token, flowId): Promise<AiMessage[]>;
  export async function sendAiMessage(
    token,
    flowId,
    body: SendAiMessageRequest,
    onEvent: (e: AiStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  export async function setAiProposalState(
    token,
    flowId,
    messageId,
    state: "applied" | "discarded",
  ): Promise<AiMessage>;
  export async function clearAiMessages(token, flowId): Promise<void>;
  ```

  All take `token: string | null` first, like the old client, and hit `publicApiUrl` (`apps/web/src/lib/api-url.ts`) with `buildPath(contract, params)`.

- [x] **Step 1: Failing SSE parser tests**

`sse.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseSseFrames } from "./sse";

describe("parseSseFrames", () => {
  test("splits complete frames and keeps the remainder", () => {
    const { events, rest } = parseSseFrames('data: {"type":"done"}\n\ndata: {"type":"text.delta","de');
    expect(events).toEqual([{ type: "done" }]);
    expect(rest).toBe('data: {"type":"text.delta","de');
  });
  test("ignores comments and blank frames", () => {
    expect(parseSseFrames(": keep-alive\n\n\n\ndata: {"type":"done"}\n\n').events).toEqual([{ type: "done" }]);
  });
  test("rejects a frame that is not an event", () => {
    expect(() => parseSseFrames('data: {"type":"nope"}\n\n')).toThrow(/invalid_response/);
  });
});
```

- [x] **Step 2: Implement `sse.ts` and move the client helpers into `transport.ts`**

```ts
// sse.ts
import { aiStreamEventSchema, Value, type AiStreamEvent } from "@automator/contracts";
import { AiRequestError } from "./transport";

export function parseSseFrames(buffer: string): { events: AiStreamEvent[]; rest: string } {
  const events: AiStreamEvent[] = [];
  let rest = buffer;
  for (;;) {
    const end = rest.indexOf("\n\n");
    if (end === -1) break;
    const frame = rest.slice(0, end);
    rest = rest.slice(end + 2);
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new AiRequestError("invalid_response", "The stream sent something that was not JSON.");
    }
    if (!Value.Check(aiStreamEventSchema, parsed))
      throw new AiRequestError(
        "invalid_response",
        "The stream sent an event this app does not know.",
      );
    events.push(parsed);
  }
  return { events, rest };
}
```

`transport.ts`: copy `AiRequestError`, `failureMessages` (add `invalid_response: "The AI stream was interrupted. Try again."`), `describeAiFailure`, `formatElapsed` and the private `post`/`failureDetail` helpers from `ai-client.ts`, then add:

```ts
export async function sendAiMessage(
  token: string | null,
  flowId: string,
  body: SendAiMessageRequest,
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const timeout = AbortSignal.timeout(aiRequestTimeoutMs + 5_000);
  const response = await fetch(
    `${publicApiUrl}${buildPath(sendAiMessageContract, { id: flowId })}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    },
  );
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => ({}));
    throw new AiRequestError(parseAuthError(data).error, failureDetail(data));
  }
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseFrames(buffer);
    buffer = rest;
    for (const event of events) onEvent(event);
  }
}
```

`listAiMessages`, `setAiProposalState`, `clearAiMessages` use the existing `post`-style helper generalised to a method (`request(contract, token, params, body?)`) and `parseResponse`. Check `AbortSignal.any` exists in the happy-dom test environment; if not, combine the two signals by hand with one `AbortController` and two listeners.

- [x] **Step 3: Transport test**

`transport.test.ts` stubs `globalThis.fetch` (the pattern in the old `ai-panel.test.tsx`) with a `Response` whose body is a `ReadableStream` of two chunks split mid-frame, and asserts `sendAiMessage` calls `onEvent` with every event in order and that a 429 throws `AiRequestError` with code `rate_limited`.

- [x] **Step 4: Run**

Run: `bun test apps/web/src/builder/ai/`
Expected: PASS.

---

### Task 10: The chat store and its reducer

**Files:**

- Create: `apps/web/src/builder/ai/apply-event.ts`, `apply-event.test.ts`
- Create: `apps/web/src/builder/ai/chat-store.ts`, `chat-store.test.ts`
- Create: `apps/web/src/builder/ai/chat-store-provider.tsx`
- Delete: `apps/web/src/builder/ai-store.ts`, `ai-store.test.ts`, `ai-store-provider.tsx`

**Interfaces:**

- Produces:

  ```ts
  // apply-event.ts
  export function applyEvent(message: AiMessage, event: AiStreamEvent): AiMessage; // pure; ignores "message" and "done"
  export function proposalOf(message: AiMessage): AiProposalPart | undefined;
  // chat-store.ts
  export type ChatContext = { selection: string[]; problems: FlowProblem[]; run?: AiRunContext };
  export type ChatState = {
    messages: AiMessage[];
    loaded: boolean;
    pending: boolean;
    streamingId: string | null;
    phase: AiStatusPhase | null;
    context: ChatContext;
    mode: "edit" | "new";
    focusRequests: number;
    draftPrompt: string | null; // text put into the composer by a chip or by "Something else"
    load(messages: AiMessage[]): void;
    begin(user: AiMessage): void;
    receive(event: AiStreamEvent): void;
    end(): void;
    fail(error: ApiErrorCode, detail?: string): void;
    setProposalState(messageId: string, state: AiProposalState): void;
    setContext(patch: Partial<ChatContext>): void;
    setMode(mode: "edit" | "new"): void;
    setDraftPrompt(text: string | null): void;
    requestFocus(): void;
    clear(): void;
  };
  export function createChatStore(options?: { focusOnMount?: boolean }): StoreApi<ChatState>;
  export function selectPendingProposal(
    state: ChatState,
  ): { messageId: string; proposal: AiProposalPart } | null;
  // chat-store-provider.tsx
  export function ChatStoreProvider({ children, focusOnMount }): JSX.Element;
  export function useChatStore<T>(selector: (state: ChatState) => T): T;
  export function useChatStoreApi(): StoreApi<ChatState>;
  ```

- [x] **Step 1: Reducer tests**

`apply-event.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { AiMessage } from "@automator/contracts";
import { applyEvent } from "./apply-event";

const empty: AiMessage = {
  id: "m",
  role: "assistant",
  parts: [],
  createdAt: "2026-09-11T00:00:00.000Z",
};
const document = { version: 1 as const, name: "Ping", description: "", nodes: [], edges: [] };

describe("applyEvent", () => {
  test("text deltas grow one text part", () => {
    let message = applyEvent(empty, { type: "text.delta", delta: "Hel" });
    message = applyEvent(message, { type: "text.delta", delta: "lo" });
    expect(message.parts).toEqual([{ type: "text", text: "Hello" }]);
  });
  test("a tool call opens a step and its result closes it", () => {
    let message = applyEvent(empty, {
      type: "tool.call",
      id: "c1",
      name: "add_node",
      args: { id: "t" },
    });
    expect(message.parts[0]).toEqual({
      type: "tool",
      id: "c1",
      name: "add_node",
      args: { id: "t" },
    });
    message = applyEvent(message, {
      type: "tool.result",
      id: "c1",
      ok: true,
      detail: "Added t",
      document,
    });
    expect(message.parts[0]).toMatchObject({ ok: true, detail: "Added t" });
  });
  test("text after a tool starts a new text part", () => {
    let message = applyEvent(empty, { type: "text.delta", delta: "One." });
    message = applyEvent(message, { type: "tool.call", id: "c1", name: "set_flow", args: {} });
    message = applyEvent(message, { type: "text.delta", delta: "Two." });
    expect(message.parts.map((part) => part.type)).toEqual(["text", "tool", "text"]);
  });
  test("question, proposal, suggestions and error become parts", () => {
    let message = applyEvent(empty, { type: "question", text: "Which?", options: ["A"] });
    message = applyEvent(message, {
      type: "proposal",
      document,
      verification: { checks: [], warnings: [] },
      replaces: true,
    });
    message = applyEvent(message, { type: "suggestions", items: ["Next"] });
    message = applyEvent(message, { type: "error", error: "unavailable" });
    expect(message.parts.map((part) => part.type)).toEqual([
      "question",
      "proposal",
      "suggestions",
      "error",
    ]);
    expect(message.parts[1]).toMatchObject({ state: "pending" });
  });
  test("message, status and done change nothing", () => {
    expect(applyEvent(empty, { type: "status", phase: "checking" })).toBe(empty);
    expect(applyEvent(empty, { type: "done" })).toBe(empty);
  });
});
```

- [x] **Step 2: Implement `apply-event.ts`**

```ts
import type { AiMessage, AiProposalPart, AiStreamEvent } from "@automator/contracts";

export function applyEvent(message: AiMessage, event: AiStreamEvent): AiMessage {
  const parts = message.parts;
  switch (event.type) {
    case "text.delta": {
      const last = parts.at(-1);
      if (last?.type === "text")
        return {
          ...message,
          parts: [...parts.slice(0, -1), { type: "text", text: last.text + event.delta }],
        };
      return { ...message, parts: [...parts, { type: "text", text: event.delta }] };
    }
    case "tool.call":
      return {
        ...message,
        parts: [...parts, { type: "tool", id: event.id, name: event.name, args: event.args }],
      };
    case "tool.result":
      return {
        ...message,
        parts: parts.map((part) =>
          part.type === "tool" && part.id === event.id
            ? { ...part, ok: event.ok, detail: event.detail }
            : part,
        ),
      };
    case "question":
      return {
        ...message,
        parts: [...parts, { type: "question", text: event.text, options: event.options }],
      };
    case "proposal":
      return {
        ...message,
        parts: [
          ...parts,
          {
            type: "proposal",
            document: event.document,
            verification: event.verification,
            replaces: event.replaces,
            state: "pending",
          },
        ],
      };
    case "suggestions":
      return { ...message, parts: [...parts, { type: "suggestions", items: event.items }] };
    case "error":
      return {
        ...message,
        parts: [
          ...parts,
          { type: "error", error: event.error, ...(event.detail ? { detail: event.detail } : {}) },
        ],
      };
    case "message":
    case "status":
    case "done":
      return message;
  }
}

export function proposalOf(message: AiMessage): AiProposalPart | undefined {
  return message.parts.find((part): part is AiProposalPart => part.type === "proposal");
}
```

- [x] **Step 3: Store tests**

`chat-store.test.ts` covers: `begin` appends the user message and sets `pending`; `receive({type:"message"})` appends an empty assistant message with that id and sets `streamingId`; `receive` routes other events through `applyEvent` onto the streaming message and `status` sets `phase`; `end` clears `pending`, `streamingId`, `phase`; `fail` appends an error part to the streaming message (creating one with a local id `local-<n>` when none exists) and ends; `begin` marks every pending proposal in earlier messages `stale`; `setProposalState` updates the named message; `selectPendingProposal` returns the last message's pending proposal only; `clear` empties messages and context except `selection`.

- [x] **Step 4: Implement `chat-store.ts` and the provider**

Zustand `createStore` like the old `ai-store.ts`; the provider is the old `ai-store-provider.tsx` renamed with `useChatStoreApi` added (mirror `store-provider.tsx`).

- [x] **Step 5: Run**

Run: `bun test apps/web/src/builder/ai/`
Expected: PASS.

---

### Task 11: Canvas preview

**Files:**

- Modify: `apps/web/src/builder/store.ts` (`preview`, `setPreview`, `onPreviewNodesChange`, `selectSelectedNodes`)
- Modify: `apps/web/src/builder/store.test.ts` (if present; else create `store.preview.test.ts`)
- Move: `diffNodes`, `diffConnections` from the old `ai-panel.tsx` into `apps/web/src/builder/ai/diff.ts` with their tests from `ai-panel.test.ts` into `diff.test.ts`
- Modify: `apps/web/src/builder/flow-canvas.tsx`, `flow-node.tsx`, `flow-builder.module.css`

**Interfaces:**

- Produces on `BuilderState`:

  ```ts
  preview: { document: FlowDocumentInput; nodes: BuilderNode[]; edges: BuilderEdge[]; kinds: ReadonlyMap<string, DraftKind> } | null;
  setPreview(document: FlowDocumentInput | null): void;
  onPreviewNodesChange(changes: NodeChange<BuilderNode>[]): void;   // select and dimensions only
  ```

  `export type DraftKind = "added" | "changed" | "removed" | "kept";` in `ai/diff.ts`, plus `diffNodes`, `diffConnections` as today, and `previewKinds(current: FlowDocument, next: FlowDocumentInput): Map<string, DraftKind>` (node ids and edge ids; removed nodes and edges come from `current`).
  `selectSelectedNodes(state)` returns from `state.preview?.nodes ?? state.nodes`.

- [x] **Step 1: Store tests**

```ts
test("preview hydrates the draft, marks kinds, and keeps the real document", () => {
  const store = createBuilderStore(document); // the two-node Ping document from the old panel test
  store
    .getState()
    .setPreview({ ...document, id: undefined, nodes: [document.nodes[0]!], edges: [] });
  const preview = store.getState().preview!;
  expect(preview.nodes.map((node) => node.id)).toEqual(["t", "d"]); // removed d is drawn too
  expect(preview.kinds.get("t")).toBe("kept");
  expect(preview.kinds.get("d")).toBe("removed");
  expect(store.getState().nodes).toHaveLength(2);
  store.getState().onPreviewNodesChange([{ type: "select", id: "t", selected: true }]);
  expect(selectSelectedNodes(store.getState()).map((node) => node.id)).toEqual(["t"]);
  store.getState().setPreview(null);
  expect(store.getState().preview).toBeNull();
});
```

- [x] **Step 2: Implement in `store.ts`**

`setPreview(document)`: `null` clears. Otherwise `const current = serializeFlow(state.meta, state.nodes, state.edges)`; `const kinds = previewKinds(current, document)`; hydrate `{ ...document, id: state.meta.id }` with `hydrateFlow`, append the removed nodes and edges from `state.nodes` / `state.edges` (with `selected: false`), and set `preview: { document, nodes, edges, kinds }`. `onPreviewNodesChange` applies `applyNodeChanges` filtered to `select` and `dimensions` to `preview.nodes`. Every other mutating action leaves `preview` alone.

- [x] **Step 3: Canvas and node**

In `flow-canvas.tsx`: read `preview`; `const shownNodes = preview?.nodes ?? nodes`, `shownEdges` from `preview?.edges ?? edges` (the run-status classes only when no preview; add `className: styles.edgeDraftAdded / edgeDraftRemoved` from `preview.kinds`). Pass `onNodesChange={preview ? onPreviewNodesChange : onNodesChange}`, `onEdgesChange={preview ? noop : onEdgesChange}`, `nodesDraggable={!preview}`, `nodesConnectable={!preview}`, `deleteKeyCode={preview ? null : ["Backspace", "Delete"]}`; return early from `onDrop` and `onConnectEnd` when `preview`. Provide `preview?.kinds ?? emptyMap` through a new `DraftKindsContext` (same pattern as `NodeProblemsContext`). Add a `useEffect` that calls `fitView({ padding: 0.2, duration: reducedMotion ? 0 : 300 })` debounced 150 ms whenever `preview?.nodes.length` changes.

In `flow-node.tsx`: `const draft = useContext(DraftKindsContext).get(id)`; add `data-draft={draft}` to the root `div`.

In `flow-builder.module.css` append:

```css
.node[data-draft="added"] {
  border-style: dashed;
  border-color: var(--chart-2);
}
.node[data-draft="changed"] {
  border-color: var(--chart-5);
}
.node[data-draft="removed"] {
  opacity: 0.45;
}
.node[data-draft="removed"] .nodeLabel {
  text-decoration: line-through;
}
.edgeDraftAdded path {
  stroke: var(--chart-2);
  stroke-dasharray: 6 4;
}
.edgeDraftRemoved path {
  stroke: var(--destructive-text);
  opacity: 0.45;
}
```

- [x] **Step 4: Run**

Run: `bun test apps/web/src/builder/store* apps/web/src/builder/ai/diff.test.ts && bun run typecheck --filter=@automator/web`
Expected: store tests PASS; typecheck still red only where `ai-panel.tsx` / `right-panels.tsx` / `run-panel.tsx` / `home/prompt.tsx` import deleted modules (Tasks 12 and 13).

---

### Task 12: The panel

**Files:**

- Create under `apps/web/src/builder/ai/`: `use-send-message.ts`, `use-ask-ai.ts`, `markdown.tsx`, `context-strip.tsx`, `composer.tsx`, `steps.tsx`, `proposal-card.tsx`, `message.tsx`, `panel.tsx`, `ask-ai-button.tsx`, `panel.module.css`, `panel.test.tsx`
- Modify: `apps/web/package.json` (add `"streamdown": "2.6.0"`, `"@streamdown/code": "1.1.1"`), then `bun install`
- Modify: `apps/web/src/app/globals.css` (add `@source "../../node_modules/streamdown/dist/*.js";` and `@source "../../node_modules/@streamdown/code/dist/*.js";` after the existing `@source` lines; verify the relative path resolves from `apps/web/src/app/` to the workspace root's `node_modules`, else use the path where `ls node_modules/streamdown/dist` finds the files)
- Modify: `apps/web/src/builder/right-panels.tsx` (import `AiPanel` from `./ai/panel`, `useChatStore` from `./ai/chat-store-provider`)
- Modify: `apps/web/src/builder/flow-builder.tsx` (`ChatStoreProvider` replaces `AiStoreProvider`)
- Delete: `apps/web/src/builder/ai-panel.tsx`, `ai-panel.module.css`, `ai-panel.test.ts`, `ai-panel.test.tsx`

**Interfaces:**

- `use-send-message.ts`: `useSendMessage(): { send(text: string): Promise<void>; stop(): void; apply(messageId: string): Promise<void>; discard(messageId: string): Promise<void>; startOver(): Promise<void> }`. `send` serialises the canvas, blanks secrets, builds `context` from the chat store (`selection`, `problems`, `run`), calls `chat.begin` with a local user message, streams with `sendAiMessage`, forwards each event to `chat.receive`, and on `tool.result` with a `document` or on `proposal` calls `builder.setPreview(...)` (for an edit proposal, `restoreFlowSecrets(document, current)` first). On `done` it calls `chat.end()`. Errors go to `chat.fail`. `apply` calls `applyDocument`, `setPreview(null)`, `chat.setProposalState`, then `setAiProposalState` on the API (failure logged, not blocking), then `fitView`. `discard` mirrors it. `stop` aborts the controller.
- `use-ask-ai.ts`: `useAskAi(): { askAboutNode(nodeId): void; askToFix(problems): void; askToExplainRun(run, nodeId?): void }` as in the spec: sets context, `requestFocus()`, and for explain calls `send("Explain why this run failed.")` (or `Explain why "<label>" failed.`).
- `ask-ai-button.tsx`: `<AskAiButton nodeId />`, a ghost `Button size="icon-sm"` with `RiSparklingLine`, `aria-label="Ask AI about this node"`, calling `askAboutNode`.
- `markdown.tsx`: `<Markdown text isAnimating />` wraps `<Streamdown mode={isAnimating ? "streaming" : "static"} plugins={{ code }} isAnimating={isAnimating} animated={!reducedMotion}>` in `<div className={styles.markdown}>`; `code` from `@streamdown/code` imported once at module level. Import `streamdown/styles.css` at the top of `panel.tsx`.

- [x] **Step 1: Install and configure Streamdown**

Run: `cd apps/web && bun add streamdown@2.6.0 @streamdown/code@1.1.1 && cd ../..` then the `globals.css` change. Run `bun run build --filter=@automator/web` once at the end of the task; a missing `@source` shows as unstyled markdown.

- [x] **Step 2: Failing panel tests**

`panel.test.tsx`, modelled on the old `ai-panel.test.tsx` (happy-dom, `act`, `createRoot`, stubbed `fetch`). Stub `fetch` to answer `GET .../ai/messages` with `{ messages: [] }`, `POST` with a `Response` whose body streams the frames of a scripted turn (message, text.delta, tool.call, tool.result with document, status, proposal, done), and `PATCH` with `{ message }`. Tests:

```ts
test("shows the empty state and sends a suggestion on click", ...)      // three chips; clicking one POSTs its text
test("streams a turn: text renders, a step appears, the canvas previews, and Apply lands it", ...)
  // after the stream: the log contains "Adding a trigger", a listitem "Add node · Run", builder preview is non-null,
  // the proposal card shows "Apply"; clicking Apply makes the store nodes match, preview null, and a PATCH call
test("a question renders as chips and clicking one sends it", ...)
test("Stop aborts the request and records the interruption", ...)        // fetch stub reads init.signal; expect an error part "Stopped before the model answered."
test("the context strip names the selection and Fix problems sends them", ...)
test("the first message is sent from a pending Home prompt", ...)         // sessionStorage "automator.pending-prompt" set, focusOnMount true → POST with that text
```

- [x] **Step 3: Implement the components**

Layout of `panel.tsx` (all client components):

```tsx
export function AiPanel() {
  const loaded = useChatStore((s) => s.loaded);
  // load once per flow: listAiMessages → chat.load; a failure shows a retry row instead of the thread
  return (
    <div className={styles.panel}>
      <ContextStrip />
      <div ref={thread} className={styles.thread} role="log" aria-label="AI conversation">
        {messages.length === 0 && !pending && <EmptyState onPick={(text) => void send(text)} />}
        {messages.map((message) => (
          <Message key={message.id} message={message} streaming={message.id === streamingId} />
        ))}
        {pending && <StatusRow phase={phase} onStop={stop} />}
      </div>
      <Composer onSend={send} />
    </div>
  );
}
```

`message.tsx`: user messages as `<div className={styles.userTurn}>`; assistant messages iterate `parts` in order: `text` → `<Markdown>`, consecutive `tool` parts → one `<Steps>` list (collapsed after the turn ends: a summary line "N steps · M rejected" with a disclosure `Button variant="ghost" size="sm"`), `question` → chips (`Button variant="outline" size="sm"` per option plus "Something else" which calls `setDraftPrompt("")` and `requestFocus()`), `proposal` → `<ProposalCard>`, `suggestions` → chips that call `send(item)` (hidden once a later message exists), `error` → `<p role="alert">` with `describeAiFailure`-style wording.

`steps.tsx`: each row: icon by tool name (`RiAddLine` add_node, `RiEditLine` update_node, `RiDeleteBinLine` remove_node, `RiLinkM` connect, `RiLinkUnlinkM` disconnect, `RiSettings3Line` set_flow, `RiTestTubeLine` add_test), the label (`Add node · <args.label ?? args.id>`, `Connect · <source> → <target>` and so on), and `RiCheckLine` / the error detail in `text-destructive-text`. A running step (no `ok` yet) shows `Spinner` from `@automator/ui/spinner`.

`proposal-card.tsx`: port the old `ProposalCard` (diff lists, `verificationHeading`, `checkLabels`, settings diff, the honest wording) onto `AiProposalPart` + `messageId`; buttons call `apply(messageId)` / `discard(messageId)`; non-pending states render the state line. Applied state text: `Applied`, `Discarded`, `Superseded by a later change`.

`composer.tsx`: `Textarea` with `rows={1}`, auto-grow via `style.height = scrollHeight` on change (cap at 8 lines), Enter sends unless `shiftKey` or `isComposing`, `Menu` (from `@automator/ui/menu`) on the left with "Start over" and, when the canvas has nodes, a radio pair "Edit this flow / Start a new flow" bound to `chat.mode`; send `Button size="icon-sm"` with `RiArrowUpLine` on the right, disabled when empty or pending. Reads `draftPrompt` from the store to prefill and focuses on `focusRequests`.

`context-strip.tsx`: chips with `Badge` from `@automator/ui/badge`: flow name (always), `N nodes selected` (with an `×` button calling `setContext({ selection: [] })`), `N problems`, `Run: <status>`; under it the quick actions row: `Fix problems` (visible when `problems.length > 0`, calls `askToFix(problems)` which sends "Fix the problems the builder reports.") and `Explain this flow` (visible when the canvas has nodes, sends "What does this flow do?"). The selection chip reads `selectSelectedNodes` from the builder store when the chat store has no explicit selection, so selecting on the canvas is context by default.

Mode: `send` passes `document` only when `mode === "edit"` (the default when the canvas has nodes); with `mode === "new"` it sends no document and the API treats it as a new flow (`replaces: true`).

Home hand-over inside `panel.tsx`: on the first `focusRequests > 0`, `takePendingPrompt()`; if non-null, `void send(text)`. (The `takeAiAnswer` branch is gone.)

`panel.module.css`: port the old `.panel`, `.thread`, `.empty`, `.suggestions`, `.suggestion`, `.userTurn`, `.composer`, `.preview`, `.changes`, `.change*`, `.actions`, `.waiting`, `.elapsed` rules and add `.strip`, `.chips`, `.quickActions`, `.steps`, `.step`, `.markdown` (`.markdown :is(p, ul, ol) { margin-block: 0 8px } .markdown a { color: var(--link) } .markdown code { font: var(--text-code) ... background: var(--muted) } .markdown pre { overflow-x: auto; border-radius: var(--radius-md) }`, tokens as `packages/tailwind-config/colors.css` names them).

- [x] **Step 4: Rewire the shell**

`right-panels.tsx`: swap imports; the `focusRequests` logic stays as it is (the chat store keeps `focusRequests`). `flow-builder.tsx`: `<ChatStoreProvider focusOnMount={focusAi}>`.

- [x] **Step 5: Run**

Run: `bun test apps/web/src/builder && bun run typecheck --filter=@automator/web && bun run lint`
Expected: panel tests PASS; typecheck red only in `run-panel.tsx` and `home/prompt.tsx` (Task 13).

- [x] **Step 6: Checkpoint**

Proposed message: `feat(web): rebuild the AI panel on a streamed, tool-calling conversation`.

---

### Task 13: Home hand-over and run explanation

**Files:**

- Modify: `apps/web/src/home/prompt.tsx`, `apps/web/src/home/prompt.test.tsx`
- Modify: `apps/web/src/builder/run-panel.tsx`
- Delete: `apps/web/src/builder/use-explain-run.ts`

- [x] **Step 1: Update the Home tests**

In `prompt.test.tsx`: the "drafts then creates" test becomes "stores the prompt and creates the flow": submitting stores `automator.pending-prompt` and calls `createFlowAction({ ai: true })` (mock `../flows/actions`), with no `fetch` to the AI. Delete the "failed draft creates no flow" test and the `automator.ai-draft-answer` assertions. Keep the focus-on-`?draft` test.

- [x] **Step 2: Rewrite `draft()` in `prompt.tsx`**

```tsx
async function draft(form: FormData) {
  const prompt = String(form.get("prompt") ?? "").trim();
  if (prompt === "") return;
  storePendingPrompt(prompt);
  await createFlowAction({ ai: true });
}
```

Remove `generateFlowRequest`, `storeAiAnswer`, `describeAiFailure`, `formatElapsed`, `useAccessToken`, the `Drafting` and `Elapsed` components, the `error` state and the Stop button; the `Send` button label becomes "Open on the canvas". Update the JSDoc: "Home creates the flow and hands the prompt to the builder, which sends it as the first message so the draft streams where it will be edited."

- [x] **Step 3: Run panel**

In `run-panel.tsx` replace `useExplainRun` with `useAskAi` from `./ai/use-ask-ai`; `ExplainButton` calls `askToExplainRun(run, nodeId)` and reads `pending` from `useChatStore`. Delete `use-explain-run.ts`.

- [x] **Step 4: Run everything**

Run: `bun run lint && bun run typecheck && bun run test`
Expected: all green. Fix any remaining import of deleted modules the compiler reports.

- [x] **Step 5: Checkpoint**

Proposed message: `feat(web): hand the Home prompt to the builder and explain runs in the chat`.

---

### Task 14: Node settings seam (coordinated)

**Files:**

- Modify: `apps/web/src/builder/left-panel.tsx` (one line, after `feat/node-settings-redesign` has landed on `main` or been merged into this branch; until then this task waits)

- [x] **Step 1: Confirm the props exist**

Run: `grep -n "actions\|readOnly" apps/web/src/builder/node-settings.tsx`
Expected: both props present. If not, stop: message session `automator-01` and wait.

- [x] **Step 2: Wire**

Change the `NodeSettings` element in `left-panel.tsx` to:

```tsx
<NodeSettings
  key={selectedNode.id}
  node={selectedNode}
  onBack={clearSelection}
  actions={<AskAiButton nodeId={selectedNode.id} />}
  readOnly={preview !== null}
/>
```

with `const preview = useBuilderStore((state) => state.preview);` and `import { AskAiButton } from "./ai/ask-ai-button";`.

- [x] **Step 3: Tell the peer**

Send `automator-01` a message naming the line changed. Run `bun test apps/web/src/builder/left-panel* apps/web/src/builder/node-settings*`.

---

### Task 15: End-to-end smoke and manual check

**Files:**

- Create: `apps/web/e2e/ai-chat.e2e.ts`
- Modify: `apps/web/playwright.config.ts` (API `env` gains `AI_SCRIPTED_MODEL: "1"`)

- [x] **Step 1: Write the smoke test**

```ts
import { expect, test } from "@playwright/test";
// beforeEach: the session setup copied from demo-path.e2e.ts

test("a Home prompt streams a draft into the builder and Apply lands it", async ({ page }) => {
  await page.goto("/?draft=1");
  await page.getByLabel("Describe the flow you want").fill("Post hi to Discord when I run it");
  await page.getByRole("button", { name: "Open on the canvas" }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}\?ai=1$/);
  const log = page.getByRole("log", { name: "AI conversation" });
  await expect(log).toContainText("Adding a manual trigger");
  await expect(log.getByRole("listitem").filter({ hasText: "Connect" })).toBeVisible();
  await page.getByRole("button", { name: "Replace canvas" }).click();
  await expect(page.getByText("Post to Discord")).toBeVisible();
  await expect(log).toContainText("Applied");
  await page.reload();
  await expect(page.getByRole("log", { name: "AI conversation" })).toContainText("Applied");
});
```

- [x] **Step 2: Run it**

Run: `cd apps/web && bunx playwright test e2e/ai-chat.e2e.ts` (the memory notes list the local database and port workarounds: `reference-worktree-e2e-env`, `project-ui-ux-round-2026-09-09`).
Expected: PASS.

- [x] **Step 3: Manual check against the live model**

Re-run on 2026-09-11, after `fix(api): send function tools to OpenAI without reasoning`, against
the API alone (port 3101, real keys from `apps/api/.env`, `DATABASE_URL` pointed at the local
`automator_test` database so no live data was touched), same prompt posted straight to
`POST /flows/<id>/ai/messages`: "Every hour, check my USDC balance and post it to Discord."

| Measure                       | Before the fix                                         | After the fix                                                              |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Model that answered           | OpenRouter `openai/gpt-oss-120b` (the fallback)        | OpenAI `gpt-5.6-luna` (the primary, directly)                              |
| Primary model                 | Refused all 11 hops with HTTP 400                      | Answered every hop; no 400s, no fallback in the log                        |
| `tool.call` events            | 10 (5 `add_node`, 4 `connect`, 1 `add_test`)           | 8 (`set_flow`, 3 `add_node`, 2 `connect`, `add_test`, `suggest_next`)      |
| Rejected `tool.result` events | 0                                                      | 0                                                                          |
| Seconds to `proposal`         | 79.9 (first `tool.call` at 18.6s, `done` at 79.9s)     | 11.3 (first `tool.call` at 3.0s, `done` at 11.3s)                          |
| Proposal checks               | 1 check, passed (`Sample: Hourly trigger`), 4 warnings | 1 check, skipped (missing sample value for a template binding), 4 warnings |

Raw event type sequence (after the fix), offsets in seconds from the request:

```
message@0.0
tool.call(set_flow)@3.0        tool.result(ok)@3.0
tool.call(add_node n1)@3.0     tool.result(ok)@3.0
tool.call(add_node n2)@3.0     tool.result(ok)@3.0
tool.call(add_node n3)@3.0     tool.result(ok)@3.0
tool.call(connect)@5.3         tool.result(ok)@5.3
tool.call(connect)@6.4         tool.result(ok)@6.4
tool.call(add_test)@8.3        tool.result(ok)@8.3
tool.call(suggest_next)@9.9    tool.result(ok)@9.9
suggestions@9.9
text.delta × ~60 @10.7-11.2
status(checking)@11.3
proposal@11.3
done@11.3
```

The draft was a three-node flow: `trigger.schedule` → `usdc.balance` → `notify.discord`, with two
edges — leaner than the five-node, four-edge draft from the "before" run because this model wired
the balance straight into the Discord message template instead of adding an intermediate
`logic.run-code` formatting step. That template binding (`{{input.message.balance}}`) is also why
the one check came back skipped rather than passed: the sample run had no representative value for
it. Its summary named the two fields a reader has to fill in (the Discord webhook URL and the
wallet address). `GET /flows/<id>/ai/messages` returned both messages, the assistant one with all
its parts, so the turn persisted. The flow was deleted afterwards, and the API log has no
"Primary model failed" or OpenAI-400 lines anywhere in the run — the fallback path was never
exercised.

The fix cuts the turn from 79.9s to 11.3s by removing the wasted OpenAI 400 before every
OpenRouter hop, and moves the flow from the free fallback pool onto the intended primary model.
The skipped (rather than passed) check is model variance in how it wired the sample data, not a
regression from the fix.

- [x] **Step 4: Full verification**

Run: `bun run lint && bun run typecheck && bun run test && bun run build && bun run format:check`
Expected: all green.

---

### Task 16: Documentation

**Files:**

- Modify: `docs/architecture.md` (the "AI" section: replace the `POST /ai/flows` and `POST /ai/runs/explain` paragraphs with the messages routes, the canvas agent, the tools, the stream events, the messages table, `AI_SCRIPTED_MODEL`, and the canvas preview; keep the model-client and verification paragraphs, adjusting "one repair" wording to the end-of-turn repair)
- Modify: `docs/plans/2026-09-11-ai-chat-redesign.md` (status line → implemented, with the manual-check numbers)
- Modify: `docs/plans/2026-09-11-ai-chat-redesign-implementation.md` (mark tasks done)
- Decision record `docs/decisions/0016-…` is written only when Arda wraps up the session (repo rule).

- [x] **Step 1: Edit the docs**, grounded in what shipped (no assumed behaviour).
- [x] **Step 2: Checkpoint.** Proposed message: `docs: describe the AI conversation, canvas agent and preview`.
