import { expect, test } from "bun:test";
import type { PaymentPolicy, PaymentPolicyState } from "@automator/contracts";
import { PaymentPolicyOwnerMissingError } from "@automator/db";
import { createApp } from "../app";
import type { IdentityProvider } from "../auth/privy";
import type { PaymentPolicyAccess } from "./payment-policy";

const policy: PaymentPolicy = {
  enabled: true,
  recipients: [],
  limits: [{ chainId: 84532, asset: "usdc", perTransfer: "2", perDay: "10" }],
};
const state = (policy: PaymentPolicy): PaymentPolicyState => ({
  policy,
  day: "2026-09-08",
  usage: [],
});
const identity: IdentityProvider = {
  verify: async (token) => (token === "invalid" ? null : { id: token, expiresAt: 2e9 }),
  walletAddress: async () => null,
  embeddedWallet: async () => null,
};
function app(paymentPolicies?: PaymentPolicyAccess) {
  const instance = createApp({ database: { check: async () => "up" }, identity, paymentPolicies });
  return (method = "GET", body?: unknown, token: string | null = "alice") =>
    instance.handle(
      new Request("http://localhost/wallet/payment-policy?ownerId=bob", {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          "content-type": "application/json",
        },
        ...(method === "PUT" ? { body: JSON.stringify(body) } : {}),
      }),
    );
}

test("authenticates reads and updates before semantic validation", async () => {
  const call = app();
  for (const token of [null, "invalid"]) {
    expect((await call("GET", undefined, token)).status).toBe(401);
    expect((await call("PUT", { bad: true }, token)).status).toBe(401);
  }
  expect((await call()).status).toBe(503);
  expect((await call("PUT", policy)).status).toBe(503);
});

test("reads and updates only the authenticated owner and normalizes exact amounts", async () => {
  const records = new Map<string, PaymentPolicy>([
    ["alice", policy],
    ["bob", { enabled: false, recipients: [], limits: [] }],
  ]);
  const call = app({
    get: async (owner) => state(records.get(owner)!),
    save: async (owner, value) => {
      records.set(owner, value);
      return state(value);
    },
  });
  const saved = await call("PUT", {
    ...policy,
    recipients: [`0x${"AB".repeat(20)}`, `0x${"ab".repeat(20)}`],
    limits: [{ ...policy.limits[0], perTransfer: "2.0000000" }],
  });
  expect(saved.status).toBe(200);
  expect(saved.headers.get("cache-control")).toBe("no-store");
  expect(((await saved.json()) as PaymentPolicyState).policy).toEqual({
    ...policy,
    recipients: [`0x${"ab".repeat(20)}`],
  });
  expect(((await (await call()).json()) as PaymentPolicyState).policy.enabled).toBe(true);
  expect(
    ((await (await call("GET", undefined, "bob")).json()) as PaymentPolicyState).policy.enabled,
  ).toBe(false);
});

test("rejects invalid rules and identity injection without saving", async () => {
  let writes = 0;
  const call = app({
    get: async () => state(policy),
    save: async (_, value) => {
      writes++;
      return state(value);
    },
  });
  const invalid: unknown[] = [
    { ...policy, ownerId: "bob" },
    { ...policy, limits: [] },
    { ...policy, recipients: ["not-an-address"] },
    { ...policy, limits: [policy.limits[0], policy.limits[0]] },
    ...["0", "-1", "1e6", "0.0000001", "9".repeat(80)].map((perTransfer) => ({
      ...policy,
      limits: [{ ...policy.limits[0], perTransfer }],
    })),
    { ...policy, limits: [{ ...policy.limits[0], chainId: 1 }] },
  ];
  for (const body of invalid) {
    const response = await call("PUT", body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  }
  expect(writes).toBe(0);
});

test("sanitizes store failures and invalid stored responses; missing profiles require auth", async () => {
  for (const method of ["GET", "PUT"]) {
    for (const [error, code] of [
      [new PaymentPolicyOwnerMissingError(), 401],
      [new Error("secret database detail"), 503],
    ] as const) {
      const fail = async () => {
        throw error;
      };
      const response = await app({ get: fail, save: fail })(method, policy);
      expect(response.status).toBe(code);
      expect(await response.json()).toEqual({
        error: code === 401 ? "unauthorized" : "unavailable",
      });
    }
    const malformed = async () => ({ policy: "secret" }) as unknown as PaymentPolicyState;
    const response = await app({ get: malformed, save: malformed })(method, policy);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "unavailable" });
  }
});
