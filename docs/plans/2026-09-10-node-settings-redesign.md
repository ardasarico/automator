# Node settings redesign

> **Status:** implemented on `feat/node-settings-redesign` (worktree `.claude/worktrees/node-settings`), uncommitted, awaiting Arda's review. Kept for the reasoning; do not re-execute the task list.
>
> **Deviations while building:** (1) field-level problems come from `findFlowProblems` itself rather than a second `findFlowConfigProblems` call: `FlowProblem` gained an optional `path`, every per-setting check in `flow-checks.ts` sets it, and config-problem messages now read `“<node label>”: …` instead of `config.x: …`. Warnings (a blank secret) show under the field in the warning colour; only errors count in the header badge. (2) `NodeSettings` accepts `readOnly` (requested by the AI-panel session for draft previews): a disabled fieldset, no rename or menu, a one-line note. (3) The `ai.agent` `tools` field is titled "Available to the agent" so the Tools section caption and the field label do not repeat. (4) List rows have a small head line (item title + hover-revealed controls) above full-width wrapping fields, since a 3-field row did not fit beside the controls at 340 px. (5) The `NodeProblemsContext` provider lives inside the canvas, so the panel reads `useFlowProblems()` directly.
>
> **Follow-up (2026-09-11), value picker:** Arda found raw templates such as `{{input.value.verified}}` hard to read. A single-line string field with upstream values that holds exactly one `{{…}}` template now renders `ValueField` (`schema-form/value-field.tsx`): a Select of the upstream values grouped by source node ("Set audience → audience"), a "Typed" group for a template the list does not know, and "Type your own…" which switches to the text input; a whole value inserted from the `{ }` menu brings the list back. Empty and mixed-text fields stay text. Titles: condition `left`/`right` → "Compare"/"With", switch `value` → "Value to match", filter `field`/`value` → "Field to compare"/"With". The stock Select trigger read as a text box (Arda did not see it could open), so the picked value renders as a token: a source badge, the value name, and an explicit "Change ▾" handle (`value-field.module.css`). A chip (token) editor for mixed text was discussed and left for later.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the builder's node settings panel readable at a glance: one sectioned form where essentials come first, irrelevant fields stay hidden, help text appears on demand, and a node's last-run values and actions live in the panel header and footer instead of between the fields.

**Architecture:** The panel stays in the left sidebar, widened from 260 px to 340 px. The schema-driven form engine in `apps/web/src/components/schema-form` learns three schema hints (`advanced`, `group`, `showWhen`) declared in `packages/contracts` next to the existing `secret` and `tableRef` keywords, and renders fields in sections. `apps/web/src/builder/node-settings.tsx` becomes a thin shell: header (editable label, problem badge, actions menu), sectioned form with field-level errors, collapsible "Last run" section.

**Tech Stack:** TypeBox (custom keywords on schema options), React 19, Coss/Base UI primitives from `@automator/ui` (`menu`, `field`, `button`, `tooltip`), CSS modules, bun test with happy-dom.

**Design decisions (Arda, 2026-09-10):** keep the editor in the left panel; option B "sectioned form" from the three demos; summary card and raw-JSON views were considered and dropped.

## Global Constraints

- Run every command from the worktree root. `bun run lint` is `oxlint --deny-warnings`; format with `bun run format` (oxfmt).
- Icons only from `@remixicon/react`, line variants.
- Contracts stay backend-independent; the new keywords are hints the API ignores.
- Hidden (`showWhen` false) fields keep their stored value; nothing is deleted from `config` by the UI.
- Keep everything uncommitted until Arda asks for a commit; then show staged files and messages first (see `.agents/skills/committing/SKILL.md`).
- The right panel belongs to another session (automator-34). Do not touch `right-panels.tsx`, `ai-*`, or `.sidePanel`/`.rail`/`.panelHeader` rules. Tell that session before editing `flow-builder.tsx`, `flow-builder.module.css` or `responsive-panels.tsx`.

---

## Spec

### Panel layout

