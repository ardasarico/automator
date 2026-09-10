# Canvas Quality of Life

> **Status:** built 2026-09-10 to 2026-09-11, uncommitted at the time of writing; `docs/web-ui.md` (Flow builder) describes what shipped. Do not re-execute this plan.

**Goal:** make the flow canvas feel like a design tool: multi-node selection with a toolbar and persistent groups, a node card that says what each node does, snapping, a sane zoom range, and the small interactions people expect (right-click, reconnecting an edge, renaming in place).

**Spec:** this document. Decisions were taken in the terminal on 2026-09-10; the node card was chosen from two demo pages (four treatments, then four variations of the summary card).

## Decisions

- **Node card is the summary card with a tinted bar (C1).** A 32 px title bar washed with the category colour at 12 %, the label and the run status or problem badge on it; under it one line that says what the node is set to do ("5 USDC on Base Sepolia", "amount ≥ 10", "when someone opens the app"); then the port rows as today but 20 px tall. A node with at most one port per side puts its dots on the summary row and skips the port list. The current icon tile, category eyebrow and 24 px port rows go.
- **Three node families, decided 2026-09-11 from a third demo page** (`nodeFamily`): trigger = tinted card with a "Trigger" tag (T2), screen = bar plus a list of what the visitor gets (S2), branch = question in the middle with the outputs as tabs on the right (B1). Steps keep C1. Shape follows behaviour, colour stays with the category; four silhouettes is the ceiling.
- **Summary text lives in contracts**, next to `describeTrigger`, as `describeNode(node): string | null`. Triggers reuse the trigger sentence. A node without a rule shows its catalog description instead, never `undefined`.
- **Multi-select gets finished, and groups are persisted.** Cmd+A selects all, Escape clears, the selection box selects on partial overlap, and a selection toolbar offers Align, Duplicate, Group and Delete. A group is a labelled frame saved with the flow; nodes inside it carry `parentId`. Cmd+G groups the selection, Ungroup lives on the frame's toolbar and menu. Deleting a frame releases its nodes. Dropping a node fully inside a frame adopts it; dragging it fully out releases it. The engine, validation, the AI and the miniature do not see groups: the document keeps node positions absolute, and `groups` is a separate optional list.
- **Snap to a 20 px grid, always on.** Matches the dot pattern. Click placement, duplicate offsets and tidy-up already land on multiples of 20.
- **Zoom range 0.25x to 1.25x.** Was 2x.
- **Design-tool pointer model.** Dragging on empty canvas draws a selection box; Space + drag or the middle button drags the view, two-finger scroll pans, pinch and Cmd + scroll zoom. Right-button panning was dropped: React Flow swallows the pane context menu while it pans. This is what makes "Space to pan" mean something; with the old drag-to-pan it was already the default and did nothing new. Arda has not seen this one yet: it is called out in the summary and is a one-prop revert if it feels wrong.
- **From the QoL list Arda picked:** edge reconnect by dragging an end (dropping it on empty canvas disconnects), right-click menus on node, edge, selection and canvas, double-click on empty canvas opens the node picker there, a zoom percentage readout that resets to 100 %, and double-click on a label renames in place. **Left out:** copy/paste across flows and a sticky-note node.

## Work items

Build order, each a commit-sized step. Tests go with each step; the store and contracts are unit-tested, the card and menus get component tests, and the canvas is checked in the browser at the end.

### 1. Zoom range, grid snap, pointer model

- [x] `flow-canvas.tsx`: `maxZoom={1.25}`, `snapToGrid` with `snapGrid={[20, 20]}`, `selectionOnDrag`, `panOnDrag={[1]}`, `panOnScroll`, `selectionMode={SelectionMode.Partial}`, `zoomOnDoubleClick={false}`.
- [x] `grid.ts` in the builder: `snapPosition(position)` used by `useNodePlacement`, the drop handler and the connection-drop picker. Test it.
- [x] Zoom panel: percentage button between the zoom buttons, from `useViewport`, click zooms to 1.

### 2. Summary card

- [x] `packages/contracts/src/flow-summaries.ts`: `describeNode` with rules for the node types that have a config worth stating (condition, switch, wait, set-variable, schedule and the other triggers via `describeTrigger`, usdc payment/payout/balance, notify._, ai._, data._, screen._, graph, world, privy). Fallback returns `null`. Tests per rule and for the fallback.
- [x] `flow-node.tsx` + `flow-builder.module.css`: the C1 layout, category tint via `--cat`, single-port dots on the summary row, run status and problem badge on the bar. `nodeHalfSize` updated.
- [x] Component test: a condition renders "amount ≥ 10", a trigger renders its sentence, a node without a rule renders its catalog description.

