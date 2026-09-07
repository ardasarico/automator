import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createFlowStore } from "./flows";
import { createFlowVersionStore, flowVersionLimit } from "./flow-versions";
import { migrate } from "./migrations";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

const input = {
  version: 1 as const,
  name: "Ticket checkout",
  description: "Verify, pay, issue.",
  nodes: [
    {
      id: "n1",
      type: "trigger.miniapp-open" as const,
      position: { x: 0, y: 0 },
      label: "Mini-app opened",
      config: {},
    },
    {
      id: "n2",
      type: "usdc.payment" as const,
      position: { x: 300, y: 0 },
      label: "Pay",
      config: { amount: "5" },
    },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }],
};

describe.skipIf(!url)("flow versions store", () => {
  test.skipIf(!url)(
    "numbers versions per flow, scopes reads to the owner, and cascades",
    async () => {
      // Never point this at a database with real data: the test users are deleted.
      const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
      try {
        await migrate(sql);
        const users = createUserStore(sql);
        const flows = createFlowStore(sql);
        const versions = createFlowVersionStore(sql);
        await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
        await users.sync("did:privy:test-a", "0xaaa");
        await users.sync("did:privy:test-b", null);

        const flow = await flows.create("did:privy:test-a", input);
        const other = await flows.create("did:privy:test-a", { ...input, name: "Other" });

        // Another owner cannot record against the flow, and nothing is stored for them.
        expect(await versions.record("did:privy:test-b", flow.flow.id, input)).toBeNull();
        expect(await versions.list("did:privy:test-a", flow.flow.id)).toEqual([]);

        const first = await versions.record("did:privy:test-a", flow.flow.id, input);
        expect(first).toMatchObject({
          number: 1,
          name: input.name,
          description: input.description,
          document: { ...input, id: flow.flow.id },
        });
        expect(Date.parse(first!.createdAt)).not.toBeNaN();

        const trimmed = { ...input, name: "Trimmed", nodes: [input.nodes[0]!], edges: [] };
        const second = await versions.record("did:privy:test-a", flow.flow.id, trimmed);
        expect(second?.number).toBe(2);
        // Numbers count per flow, not globally.
        expect((await versions.record("did:privy:test-a", other.flow.id, input))?.number).toBe(1);

        expect(await versions.list("did:privy:test-a", flow.flow.id)).toEqual([
          {
            id: second!.id,
            number: 2,
            name: "Trimmed",
            createdAt: second!.createdAt,
            nodeCount: 1,
          },
          { id: first!.id, number: 1, name: input.name, createdAt: first!.createdAt, nodeCount: 2 },
        ]);
        expect(await versions.list("did:privy:test-b", flow.flow.id)).toEqual([]);

        expect(await versions.find("did:privy:test-a", flow.flow.id, 1)).toEqual(first);
        expect(await versions.find("did:privy:test-a", flow.flow.id, 2)).toEqual(second);
        expect(await versions.find("did:privy:test-a", flow.flow.id, 3)).toBeNull();
        expect(await versions.find("did:privy:test-b", flow.flow.id, 1)).toBeNull();

        // A chain id survives the round trip and is absent when the document names none.
        const chained = await versions.record("did:privy:test-a", flow.flow.id, {
          ...input,
          chainId: 4801,
        });
        expect(
          (await versions.find("did:privy:test-a", flow.flow.id, chained!.number))?.document,
        ).toEqual({ ...input, id: flow.flow.id, chainId: 4801 });
        expect("chainId" in first!.document).toBe(false);

        // Deleting the flow removes its versions with it.
        await flows.delete("did:privy:test-a", flow.flow.id);
        expect(await versions.list("did:privy:test-a", flow.flow.id)).toEqual([]);

        await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      } finally {
        await sql.close({ timeout: 5 });
      }
    },
  );

  test.skipIf(!url)(`keeps only the newest ${flowVersionLimit} versions`, async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const versions = createFlowVersionStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", "0xaaa");
      const flow = await flows.create("did:privy:test-a", input);

      for (let index = 1; index <= flowVersionLimit + 3; index += 1)
        await versions.record("did:privy:test-a", flow.flow.id, { ...input, name: `v${index}` });

      const listed = await versions.list("did:privy:test-a", flow.flow.id);
      expect(listed).toHaveLength(flowVersionLimit);
      expect(listed[0]?.number).toBe(flowVersionLimit + 3);
      expect(listed.at(-1)?.number).toBe(4);
      expect(await versions.find("did:privy:test-a", flow.flow.id, 3)).toBeNull();
      // Numbering keeps counting from the newest, pruned rows included.
      const next = await versions.record("did:privy:test-a", flow.flow.id, input);
      expect(next?.number).toBe(flowVersionLimit + 4);

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});