```
┌────────────────────────────────────────┐ 45 px header, unchanged height
│ ←  AI            ● 1 issue   ✦  ⋯      │  back · category + label (click to rename) · badge · actions
│    AI agent ✎                           │
├────────────────────────────────────────┤
│ Task                              { }  │  main section: fields with no hint, schema order
│ [textarea]                              │  help text only while hovered / focused
│ System instructions               { }  │
│ [textarea]                              │
├────────────────────────────────────────┤
│ TOOLS                                   │  `group: "Tools"`
│ ☑ Set variable ☑ Discord …             │
│ Discord webhook                   { }  │  `showWhen: { field: "tools", includes: "discord_message" }`
│ [input]                                 │
│ Required while Discord message is on.  │  field-level error from findFlowConfigProblems
├────────────────────────────────────────┤
│ ▸ Advanced · 1 setting                  │  `advanced: true`, collapsed <details>
├────────────────────────────────────────┤
│ ▾ Last run · 14:02                      │  only when a run covers this node
│   {{input.prompt}}   "hello"            │  resolved templates (was: under each field)
│   result             "done"             │  node outputs
└────────────────────────────────────────┘
```

- Width: `.leftPanel` 340 px (palette shares the panel and widens with it).
- The separate **Label** field is removed; the label is edited in the header, same interaction as the flow title (`FlowTitle` in `left-panel.tsx`: click, select all, Enter commits, Escape cancels, blur commits).
- Header actions, right to left: ⋯ menu (Duplicate, Save as reusable node, Delete), then an `actions` slot for the AI session's "Ask AI about this node" button.
- Badge: count of `error` problems for this node from `useNodeProblems`; hidden when zero.
- Lists (`array<object>`): each item is a borderless row separated by a hairline; item fields flow in a wrapping flex row; move up/down and remove buttons sit at the row end and are visible on hover or focus-within. "Add …" is a text button under the list.
- Last run: collapsible, open by default, shows every `{{…}}` template in this node's config with its resolved value (existing `useRunPreview`), then the node's outputs from the run. The "settings changed since" note lives here.

### Schema hints

Added to `Property` in `schema.ts` and used on TypeBox options in contracts:

| Keyword    | Type                                                     | Effect                                                                                       |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `advanced` | `boolean`                                                | field goes to the Advanced section                                                           |
| `group`    | `string`                                                 | field goes to a named section; sections keep first-appearance order                          |
| `showWhen` | `{ field: string; equals?: unknown; includes?: string }` | rendered only when the sibling `field` equals `equals`, or is an array containing `includes` |

Assignment:

