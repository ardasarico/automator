import type { FlowDocument } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";
import { createStubChain } from "./chain-stub";

const document: FlowDocument = {
  version: 1,
  id: "flow",
  name: "Cancel",
  description: "",
  nodes: [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Start", config: {} },
    {
      id: "wait",
      type: "logic.wait",
      position: { x: 1, y: 0 },
      label: "Wait",
      config: { seconds: 5 },
    },
    {
      id: "set",
      type: "logic.set-variable",
      position: { x: 2, y: 0 },
      label: "Set",
      config: { name: "x", value: "1" },
    },
  ],
  edges: [
    { id: "e1", source: "start", sourceHandle: "run", target: "wait", targetHandle: "in" },
    { id: "e2", source: "wait", sourceHandle: "done", target: "set", targetHandle: "value" },
  ],
};

describe("cancelling a run", () => {
  test("an aborted signal stops the node in flight and skips the rest", async () => {
    const controller = new AbortController();
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const pending = runFlow(document, { signal: controller.signal, sleep });
    setTimeout(() => controller.abort(), 10);
    const run = await pending;
    expect(run.status).toBe("failed");
    expect(run.error).toBe("The run was cancelled.");
    expect(run.nodes.map((node) => node.status)).toEqual(["succeeded", "failed", "skipped"]);
    expect(run.nodes[1]?.error).toBe("The run was cancelled.");
  });

  test("a signal already aborted runs nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = await runFlow(document, { signal: controller.signal, sleep: async () => {} });
    expect(run.status).toBe("failed");
    expect(run.error).toBe("The run was cancelled.");
    expect(run.nodes.every((node) => node.status === "skipped")).toBe(true);
  });

  test("without a signal the run completes as before", async () => {
    const run = await runFlow(document, { sleep: async () => {} });
    expect(run.status).toBe("succeeded");
    expect(run.variables).toEqual({ x: "1" });
  });

  test("cancelling a loop settles while its secrets resolver is still pending", async () => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const secrets = Promise.withResolvers<Record<string, string>>();
    const pending = runFlow(
      {
        ...document,
        nodes: [
          document.nodes[0]!,
          {
            id: "loop",
            type: "logic.for-each",
            label: "Loop",
            position: { x: 0, y: 0 },
            config: { items: "{{secrets.items}}" },
          },
        ],
        edges: [
          { id: "e", source: "start", sourceHandle: "run", target: "loop", targetHandle: "items" },
        ],
      },
      {
        signal: controller.signal,
        secrets: {
          get: async () => {
            started.resolve();
            return secrets.promise;
          },
        },
      },
    );
    await started.promise;
    controller.abort();
    const beforeSecretResolved = await Promise.race([
      pending,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 50)),
    ]);
    secrets.resolve({ items: "[]" });
    await pending;
    expect(beforeSecretResolved).toMatchObject({
      status: "failed",
      error: "The run was cancelled.",
    });
    expect(beforeSecretResolved?.nodes[1]).toMatchObject({
      status: "failed",
      error: "The run was cancelled.",
    });
  });

  test("cancelling the last loop body node preserves the run cancellation reason", async () => {
    const controller = new AbortController();
    const run = await runFlow(
      {
        ...document,
        nodes: [
          document.nodes[0]!,
          {
            id: "loop",
            type: "logic.for-each",
            label: "Loop",
            position: { x: 0, y: 0 },
            config: { items: "[1]" },
          },
          document.nodes[1]!,
        ],
        edges: [
          { id: "e1", source: "start", sourceHandle: "run", target: "loop", targetHandle: "items" },
          { id: "e2", source: "loop", sourceHandle: "item", target: "wait", targetHandle: "in" },
        ],
      },
      {
        signal: controller.signal,
        sleep: async () => {
          controller.abort();
        },
      },
    );
    expect(run).toMatchObject({ status: "failed", error: "The run was cancelled." });
  });

  test("cancelling an in-flight model request settles without running late tool calls", async () => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const answer = Promise.withResolvers<{
      content: null;
      toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
    }>();
    let fetched = false;
    const pending = runFlow(
      {
        ...document,
        nodes: [
          document.nodes[0]!,
          {
            id: "agent",
            type: "ai.agent",
            label: "Agent",
            position: { x: 0, y: 0 },
            config: { task: "Fetch", tools: ["http_get"], allowedHosts: ["example.com"] },
          },
        ],
        edges: [
          {
            id: "e",
            source: "start",
            sourceHandle: "run",
            target: "agent",
            targetHandle: "prompt",
          },
        ],
      },
      {
        signal: controller.signal,
        model: async () => {
          started.resolve();
          return answer.promise;
        },
        fetch: (async () => {
          fetched = true;
          return new Response("ok");
        }) as unknown as typeof fetch,
      },
    );
    await started.promise;
    controller.abort();
    const run = await pending;
    answer.resolve({
      content: null,
      toolCalls: [{ id: "c", name: "http_get", arguments: { url: "https://example.com" } }],
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toMatchObject({ status: "failed", error: "The run was cancelled." });
    expect(fetched).toBe(false);
  });

  test("cancelling during contract simulation prevents the subsequent live write", async () => {
    const controller = new AbortController();
    const chain = createStubChain({ mode: "live" });
    let writes = 0;
    chain.reader.simulateContract = async () => {
      controller.abort();
      return true;
    };
    chain.signer!.writeContract = async () => {
      writes += 1;
      return "0x1234";
    };
    const run = await runFlow(
      {
        ...document,
        nodes: [
          document.nodes[0]!,
          {
            id: "write",
            type: "onchain.write-contract",
            label: "Write",
            position: { x: 0, y: 0 },
            config: {
              address: "0x2222222222222222222222222222222222222222",
              abi: "function increment()",
              functionName: "increment",
            },
          },
        ],
        edges: [
          { id: "e", source: "start", sourceHandle: "run", target: "write", targetHandle: "args" },
        ],
      },
      { chain, signal: controller.signal },
    );
    expect(writes).toBe(0);
    expect(run).toMatchObject({ status: "failed", error: "The run was cancelled." });
  });
});
