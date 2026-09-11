import type { FlowDocument, FlowDocumentInput } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { restoreFlowGroups } from "./groups";

const node = (id: string, parentId?: string) => ({
  id,
  type: "trigger.manual" as const,
  position: { x: 0, y: 0 },
  label: id,
  config: {},
  ...(parentId === undefined ? {} : { parentId }),
});

const framed: Pick<FlowDocument, "nodes" | "groups"> = {
  nodes: [node("kept", "g1"), node("gone", "g1"), node("loose")],
  groups: [
    { id: "g1", label: "Checkout", position: { x: 0, y: 0 }, width: 400, height: 240 },
    { id: "g2", label: "Empty", position: { x: 500, y: 0 }, width: 400, height: 240 },
  ],
};

const draft = (...ids: string[]): FlowDocumentInput => ({
  version: 1,
  name: "Ping",
  description: "",
  nodes: ids.map((id) => node(id)),
  edges: [],
});

describe("restoreFlowGroups", () => {
  test("keeps the frames and the memberships of the nodes the draft kept", () => {
    const restored = restoreFlowGroups(draft("kept", "loose", "fresh"), framed);

    expect(restored.groups).toEqual(framed.groups);
    expect(restored.nodes.map((entry) => [entry.id, entry.parentId])).toEqual([
      ["kept", "g1"],
      ["loose", undefined],
      /* A node the draft added belongs to no frame. */
      ["fresh", undefined],
    ]);
  });

  test("a membership goes with the node the draft removed", () => {
    const restored = restoreFlowGroups(draft("kept"), framed);

    expect(restored.nodes.map((entry) => entry.id)).toEqual(["kept"]);
    /* The frame stays: an empty one is still drawn on the canvas. */
    expect(restored.groups?.map((group) => group.id)).toEqual(["g1", "g2"]);
  });

  test("a canvas without frames hands the draft back untouched", () => {
    const plain = draft("a");
    expect(restoreFlowGroups(plain, { nodes: [node("a")] })).toBe(plain);
  });

  test("a membership the draft already carries is left alone", () => {
    const carried: FlowDocumentInput = { ...draft(), nodes: [node("kept", "g2")] };

    expect(restoreFlowGroups(carried, framed).nodes[0]!.parentId).toBe("g2");
  });
});
