import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createAiMessageStore } from "./ai-messages";
import { createFlowStore } from "./flows";
import { migrate } from "./migrations";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

const input = {
  version: 1 as const,
  name: "Ping",
  description: "",
  nodes: [
    {
      id: "n1",
      type: "trigger.manual" as const,
      position: { x: 0, y: 0 },
      label: "Run",
      config: {},
    },
  ],
  edges: [],
};

describe.skipIf(!url)("ai messages store", () => {
  test.skipIf(!url)("appends in order, updates proposal state, and cascades", async () => {
    // Never point this at a database with real data: the test users are deleted.
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const messages = createAiMessageStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", null);
      const flow = await flows.create("did:privy:test-a", input);

      const user = await messages.append(flow.flow.id, {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Make a flow" }],
        context: { selection: ["n1"] },
      });
      expect(user.createdAt).toMatch(/^\d{4}-/);
      await messages.append(flow.flow.id, {
        id: "m2",
        role: "assistant",
        parts: [
          { type: "text", text: "Here it is." },
          {
            type: "proposal",
            document: input,
            verification: { checks: [], warnings: [] },
            replaces: true,
            state: "pending",
          },
        ],
      });

      const listed = await messages.list(flow.flow.id);
      expect(listed.map((message) => message.id)).toEqual(["m1", "m2"]);
      expect(listed[0]!.context).toEqual({ selection: ["n1"] });

      const applied = await messages.setProposalState(flow.flow.id, "m2", "applied");
      expect(applied?.parts[1]).toMatchObject({ type: "proposal", state: "applied" });
      expect(await messages.setProposalState(flow.flow.id, "nope", "applied")).toBeNull();

      await messages.append(flow.flow.id, {
        id: "m3",
        role: "assistant",
        parts: [
          {
            type: "proposal",
            document: input,
            verification: { checks: [], warnings: [] },
            replaces: false,
            state: "pending",
          },
        ],
      });
      await messages.markPendingStale(flow.flow.id);
      const afterStale = await messages.list(flow.flow.id);
      expect(afterStale[1]!.parts[1]).toMatchObject({ state: "applied" });
      expect(afterStale[2]!.parts[0]).toMatchObject({ state: "stale" });

      expect(await messages.clear(flow.flow.id)).toBe(true);
      expect(await messages.list(flow.flow.id)).toEqual([]);

      await messages.append(flow.flow.id, { id: "m4", role: "user", parts: [] });
      await sql`DELETE FROM automator_flows WHERE id = ${flow.flow.id}`;
      expect(await messages.list(flow.flow.id)).toEqual([]);
    } finally {
      await sql.close();
    }
  });
});
