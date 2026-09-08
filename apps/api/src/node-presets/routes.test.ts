import { describe, expect, test } from "bun:test";
import type { NodePreset } from "@automator/contracts";
import { NodePresetLimitError, type NodePresetStore } from "@automator/db";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import { createNodePresetRoutes } from "./routes";

const identity: IdentityProvider = {
  verify: async (token) =>
    token === "alice"
      ? { id: "did:privy:alice", expiresAt: 2e9 }
      : token === "bob"
        ? { id: "did:privy:bob", expiresAt: 2e9 }
        : null,
  walletAddress: async () => null,
};

function fixture(limit = 50) {
  const rows = new Map<string, { ownerId: string; preset: NodePreset }>();
  const nodePresets: NodePresetStore = {
    list: async (ownerId) =>
      [...rows.values()].filter((row) => row.ownerId === ownerId).map((row) => row.preset),
    create: async (ownerId, input) => {
      if ([...rows.values()].filter((row) => row.ownerId === ownerId).length >= limit)
        throw new NodePresetLimitError("too many");
      const at = "2026-09-08T10:00:00.000Z";
      const preset: NodePreset = {
        id: `preset-${rows.size + 1}`,
        ...input,
        createdAt: at,
        updatedAt: at,
      };
      rows.set(preset.id, { ownerId, preset });
      return preset;
    },
    remove: async (ownerId, id) => {
      const row = rows.get(id);
      if (!row || row.ownerId !== ownerId) return false;
      rows.delete(id);
      return true;
    },
  };
  const app = new Elysia().use(createNodePresetRoutes({ nodePresets, identity }));
  const call = (method: string, path: string, body?: unknown, token = "alice") =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { call, rows };
}

describe("node preset routes", () => {
  test("saves a node's settings and lists only the owner's presets", async () => {
    const { call } = fixture();
    const created = await call("POST", "/node-presets", {
      name: "Team ping",
      type: "notify.discord",
      label: "Announce",
      config: { content: "Ready", username: "Automator" },
    });
    expect(created.status).toBe(201);
    const preset = (await created.json()) as NodePreset;
    expect(preset).toMatchObject({ name: "Team ping", type: "notify.discord" });

    const mine = (await (await call("GET", "/node-presets")).json()) as { presets: NodePreset[] };
    expect(mine.presets.map((entry) => entry.id)).toEqual([preset.id]);
    const theirs = (await (await call("GET", "/node-presets", undefined, "bob")).json()) as {
      presets: NodePreset[];
    };
    expect(theirs.presets).toEqual([]);
  });

  test("a pasted credential never reaches the stored preset", async () => {
    const { call } = fixture();
    const created = await call("POST", "/node-presets", {
      name: "Team ping",
      type: "notify.discord",
      label: "Announce",
      config: { webhookUrl: "https://discord.com/api/webhooks/secret", content: "Ready" },
    });
    const preset = (await created.json()) as NodePreset;
    expect(JSON.stringify(preset)).not.toContain("discord.com/api/webhooks");
    expect(preset.config.content).toBe("Ready");
  });

  test("an unusable preset is unprocessable and the cap answers 409", async () => {
    const { call } = fixture(1);
    const bad = await call("POST", "/node-presets", { name: "", type: "notify.discord" });
    expect(bad.status).toBe(422);
    await call("POST", "/node-presets", {
      name: "One",
      type: "logic.wait",
      label: "Wait",
      config: {},
    });
    const capped = await call("POST", "/node-presets", {
      name: "Two",
      type: "logic.wait",
      label: "Wait",
      config: {},
    });
    expect(capped.status).toBe(409);
    expect(await capped.json()).toEqual({ error: "conflict" });
  });

  test("only the owner deletes a preset", async () => {
    const { call } = fixture();
    const created = await call("POST", "/node-presets", {
      name: "One",
      type: "logic.wait",
      label: "Wait",
      config: {},
    });
    const preset = (await created.json()) as NodePreset;
    expect((await call("DELETE", `/node-presets/${preset.id}`, undefined, "bob")).status).toBe(404);
    const removed = await call("DELETE", `/node-presets/${preset.id}`);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ id: preset.id });
  });
});
