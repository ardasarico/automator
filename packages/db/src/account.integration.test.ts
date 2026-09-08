import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createAccountStore } from "./account";
import { createFlowStore } from "./flows";
import { createListingStore } from "./listings";
import { migrate } from "./migrations";
import { createRunStore } from "./runs";
import { createSecretStore } from "./secrets";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

const input = {
  version: 1 as const,
  name: "Counted",
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

function run(flowId: string, startedAt: string) {
  return {
    id: crypto.randomUUID(),
    flowId,
    status: "succeeded" as const,
    startedAt,
    finishedAt: startedAt,
    trigger: { nodeId: "n1", payload: {} },
    nodes: [{ nodeId: "n1", status: "succeeded" as const, outputs: { run: {} } }],
    variables: {},
  };
}

describe.skipIf(!url)("account store", () => {
  test.skipIf(!url)(
    "counts the owner's flows, recent runs by source, secrets and listings",
    async () => {
      // Never point this at a database with real data: test rows are deleted by id prefix.
      const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
      try {
        await migrate(sql);
        const users = createUserStore(sql);
        const flows = createFlowStore(sql);
        const runs = createRunStore(sql);
        const secrets = createSecretStore(sql);
        const listings = createListingStore(sql);
        const account = createAccountStore(sql);
        await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
        await users.sync("did:privy:test-a", "0xaaa");
        await users.saveProfile("did:privy:test-a", { name: "Arda", username: "test_arda" });
        await users.sync("did:privy:test-b", null);

        const now = new Date("2026-09-07T12:00:00.000Z");
        expect(await account.usage("did:privy:test-a", now)).toEqual({
          flows: 0,
          activeFlows: 0,
          runsLast30Days: { manual: 0, webhook: 0, schedule: 0, miniapp: 0, event: 0, watch: 0 },
          secrets: 0,
          listings: 0,
          since: "2026-08-08T12:00:00.000Z",
        });

        const first = await flows.create("did:privy:test-a", input);
        const second = await flows.create("did:privy:test-a", { ...input, name: "Second" });
        await flows.setEnabled("did:privy:test-a", second.flow.id, true);
        const other = await flows.create("did:privy:test-b", input);

        await runs.create(
          "did:privy:test-a",
          first.flow,
          run(first.flow.id, "2026-09-07T11:00:00.000Z"),
        );
        await runs.create(
          "did:privy:test-a",
          first.flow,
          run(first.flow.id, "2026-09-01T11:00:00.000Z"),
          "webhook",
        );
        await runs.create(
          "did:privy:test-a",
          second.flow,
          run(second.flow.id, "2026-08-20T11:00:00.000Z"),
          "webhook",
        );
        await runs.create(
          "did:privy:test-a",
          second.flow,
          run(second.flow.id, "2026-07-01T11:00:00.000Z"),
          "schedule",
        );
        await runs.create(
          "did:privy:test-b",
          other.flow,
          run(other.flow.id, "2026-09-07T11:00:00.000Z"),
        );

        await secrets.put("did:privy:test-a", "discord_hook", "v1.x");
        await secrets.put("did:privy:test-a", "resend_key", "v1.y");
        await listings.publish("did:privy:test-a", first.flow, {
          name: "Counted",
          description: "",
        });

        expect(await account.usage("did:privy:test-a", now)).toEqual({
          flows: 2,
          activeFlows: 1,
          runsLast30Days: { manual: 1, webhook: 2, schedule: 0, miniapp: 0, event: 0, watch: 0 },
          secrets: 2,
          listings: 1,
          since: "2026-08-08T12:00:00.000Z",
        });
        expect(await account.usage("did:privy:test-b", now)).toMatchObject({
          flows: 1,
          runsLast30Days: { manual: 1, webhook: 0, schedule: 0, miniapp: 0, event: 0 },
        });

        await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      } finally {
        await sql.close({ timeout: 5 });
      }
    },
  );
});