| Schema                                                                                                                                 | `advanced`                             | `group` / `showWhen`                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai.agent`                                                                                                                             | `maxSteps`                             | `tools`, `allowedHosts`, `discordWebhookUrl`, `subgraph` → group `Tools`; `allowedHosts` ← includes `http_get`; `discordWebhookUrl` ← includes `discord_message`; `subgraph` ← includes `query_subgraph` |
| `data.update-record`, `data.delete-record`                                                                                             |                                        | `recordId` ← `target` equals `record`; `filters` ← `target` equals `filter`                                                                                                                              |
| `data.find-records`                                                                                                                    | `sortColumn`, `sortDirection`, `limit` |                                                                                                                                                                                                          |
| every trigger (`samplePayloadField`)                                                                                                   | `samplePayload`                        |                                                                                                                                                                                                          |
| `trigger.miniapp-open`                                                                                                                 | `visitorErrorMessage`                  |                                                                                                                                                                                                          |
| `ai.generate-text`, `ai.classify`, `ai.extract`                                                                                        | `instructions`                         |                                                                                                                                                                                                          |
| `notify.discord`                                                                                                                       | `username`                             |                                                                                                                                                                                                          |
| `screen.page` `button`; `screen.form` `submit`; `screen.confirmation` `confirm`, `cancel`, `simulate`; `screen.qr-code` `button`       | those                                  |                                                                                                                                                                                                          |
| `privy.login` `simulate`; `world.id-verify` `signal`, `simulate`; `world.selfie-check` `signal`, `simulate`; `usdc.payment` `simulate` | those                                  |                                                                                                                                                                                                          |
| `logic.for-each`                                                                                                                       | `maxItems`                             |                                                                                                                                                                                                          |
| `onchain.write-contract`                                                                                                               | `value`                                |                                                                                                                                                                                                          |

### Field-level errors

`findFlowConfigProblems(document, tables)` from `@automator/contracts` already reports `{ nodeId, path, message }` with paths like `config.fields.0.id`. `NodeSettings` filters them to the selected node and passes `errors: Record<path, message>` down; every field knows its own `path` (`config.<name>`, `config.<name>.<index>.<name>`) and renders the message with `FieldError`.

---

## File structure

- `packages/contracts/src/flow-node-configs.ts`, `data-node-configs.ts`, `sample-payload.ts`, `screens.ts`, `identity.ts`, `payment-policy.ts` (or wherever `usdc.payment` lives), `loop-configs.ts`, `onchain-configs.ts`, `notify-configs.ts`, `flow-triggers.ts`: add hints.
- `packages/contracts/src/node-config.test.ts`: invariant test that every `showWhen.field` names a sibling.
- `apps/web/src/components/schema-form/schema.ts`: `Property` gains `advanced`, `group`, `showWhen`; `FieldProps` gains `path`, `errors`.
- `apps/web/src/components/schema-form/layout.ts` (+ `layout.test.ts`): `sectionFields`, `isVisible`.
- `apps/web/src/components/schema-form/fields.tsx`: `ObjectFields` renders sections and skips hidden fields; `ConfigField` renders `FieldError`; `ArrayField` rows; `Help` gets the `schema-help` class; `TemplatePreviews` no longer rendered under `StringField`.
- `apps/web/src/components/schema-form/fields.module.css`: list rows, section headers, help visibility.
- `apps/web/src/components/schema-form/index.ts`: export the new helpers.
- `apps/web/src/builder/node-header.tsx`: back button, category, inline-editable label, badge, actions slot, ⋯ menu.
- `apps/web/src/builder/node-last-run.tsx`: the Last run section.
- `apps/web/src/builder/node-settings.tsx`: wires header, form, errors, last run.
- `apps/web/src/builder/node-settings.module.css`: panel-specific styles; the `.nodeSettings*` rules move here from `flow-builder.module.css`.
- `apps/web/src/builder/flow-builder.module.css`: `.leftPanel` width 340 px, remove the moved `.nodeSettings*` rules.
- `apps/web/src/builder/left-panel.tsx`: pass through unchanged API (`node`, `onBack`); no other change.
- Tests: `layout.test.ts`, `fields.test.tsx`, `node-settings.test.tsx`, `node-header.test.tsx`.

---

### Task 1: Schema hints in contracts

**Files:**

- Modify: `packages/contracts/src/flow-node-configs.ts` (`agentConfigSchema`, `generateText`, `classify`, `extract`, `discord`, `miniapp-open`)
- Modify: `packages/contracts/src/sample-payload.ts` (`samplePayloadField` adds `advanced: true`)
- Modify: `packages/contracts/src/data-node-configs.ts`, `screens.ts`, `identity.ts`, `loop-configs.ts`, `onchain-configs.ts`, `notify-configs.ts`, `watch-configs.ts`, the `usdc.payment` schema
- Test: `packages/contracts/src/node-config.test.ts`

**Produces:** schema options carrying `advanced?: boolean`, `group?: string`, `showWhen?: { field: string; equals?: unknown; includes?: string }`.

- [ ] **Step 1: Write the invariant test**

```ts
test("every showWhen names a sibling field", () => {
  for (const [type, schema] of Object.entries({
    ...flowNodeConfigSchemas,
    ...screenConfigSchemas,
  })) {
    const properties = schema.properties as Record<string, { showWhen?: { field: string } }>;
    for (const [name, property] of Object.entries(properties)) {
      if (!property.showWhen) continue;
      expect(properties, `${type}.${name}`).toHaveProperty(property.showWhen.field);
    }
  }
});
```

- [ ] **Step 2: Run it** — `bun test packages/contracts/src/node-config.test.ts` passes trivially (no hints yet).
- [ ] **Step 3: Add the hints** per the assignment table. Example for `ai.agent`:

```ts
tools: Type.Array(…, { default: [], group: "Tools", description: … }),
allowedHosts: Type.Array(Type.String(), { …, group: "Tools", showWhen: { field: "tools", includes: "http_get" } }),
discordWebhookUrl: Type.String({ …, group: "Tools", showWhen: { field: "tools", includes: "discord_message" } }),
subgraph: Type.String({ …, group: "Tools", showWhen: { field: "tools", includes: "query_subgraph" } }),
maxSteps: Type.Number({ …, advanced: true }),
```

TypeBox accepts unknown keys on `SchemaOptions`; if `typecheck` objects, widen with a shared `type FieldHints = { advanced?: boolean; group?: string; showWhen?: … }` exported from `sample-payload.ts`'s neighbour `node-config.ts` and spread it as `{ ...hints } satisfies FieldHints`.

- [ ] **Step 4: Verify** — `bun test packages/contracts` and `bun run typecheck --filter=@automator/contracts` pass; `bun test packages/contracts/src/flow-node-configs.test.ts` still parses defaults.

### Task 2: Layout helpers in schema-form

**Files:**

- Modify: `apps/web/src/components/schema-form/schema.ts`
- Create: `apps/web/src/components/schema-form/layout.ts`, `layout.test.ts`
- Modify: `apps/web/src/components/schema-form/index.ts`

**Produces:**

```ts
export type ShowWhen = { field: string; equals?: unknown; includes?: string };
// on Property: advanced?: boolean; group?: string; showWhen?: ShowWhen;
export type FieldSection =
  | { kind: "main"; names: string[] }
  | { kind: "group"; label: string; names: string[] }
  | { kind: "advanced"; names: string[] };