### 3. Selection

- [x] Hotkeys: `mod+a` selects every node and edge, `Escape` clears, `mod+g` groups, `mod+shift+g` ungroups, `Delete` already works.
- [x] Store: `removeNodes(ids)` (one history entry, prunes edges), `alignNodes(ids, "left" | "top" | "centerX" | "centerY")`, `selectAll()`.
- [x] `selection-toolbar.tsx`: a `NodeToolbar` bound to every selected node id, visible with two or more selected and not while dragging. Buttons: Align left, Align top, Duplicate, Group, Delete. Ghost `icon-sm` buttons on the zoom panel's chrome.
- [x] Tests for the store actions and the toolbar's visibility rule.

### 4. Right-click menus

- [x] `canvas-menu.tsx`: one Coss `Menu` opened by `onNodeContextMenu`, `onEdgeContextMenu`, `onSelectionContextMenu` and a `contextmenu` listener on the viewport wrapper for the pane (React Flow's `onPaneContextMenu` only fires when the event target is the pane element itself, which a real right-click did not satisfy), anchored to the pointer through `MenuPopup`'s `anchor` with a virtual element. Node: Rename, Duplicate, Save as node, Delete. Selection: Align, Duplicate, Group, Delete. Group frame: Rename, Ungroup, Delete. Edge: Delete. Canvas: Add node here (opens the picker), Select all, Tidy up, Fit view.
- [x] Test: right-click on a node opens the node items; on the pane, the canvas items.

### 5. Edge reconnect

- [x] Store: `reconnectEdge(edge, connection)` that reuses `canConnect` while ignoring the edge being moved, one history entry. `disconnectEdge(id)` for a drop on empty canvas.
- [x] Canvas: `edgesReconnectable`, `onReconnect`, `onReconnectStart`/`onReconnectEnd` tracking whether the drop landed.
- [x] Tests: move to a valid port, refuse a cycle or a taken input, drop on empty removes.

### 6. Double-click

- [x] Empty canvas: `onDoubleClick` on the viewport wrapper, filtered to `.react-flow__pane`, opens `NodePicker` at that point without a source port; the node lands snapped at the click.
- [x] Node label: double-click swaps the label for an input inside the card; Enter or blur commits through `renameNode`, Escape cancels. Test both.

### 7. Groups

- [x] Database: `packages/db` copied `nodes` and `edges` field by field into every snapshot (flows, versions, runs, listings), so `groups` had to be carried there too or a save silently dropped the frame.
- [x] Contracts: `flowGroupSchema` `{ id, label, position, width, height }`, `groups: Type.Optional(Type.Array(flowGroupSchema))` on the document and the input, `parentId: Type.Optional(Type.String())` on `flowNodeSchema`. Validation stays permissive for documents without groups. Tests: round-trip, a node whose parent is missing is rejected by `hydrateFlow` (parent dropped, node kept).
- [x] `document.ts`: `BuilderNode` becomes `FlowBuilderNode | GroupBuilderNode`; hydrate puts frames first and converts child positions to relative; serialize converts back to absolute. Tests.
- [x] Store: `groupNodes(ids)` fits a frame around the selection with 24 px padding and a 32 px title band, `ungroup(id)`, `renameGroup(id, label)`; a `remove` change on a frame becomes ungroup + remove; on drag end, adopt or release by containment; `setNodePositions` (tidy up) re-fits frames around their children; `duplicateNodes` keeps copies in their group. Tests for each.
- [x] `group-node.tsx`: frame with the label at the top-left, `NodeResizer` while selected, dashed border in the ring colour when selected, the toolbar offers Rename, Ungroup, Delete. Frames sit under nodes (`zIndex` from React Flow's parent ordering).
- [x] Consumers that iterate `state.nodes` skip frames: left panel (a selected frame shows a group settings panel with the label field), flow outline, `useFlowProblems` (serialize already excludes them), run selectors, `useCanvasHotkeys` duplicate, node placement bounds (frames count as taken space).
- [x] The AI's `applyDocument` replaces the document; a result without `groups` drops them. Accepted for now and noted in `docs/web-ui.md`.

### 8. Wrap up

- [x] `docs/web-ui.md` canvas section: card, selection, groups, pointer model, menus, reconnect, zoom.
- [x] Format, lint, typecheck, unit tests. Run the canvas e2e specs (`responsive-canvas`, `leave-history`, `first-click`) with the local database recipe from `docs/plans/2026-09-08-data-tables.md`; the two pre-existing failures in `workspace` and `data` stay out of scope.
- [x] Browser check on the running dev server: select, group, drag a group, reconnect an edge, right-click, double-click, zoom to 1.25 and 0.25.
