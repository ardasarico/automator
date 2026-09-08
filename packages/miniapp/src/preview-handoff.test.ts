import { expect, test } from "bun:test";
import type { FlowDocument } from "@automator/contracts";
import { openPreview, receivePreview } from "./preview-handoff";

const flow: FlowDocument = {
  id: "unsaved",
  version: 1,
  name: "Ticket sales",
  description: "",
  nodes: [
    {
      id: "discord",
      type: "notify.discord",
      label: "Discord",
      position: { x: 0, y: 0 },
      config: { webhookUrl: "https://example.test/credential", content: "Unsaved message" },
    },
  ],
  edges: [],
};
const nonce = "a6c49b00-8890-4556-8098-a6ae55a8af9d";
function windowMock() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const timers = new Map<number, () => void>();
  const sent: { data: unknown; origin: string }[] = [];
  let nextTimer = 0;
  const host = {
    location: { hash: `#preview=${nonce}` },
    opener: null as unknown,
    closed: false,
    open: () => null as unknown,
    postMessage: (data: unknown, origin: string) => sent.push({ data, origin }),
    addEventListener: (_: string, handler: (event: MessageEvent) => void) => listeners.add(handler),
    removeEventListener: (_: string, handler: (event: MessageEvent) => void) =>
      listeners.delete(handler),
    setTimeout: (fn: () => void) => {
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    setInterval: (fn: () => void) => {
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    clearTimeout: (id: number) => timers.delete(id),
    clearInterval: (id: number) => timers.delete(id),
  };
  return {
    host,
    window: host as unknown as Window,
    sent,
    timers,
    listeners,
    emit: (data: unknown, origin: string, source: unknown) => {
      for (const handler of listeners) handler({ data, origin, source } as MessageEvent);
    },
  };
}

test("sender keeps exact unsaved credentials out of URL and binds origin, window and nonce", () => {
  const sender = windowMock();
  const popup = windowMock();
  let url = "";
  let closed = 0;
  sender.host.open = (...args: unknown[]) => {
    url = args[0] as string;
    return popup.window;
  };
  const snapshot = structuredClone(flow);
  const close = openPreview("https://runtime.test", snapshot, () => closed++, sender.window)!;
  expect(url).not.toContain("credential");
  expect(url).not.toContain("Unsaved");
  const requestNonce = new URLSearchParams(new URL(url).hash.slice(1)).get("preview");
  const ready = { type: "automator.preview.ready.v1", nonce: requestNonce, flowId: flow.id };
  sender.emit(ready, "https://evil.test", popup.window);
  sender.emit(ready, "https://runtime.test", {});
  sender.emit({ ...ready, nonce }, "https://runtime.test", popup.window);
  sender.emit({ ...ready, flowId: "another" }, "https://runtime.test", popup.window);
  expect(popup.sent).toHaveLength(0);
  snapshot.nodes[0]!.config.content = "Later edits";
  sender.emit(ready, "https://runtime.test", popup.window);
  expect(popup.sent[0]).toEqual({
    data: { type: "automator.preview.document.v1", nonce: requestNonce, document: flow },
    origin: "https://runtime.test",
  });
  sender.emit(ready, "https://runtime.test", popup.window);
  expect(popup.sent).toHaveLength(2); // Reload gets the same captured snapshot.
  close();
  expect(sender.listeners.size).toBe(0);
  expect(sender.timers.size).toBe(0);
  expect(closed).toBe(1);
});

test("receiver rejects spoofed sources, wrong origins/nonces/flow and malformed documents", () => {
  const receiver = windowMock();
  const opener = windowMock();
  receiver.host.opener = opener.window;
  const results: (FlowDocument | null)[] = [];
  receivePreview(flow.id, "https://builder.test", (doc) => results.push(doc), receiver.window);
  expect(opener.sent[0]?.origin).toBe("https://builder.test");
  const payload = { type: "automator.preview.document.v1", nonce, document: flow };
  receiver.emit(payload, "https://evil.test", opener.window);
  receiver.emit(payload, "https://builder.test", {});
  receiver.emit({ ...payload, nonce: "wrong" }, "https://builder.test", opener.window);
  receiver.emit(
    { ...payload, document: { ...flow, id: "another" } },
    "https://builder.test",
    opener.window,
  );
  receiver.emit({ ...payload, document: {} }, "https://builder.test", opener.window);
  expect(results).toHaveLength(0);
  receiver.emit(payload, "https://builder.test", opener.window);
  expect(results).toEqual([flow]);
  expect(receiver.timers.size).toBe(0);
  expect(receiver.listeners.size).toBe(0);
});

test("copied links, missing configuration and old document fragments cannot supply a document", () => {
  for (const scenario of ["no-opener", "no-origin", "old-fragment"]) {
    const receiver = windowMock();
    const opener = windowMock();
    receiver.host.opener = scenario === "no-opener" ? null : opener.window;
    if (scenario === "old-fragment")
      receiver.host.location.hash = `#${Buffer.from(JSON.stringify(flow)).toString("base64url")}`;
    const results: (FlowDocument | null)[] = [];
    receivePreview(
      flow.id,
      scenario === "no-origin" ? undefined : "https://builder.test",
      (doc) => results.push(doc),
      receiver.window,
    );
    expect(results).toEqual([null]);
    expect(opener.sent).toHaveLength(0);
  }
});

test("blocked popups, timeout and closed windows release the handoff", () => {
  const sender = windowMock();
  expect(openPreview("https://runtime.test", flow, () => {}, sender.window)).toBeNull();
  const popup = windowMock();
  sender.host.open = () => popup.window;
  openPreview("https://runtime.test", flow, () => {}, sender.window);
  sender.timers.values().next().value!();
  expect(sender.listeners.size).toBe(0);
  expect(sender.timers.size).toBe(0);
  openPreview("https://runtime.test", flow, () => {}, sender.window);
  popup.host.closed = true;
  [...sender.timers.values()][1]!();
  expect(sender.listeners.size).toBe(0);
  expect(sender.timers.size).toBe(0);
  const receiver = windowMock();
  receiver.host.opener = windowMock().window;
  const results: (FlowDocument | null)[] = [];
  receivePreview(flow.id, "https://builder.test", (doc) => results.push(doc), receiver.window);
  receiver.timers.values().next().value!();
  expect(results).toEqual([null]);
  expect(receiver.listeners.size).toBe(0);
  expect(receiver.timers.size).toBe(0);
});
