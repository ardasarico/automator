import type { FlowDocument, FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { findEntry, isScreenNode, screenPorts } from "./engine";

function node(id: string, type: FlowNode["type"]): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config: {} };
}

const document: FlowDocument = {
  version: 1,
  id: "f",
  name: "Checkout",
  description: "",
  nodes: [node("t", "trigger.miniapp-open"), node("p", "screen.page"), node("w", "logic.wait")],
  edges: [],
};

describe("findEntry", () => {
  test("returns the first mini-app trigger", () => {
    expect(findEntry(document)?.id).toBe("t");
  });

  test("returns null when the flow has no mini-app trigger", () => {
    expect(findEntry({ ...document, nodes: document.nodes.slice(1) })).toBeNull();
  });
});

describe("isScreenNode", () => {
  test("narrows to the screen types", () => {
    expect(isScreenNode(document.nodes[1]!)).toBe(true);
    expect(isScreenNode(document.nodes[2]!)).toBe(false);
  });
});

describe("screenPorts", () => {
  test("names the port each visitor action continues on", () => {
    expect(screenPorts("screen.page")).toEqual({ primary: "next" });
    expect(screenPorts("screen.form")).toEqual({ primary: "submitted" });
    expect(screenPorts("screen.confirmation")).toEqual({
      primary: "confirmed",
      secondary: "cancelled",
    });
    expect(screenPorts("screen.qr-code")).toEqual({ primary: "next" });
  });
});
