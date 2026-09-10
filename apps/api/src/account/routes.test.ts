import { describe, expect, test } from "bun:test";
import { accountUsageContract, parseResponse, type AccountUsage } from "@automator/contracts";
import type { AccountStore } from "@automator/db";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import { createAccountRoutes } from "./routes";

const identity: IdentityProvider = {
  verify: async (token) => (token === "alice" ? { id: "did:privy:alice", expiresAt: 2e9 } : null),
  walletAddress: async () => null,
};

const usage: AccountUsage = {
  flows: 2,
  activeFlows: 1,
  runsLast30Days: { manual: 3, webhook: 1, schedule: 0, miniapp: 0, event: 0, watch: 0, api: 0 },
  secrets: 1,
  listings: 0,
  since: "2026-08-08T12:00:00.000Z",
};

function fixture() {
  const asked: string[] = [];
  const account: AccountStore = {
    usage: async (ownerId) => {
      asked.push(ownerId);
      return usage;
    },
  };
  const app = new Elysia().use(createAccountRoutes({ account, identity }));
  const call = (token?: string) =>
    app.handle(
      new Request("http://localhost/account/usage", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    );
  return { call, asked };
}

describe("account routes", () => {
  test("answers the caller's usage", async () => {
    const { call, asked } = fixture();
    const response = await call("alice");
    expect(response.status).toBe(200);
    const parsed = parseResponse(accountUsageContract, response.status, await response.json());
    expect(parsed).toEqual({ status: 200, data: usage });
    expect(asked).toEqual(["did:privy:alice"]);
  });

  test("needs a session", async () => {
    const { call, asked } = fixture();
    expect((await call()).status).toBe(401);
    expect((await call("stranger")).status).toBe(401);
    expect(asked).toEqual([]);
  });
});
