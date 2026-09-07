# Use React Flow for the builder canvas

Status: Accepted

## Context

The flow builder needs a node-based canvas with draggable nodes, typed ports, connections, selection, pan and zoom, and a minimap, styled with Automator's tokens in both themes. The canvas is the product's main surface, so it must be polished quickly and stay easy to extend with persistence and AI editing.

## Decision

- Use React Flow (`@xyflow/react` 12) for the canvas in `apps/web`. Nodes are React components restyled through the builder tokens; React Flow's own colour mode stays unused.
- Keep the flow document independent of React Flow: `packages/contracts` defines `FlowDocument` (versioned nodes with a catalog type id, position, label and per-type `config`; edges with handle ids), and `serializeFlow` / `hydrateFlow` in the web app convert between the document and React Flow's node and edge objects.
- Hold builder state in a zustand store created per mounted builder. Connection rules (no self-loops, no duplicates, one source per input, no cycles) live in the store so the canvas and future callers share them.
- Rejected alternatives: Rete.js (rendering through its own plugin system, weaker React integration), jsPlumb Toolkit and JointJS+ (commercial licences), tldraw (whiteboard model), Cytoscape.js (analysis oriented, non-React nodes), and a custom canvas (too much to build and maintain for the hackathon).

## Consequences

React Flow owns interaction and layout; Automator owns the document, the catalog and the rules. The flows API can validate and store `FlowDocument` without knowing React Flow. Node types are dummy entries in a web catalog until execution semantics exist. React Flow does not virtualise, which is acceptable at the expected flow sizes.
