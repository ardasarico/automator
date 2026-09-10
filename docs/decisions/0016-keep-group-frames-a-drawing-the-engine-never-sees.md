# Keep group frames a drawing the engine never sees

Status: Accepted

## Context

The canvas needed a way to group nodes: a labelled frame that moves with its nodes and survives a save. React Flow models this as a parent node with children positioned relative to it. Putting that model into the flow document as a `group` node type would have made every consumer of `nodes` — the engine, validation, the AI generator, the miniature, the marketplace snapshot, the version diff — learn to skip a node that does not run, and would have changed what a node's `position` means depending on whether it has a parent.

## Decision

- **Groups are a separate optional list on the document**, `groups: { id, label, position, width, height }[]`, and a node names its frame with an optional `parentId`. The `nodes` list stays exactly the list of things that run.
- **Node positions in the document stay absolute.** Only the builder converts to the relative positions React Flow wants when it hydrates, and back when it serialises; a document that never had a group serialises byte for byte as before, with no `groups` key.
- **Nothing outside the builder handles groups.** The engine, validation, the AI, the miniature and the version comparison read `nodes` and `edges` as they always did. The document's referential check only adds that group ids are unique and a `parentId` names a group that exists. An AI rewrite that answers without `groups` drops them; that is accepted rather than taught to the model.
- **In the builder, frames are membership by geometry.** Dropping a node fully inside a frame adopts it, dragging it fully out releases it, deleting a frame frees its nodes unless they were selected with it, and every consumer that means "the nodes that run" reads them through one selector.

## Consequences

A group is a drawing, so it can never change what a flow does, and the engine and the AI stay as simple as they were. The database layer copies document fields one by one into its snapshots, so `groups` had to be added to each of them (flows, versions, runs, listings); a future document field will need the same round. A frame cannot be nested, and the AI cannot create or keep one; both can be added later without touching the engine.