export function sectionFields(properties: Record<string, Property>): FieldSection[];
export function isVisible(
  property: Pick<Property, "showWhen">,
  record: Record<string, unknown>,
): boolean;
```

- [ ] **Step 1: Tests**

```ts
test("sections keep schema order: main, groups by first appearance, advanced last", () => {
  const sections = sectionFields({
    a: { type: "string" },
    z: { type: "number", advanced: true },
    t: { type: "array", group: "Tools" },
    b: { type: "string" },
    u: { type: "string", group: "Tools" },
  });
  expect(sections).toEqual([
    { kind: "main", names: ["a", "b"] },
    { kind: "group", label: "Tools", names: ["t", "u"] },
    { kind: "advanced", names: ["z"] },
  ]);
});
test("empty sections are dropped", () => {
  expect(sectionFields({ a: { type: "string" } })).toEqual([{ kind: "main", names: ["a"] }]);
});
test("isVisible reads equals and includes", () => {
  expect(isVisible({ showWhen: { field: "target", equals: "record" } }, { target: "record" })).toBe(
    true,
  );
  expect(isVisible({ showWhen: { field: "target", equals: "record" } }, { target: "filter" })).toBe(
    false,
  );
  expect(
    isVisible({ showWhen: { field: "tools", includes: "http_get" } }, { tools: ["http_get"] }),
  ).toBe(true);
  expect(isVisible({ showWhen: { field: "tools", includes: "http_get" } }, { tools: [] })).toBe(
    false,
  );
  expect(isVisible({}, {})).toBe(true);
});
```

- [ ] **Step 2: Run** — fails: module missing.
- [ ] **Step 3: Implement** in `layout.ts` (pure functions, no React).
- [ ] **Step 4: Run** — `bun test apps/web/src/components/schema-form/layout.test.ts` passes.

### Task 3: Sectioned rendering, conditional fields, errors, help on demand

**Files:**

- Modify: `apps/web/src/components/schema-form/fields.tsx`, `schema.ts` (`FieldProps` gains `path?: string; errors?: Readonly<Record<string, string>>`)
- Create: `apps/web/src/components/schema-form/fields.module.css`
- Test: `apps/web/src/components/schema-form/fields.test.tsx`

**Behaviour:**

- `ObjectFields` gains `sectioned?: boolean` (default false so `column-editor.tsx` and `record-panel.tsx` keep their flat form). When true it renders `sectionFields(...)`: main fields bare, each group as `<section>` with an uppercase caption, advanced as `<details className={styles.advanced}>` whose summary reads `Advanced · N settings`.
- Fields with `showWhen` false are not rendered (both modes).
- `ConfigField` renders `<FieldError>{errors[path]}</FieldError>` when present.
- `Help` renders `<FieldDescription className="schema-help">`. `fields.module.css` hides `.schema-help` inside `.quietHelp` unless the enclosing field is hovered or focus-within (`.quietHelp :is(:hover, :focus-within) > :global(.schema-help)`); `NodeSettings` puts `quietHelp` on its form, so the Data pages keep their always-visible help.
- `StringField` stops rendering `TemplatePreviews`; the `preview` prop is removed from `FieldProps`, `ObjectFields`, `ArrayField`.

- [ ] **Step 1: Tests** (extend `fields.test.tsx` using its `mount` helper; add an `ObjectFields` mount for sections)

```ts
test("a showWhen field is hidden until its sibling matches", …) // renders ObjectFields with {target:"filter"}; expect no label "Record"
test("errors render under the field they name", …)               // errors={{ "config.due": "Pick a date." }} path="config.due"
test("sectioned ObjectFields puts advanced fields behind a summary", …) // expect summary text "Advanced · 1 setting" and the field inside <details>
```

- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — `bun test apps/web/src/components/schema-form` passes; `bun test apps/web/src/app` (data pages) still passes.

### Task 4: List rows

**Files:**

- Modify: `apps/web/src/components/schema-form/fields.tsx` (`ArrayField`), `fields.module.css`
- Test: `fields.test.tsx`

- [ ] **Step 1: Test** — an `array<object>` with two items renders two `[role=group]` rows, each with buttons named `Move … up`, `Move … down`, `Remove …`; clicking Remove on row 1 calls `onChange` with the remaining item.
- [ ] **Step 2: Implement** — drop the bordered `Group`; row = `<div role="group" aria-label={itemTitle(...)} className={styles.row}>` with `<div className={styles.rowFields}>` (flex, wrap, `gap: 6px`, each field `flex: 1 1 120px`) and `<div className={styles.rowActions}>`, actions `opacity: 0` until `.row:is(:hover, :focus-within)`; `prefers-reduced-motion` respected (no transition). Rows separated by `border-top: 1px solid var(--border)`. Add button becomes `variant="ghost" size="sm"`.
- [ ] **Step 3: Run** the schema-form tests.

### Task 5: Node header

**Files:**

- Create: `apps/web/src/builder/node-header.tsx`, `node-header.test.tsx`
- Modify: `apps/web/src/builder/node-settings.tsx`, create `node-settings.module.css`
- Modify: `apps/web/src/builder/flow-builder.module.css` (move `.nodeSettings*` rules out; `.leftPanel { width: 340px }`) — **message automator-34 first**.

**Produces:**

```tsx
export function NodeHeader(props: {
  node: BuilderNode;
  issues: number; // error count for the badge
  actions?: React.ReactNode; // slot for the AI session's button
  onBack(): void;
  onRename(label: string): void;
  onDuplicate(): void;
  onSavePreset(): void;
  onDelete(): void;
}): React.ReactElement;
```

- [ ] **Step 1: Tests** — label button renames on Enter and restores on Escape; badge shows `2 issues` and is absent at 0; menu exposes `Duplicate`, `Save as reusable node`, `Delete` and calls the matching callback.
- [ ] **Step 2: Implement** — inline rename copied from `FlowTitle` (`left-panel.tsx`) with `maxLength` 120; ⋯ uses `Menu`/`MenuTrigger`/`MenuPopup`/`MenuItem` from `@automator/ui/menu`, icon `RiMoreLine`; Delete item styled `text-destructive-text`. Badge is `Badge variant="secondary"` with a warning dot.
- [ ] **Step 3: Wire in `NodeSettings`** — `onDuplicate` → `duplicateNodes([node.id])`; `onDelete` → `removeNode(node.id)` then `onBack()`; `onSavePreset` opens `SavePresetDialog`; `issues` from `useNodeProblems(node.id).filter(p => p.severity === "error").length`. Remove the Label `Field`.
- [ ] **Step 4: Run** `bun test apps/web/src/builder/node-header.test.tsx apps/web/src/builder/node-settings.test.tsx`.

### Task 6: Field errors and Last run in the panel

**Files:**

- Create: `apps/web/src/builder/node-last-run.tsx`
- Modify: `apps/web/src/builder/node-settings.tsx`, `apps/web/src/components/schema-form/template-preview.tsx` (export `ResolvedValue`)
- Test: `node-settings.test.tsx`

- [ ] **Step 1: Tests** — with a run in `RunStoreProvider` covering the node, a `details` named `Last run` lists each template in the config with its value and the node's outputs; without a run the section is absent; a config problem for the node shows under its field and counts in the header badge.
- [ ] **Step 2: Implement `NodeLastRun({ nodeId, config, preview })`** — templates via `templateReferences(config)` from `@automator/contracts`; values via `preview.preview(path)`; outputs from the run store's node result (`useRunStore(s => s.run?.nodes?.[nodeId])`, check the exact field name in `run-store.ts`) rendered with `describeValue`; stale note reuses the existing sentence.
- [ ] **Step 3: Errors** — `useMemo(() => findFlowConfigProblems({ nodes, edges }, tables).filter(p => p.nodeId === node.id))` → `Object.fromEntries(problems.map(p => [p.path, p.message]))`, passed as `errors` with `path="config"` to `ObjectFields sectioned`.
- [ ] **Step 4: Run** the builder tests.

### Task 7: Verification pass

- [ ] `bun run lint`, `bun run typecheck`, `bun run test`, `bun run format:check`.
- [ ] Browser: `bun run dev`, open "QA AI and integrations" → AI agent: Tools group shows webhook only with Discord on; Advanced holds Step limit; help appears on hover; Last run after Simulate. Open "QA Data" → Update record: Filters appear only with "Find by filter"; Values rows are borderless.
- [ ] Message automator-34 with the final `.leftPanel` width and the `actions` slot signature.
- [ ] Report to Arda; wait for commit approval.
