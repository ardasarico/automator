import { flowRunSources, type FlowDocument, type FlowRunSource } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createFlowStore } from "./flows";
import { migrate } from "./migrations";
import { createRunStore } from "./runs";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

/* The contract's own list, so a source added to it has to be storable before the suite passes. */
const sources: FlowRunSource[] = [...flowRunSources];

describe.skipIf(!url)("run sources", () => {
  test("every source the contract names can be stored", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    const ownerId = `did:privy:run-sources-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const { flow } = await createFlowStore(sql).create(ownerId, {
        version: 1,
        name: "Every source",
        description: "",
        nodes: [],
        edges: [],
      });
      const runs = createRunStore(sql);
      const document: FlowDocument = { ...flow };

      const stored: FlowRunSource[] = [];
      for (const source of sources) {
        const record = await runs.create(
          ownerId,
          document,
          {
            id: crypto.randomUUID(),
            flowId: flow.id,
            status: "succeeded",
            startedAt: "2026-09-10T10:00:00.000Z",
            finishedAt: "2026-09-10T10:00:01.000Z",
            trigger: { nodeId: null },
            nodes: [],
            variables: {},
          },
          source,
        );
        stored.push(record.source);
      }
      expect(stored).toEqual(sources);
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test("keeps the run-level output a Return node produced", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    const ownerId = `did:privy:run-output-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const { flow } = await createFlowStore(sql).create(ownerId, {
        version: 1,
        name: "Answers",
        description: "",
        nodes: [],
        edges: [],
      });
      const runs = createRunStore(sql);
      const id = crypto.randomUUID();
      await runs.create(
        ownerId,
        flow,
        {
          id,
          flowId: flow.id,
          status: "succeeded",
          startedAt: "2026-09-10T10:00:00.000Z",
          finishedAt: "2026-09-10T10:00:01.000Z",
          trigger: { nodeId: null },
          nodes: [],
          variables: {},
          output: { price: "1800.42" },
        },
        "api",
      );
      const found = await runs.find(ownerId, id);
      expect(found?.run.output).toEqual({ price: "1800.42" });
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});
