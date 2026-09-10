import type { FlowApiSummary } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { memoryStores } from "../runs/test-stores";
import { createApiKeyVerifier } from "./verify";
import { createMachineRoutes } from "./routes";
import { flowDocument, memoryApiKeyStore, node } from "./test-support";

const alice = "did:privy:alice";
const bob = "did:privy:bob";

const quote = flowDocument(
  "flow-quote",
  "Price quote",
  [
    node("call", "trigger.api", {
      description: "Quote a swap",
      inputs: [{ name: "amount", type: "number", description: "How much", required: true }],
    }),
    node("out", "logic.return", { outputs: [{ name: "price", value: "{{input.value.amount}}0" }] }),
  ],
  [{ id: "e", source: "call", sourceHandle: "input", target: "out", targetHandle: "value" }],
);

const nightly = flowDocument("flow-nightly", "Nightly", [node("t", "trigger.schedule")]);

const draft = flowDocument("flow-draft", "Draft quote", [node("call", "trigger.api")]);

async function fixture(callsPerMinute?: number) {
  const stores = memoryStores([
    { ownerId: alice, flow: quote, enabled: true },
    { ownerId: alice, flow: nightly, enabled: true },
    { ownerId: alice, flow: draft, enabled: false },
    {
      ownerId: bob,
      flow: flowDocument("flow-bob", "Bob", [node("call", "trigger.api")]),
      enabled: true,
    },
  ]);
  const { store: keys } = memoryApiKeyStore();
  const issue = async (ownerId: string) => {
    const { generateApiKey, hashApiKey, keyDisplayPrefix } = await import("./keys");
    const key = generateApiKey();
    await keys.create(ownerId, "test", hashApiKey(key), keyDisplayPrefix(key));
    return key;
  };
  const app = new Elysia().use(
    createMachineRoutes({
      flows: stores.flows,
      runs: stores.runs,
      verifier: createApiKeyVerifier(keys),
      callsPerMinute,
    }),
  );
  const call = (method: string, path: string, token: string, body?: unknown) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { call, issue, keys, stores };
}

describe("GET /v1/flows", () => {
  test("lists the caller's active API flows with the schema they declare", async () => {
    const { call, issue } = await fixture();
    const response = await call("GET", "/v1/flows", await issue(alice));
    expect(response.status).toBe(200);
    expect((await response.json()) as { flows: FlowApiSummary[] }).toEqual({
      flows: [
        {
          id: "flow-quote",
          name: "Price quote",
          description: "Quote a swap",
          inputs: [{ name: "amount", type: "number", description: "How much", required: true }],
          outputs: ["price"],
        },
      ],
    });
  });

  test("refuses a Privy token, a missing header and an unknown key", async () => {
    const { call } = await fixture();
    expect((await call("GET", "/v1/flows", "eyJhbGciOi.privy")).status).toBe(401);
    expect((await call("GET", "/v1/flows", "")).status).toBe(401);
    expect((await call("GET", "/v1/flows", "ak_neverIssued")).status).toBe(401);
  });

  test("a revoked key stops working", async () => {
    const { call, issue, keys } = await fixture();
    const key = await issue(alice);
    expect((await call("GET", "/v1/flows", key)).status).toBe(200);
    const [issued] = await keys.list(alice);
    expect(await keys.revoke(alice, issued!.id)).toBe(true);
    expect((await call("GET", "/v1/flows", key)).status).toBe(401);
  });

  test("records that the key was used", async () => {
    const { call, issue, keys } = await fixture();
    const key = await issue(alice);
    await call("GET", "/v1/flows", key);
    const [used] = await keys.list(alice);
    expect(used?.lastUsedAt).toBeString();
  });
});

describe("POST /v1/flows/:id/invoke", () => {
  test("runs the flow and answers with what its Return node produced", async () => {
    const { call, issue } = await fixture();
    const response = await call("POST", "/v1/flows/flow-quote/invoke", await issue(alice), {
      amount: 2,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "succeeded", output: { price: "20" } });
  });

  test("names every input that was wrong", async () => {
    const { call, issue } = await fixture();
    const response = await call("POST", "/v1/flows/flow-quote/invoke", await issue(alice), {
      amount: "soon",
      extra: 1,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "invalid_request",
      problems: [
        { input: "amount", message: "amount must be a number." },
        { input: "extra", message: "extra is not an input of this flow." },
      ],
    });
  });

  test("hides another owner's flow, a flow that is off and one with no API trigger", async () => {
    const { call, issue } = await fixture();
    const key = await issue(alice);
    expect((await call("POST", "/v1/flows/flow-bob/invoke", key, {})).status).toBe(404);
    expect((await call("POST", "/v1/flows/flow-draft/invoke", key, {})).status).toBe(404);
    expect((await call("POST", "/v1/flows/flow-nightly/invoke", key, {})).status).toBe(404);
  });

  test("refuses a run that stops on a screen", async () => {
    const stores = memoryStores([
      {
        ownerId: alice,
        flow: flowDocument(
          "flow-screen",
          "Asks",
          [node("call", "trigger.api"), node("ask", "screen.page")],
          [{ id: "e", source: "call", sourceHandle: "input", target: "ask", targetHandle: "data" }],
        ),
        enabled: true,
      },
    ]);
    const { store: keys } = memoryApiKeyStore();
    const { generateApiKey, hashApiKey, keyDisplayPrefix } = await import("./keys");
    const key = generateApiKey();
    await keys.create(alice, "test", hashApiKey(key), keyDisplayPrefix(key));
    const app = new Elysia().use(
      createMachineRoutes({
        flows: stores.flows,
        runs: stores.runs,
        verifier: createApiKeyVerifier(keys),
      }),
    );
    const response = await app.handle(
      new Request("http://localhost/v1/flows/flow-screen/invoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "waiting_on_screen" });
    /* The run is still recorded, so the owner can see where it stopped. */
    expect(stores.runRecords).toHaveLength(1);
  });

  test("counts invocations against the caller's own rate limit", async () => {
    const { call, issue } = await fixture(1);
    const key = await issue(alice);
    expect((await call("POST", "/v1/flows/flow-quote/invoke", key, { amount: 1 })).status).toBe(
      200,
    );
    const limited = await call("POST", "/v1/flows/flow-quote/invoke", key, { amount: 1 });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  test("records the run with the API as its source", async () => {
    const { call, issue, stores } = await fixture();
    await call("POST", "/v1/flows/flow-quote/invoke", await issue(alice), { amount: 1 });
    expect(stores.runRecords.map((record) => record.source)).toEqual(["api"]);
  });
});
