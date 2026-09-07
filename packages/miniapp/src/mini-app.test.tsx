import type { FlowDocument, FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MiniApp } from "./mini-app";

function node(id: string, type: FlowNode["type"], label: string, config = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label, config };
}

const document: FlowDocument = {
  version: 1,
  id: "f",
  name: "Tickets",
  description: "",
  nodes: [
    node("t", "trigger.miniapp-open", "Mini-app opened"),
    node("p", "screen.page", "Pick a ticket", { body: "Two left.", button: "Buy" }),
    node("f", "screen.form", "Your details", {
      fields: [{ id: "email", label: "Email", type: "email", required: true }],
    }),
    node("q", "screen.qr-code", "Your ticket", { value: "ticket-1", caption: "Show at the door" }),
  ],
  edges: [
    { id: "1", source: "t", target: "p", sourceHandle: "visitor" },
    { id: "2", source: "p", target: "f", sourceHandle: "next" },
    { id: "3", source: "f", target: "q", sourceHandle: "submitted" },
  ],
};

describe("MiniApp", () => {
  test("renders the working state until the opening run settles", () => {
    const html = renderToStaticMarkup(<MiniApp document={document} name="Tickets" />);
    expect(html).toContain('data-session="running"');
    expect(html).toContain("One moment");
  });

  test("renders a screen's configured copy", () => {
    const html = renderToStaticMarkup(<MiniApp document={document} startAt="p" />);
    expect(html).toContain('data-session="screen"');
    expect(html).toContain("Pick a ticket");
    expect(html).toContain("Two left.");
    expect(html).toContain(">Buy<");
  });

  test("starts on a requested screen and renders a form field and a QR code", () => {
    const form = renderToStaticMarkup(<MiniApp document={document} startAt="f" />);
    expect(form).toContain('type="email"');
    expect(form).toContain("required");
    expect(form).toContain(">Submit<");
    const qr = renderToStaticMarkup(<MiniApp document={document} startAt="q" />);
    expect(qr).toContain('aria-label="QR code: ticket-1"');
    expect(qr).toContain("Show at the door");
  });

  test("falls back to the node label when the config is empty", () => {
    const untitled = renderToStaticMarkup(
      <MiniApp
        document={{ ...document, nodes: document.nodes.map((n) => ({ ...n, config: {} })) }}
        startAt="p"
      />,
    );
    expect(untitled).toContain("Pick a ticket");
    expect(untitled).toContain(">Continue<");
  });
});
