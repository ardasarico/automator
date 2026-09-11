import { documentTriggers, flowChainId, Value } from "@automator/contracts";
import type {
  FlowDocument,
  FlowDocumentInput,
  FlowNodeType,
  FlowRecord,
  FlowRunStatus,
  FlowSummary,
} from "@automator/contracts";
import type { SQL } from "bun";
import { recordFlowVersion } from "./flow-versions";
import { executionConfiguration } from "./polling-fence";

export class FlowOwnerMissingError extends Error {}

export type FlowRow = {
  id: string;
  name: string;
  description: string;
  document: Pick<FlowDocument, "version" | "chainId" | "nodes" | "edges" | "groups">;
  createdAt: Date;
  updatedAt: Date;
  enabled?: boolean;
  appPublished?: boolean;
  webhookToken?: string;
  pollingRevision: string;
};

/*
 * Every column a `FlowRecord` is built from, and the one mapping that builds it. Shared with the
 * listing store's fork, so a flow row reads back the same whichever store returned it: a column
 * added here reaches every producer at once, which is how `app_published` came to be missing
 * from a fork.
 */
export const ownerColumns = `id, name, description, document, enabled,
  app_published AS "appPublished", webhook_token AS "webhookToken",
  polling_revision AS "pollingRevision",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export function toRecord(row: Omit<FlowRow, "pollingRevision">): FlowRecord {
  const record: FlowRecord = {
    flow: {
      version: row.document.version,
      id: row.id,
      name: row.name,
      description: row.description,
      ...(row.document.chainId === undefined ? {} : { chainId: row.document.chainId }),
      nodes: row.document.nodes,
      edges: row.document.edges,
      ...(row.document.groups === undefined ? {} : { groups: row.document.groups }),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.enabled !== undefined) record.enabled = row.enabled;
  if (row.appPublished !== undefined) record.appPublished = row.appPublished;
  if (row.webhookToken !== undefined) record.webhookToken = row.webhookToken;
  return record;
}

export function documentTriggerTypes(nodes: readonly { type: FlowNodeType }[]): FlowNodeType[] {
  const types = nodes
    .map((node) => node.type)
    .filter((type) => type.startsWith("trigger.") || type === "world.verification-completed");
  return [...new Set(types)];
}

export type OwnedFlow = { ownerId: string; record: FlowRecord; pollingRevision: string };

function toDocument(input: FlowDocumentInput): FlowRow["document"] {
  return {
    version: input.version,
    ...(input.chainId === undefined ? {} : { chainId: input.chainId }),
    nodes: input.nodes,
    edges: input.edges,
    ...(input.groups === undefined ? {} : { groups: input.groups }),
  };
}

export function createFlowStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async list(ownerId: string): Promise<FlowSummary[]> {
      const db = connection();
      const rows = await db<
        (Omit<FlowSummary, "updatedAt" | "triggerTypes" | "triggers" | "outline" | "lastRun"> & {
          updatedAt: Date;
          nodes: {
            id: string;
            type: FlowNodeType;
            config?: Record<string, unknown>;
            x: number | null;
            y: number | null;
          }[];
          edges: { source: string; target: string }[];
          lastRunId: string | null;
          lastRunStatus: FlowRunStatus | null;
          lastRunStartedAt: Date | null;
        })[]
      >`
        SELECT f.id, f.name, f.description, f.updated_at AS "updatedAt", f.enabled,
          jsonb_array_length(f.document->'nodes') AS "nodeCount",
          (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'id', n->>'id', 'type', n->>'type', 'config', n->'config',
                    'x', n->'position'->'x', 'y', n->'position'->'y')
                  ORDER BY ordinality), '[]'::jsonb)
             FROM jsonb_array_elements(f.document->'nodes') WITH ORDINALITY AS t(n, ordinality)) AS nodes,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('source', e->>'source', 'target', e->>'target')
                  ORDER BY ordinality), '[]'::jsonb)
             FROM jsonb_array_elements(f.document->'edges') WITH ORDINALITY AS t(e, ordinality)) AS edges,
          run.id AS "lastRunId", run.status AS "lastRunStatus", run.started_at AS "lastRunStartedAt"
        FROM automator_flows f
        /* One run per flow, off the (flow_id, started_at DESC) index. */
        LEFT JOIN LATERAL (
          SELECT r.id, r.status, r.started_at FROM automator_runs r
          WHERE r.flow_id = f.id ORDER BY r.started_at DESC, r.id LIMIT 1
        ) run ON true
        WHERE f.owner_id = ${ownerId} ORDER BY f.updated_at DESC, f.id`;
      return rows.map(
        ({ nodes, edges, lastRunId, lastRunStatus, lastRunStartedAt, ...row }): FlowSummary => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
          triggerTypes: documentTriggerTypes(nodes),
          triggers: documentTriggers(nodes),
          outline: {
            /* A document written before positions were stored would carry nulls. */
            nodes: nodes.map((node) => ({
              id: node.id,
              type: node.type,
              x: node.x ?? 0,
              y: node.y ?? 0,
            })),
            edges,
          },
          ...(lastRunId && lastRunStatus && lastRunStartedAt
            ? {
                lastRun: {
                  id: lastRunId,
                  status: lastRunStatus,
                  startedAt: lastRunStartedAt.toISOString(),
                },
              }
            : {}),
        }),
      );
    },
    async find(ownerId: string, id: string): Promise<FlowRecord | null> {
      const db = connection();
      const rows = await db<FlowRow[]>`
        SELECT ${db.unsafe(ownerColumns)}
        FROM automator_flows WHERE owner_id = ${ownerId} AND id = ${id}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async create(
      ownerId: string,
      input: FlowDocumentInput,
      options: { recordVersion?: boolean } = {},
    ): Promise<FlowRecord> {
      const db = connection();
      const id = crypto.randomUUID();
      try {
        const insert = async (tx: SQL): Promise<FlowRecord> => {
          const rows = await tx<FlowRow[]>`
          INSERT INTO automator_flows (id, owner_id, name, description, document)
          VALUES (${id}, ${ownerId}, ${input.name}, ${input.description}, ${toDocument(input)}::jsonb)
          RETURNING ${tx.unsafe(ownerColumns)}`;
          if (!rows[0]) throw new Error("Flow creation failed");
          if (options.recordVersion) await recordFlowVersion(tx, ownerId, id, input);
          return toRecord(rows[0]);
        };
        return options.recordVersion ? await db.begin(insert) : await insert(db);
      } catch (error) {
        if (error instanceof Error && "errno" in error && error.errno === "23503")
          throw new FlowOwnerMissingError("Flow owner does not exist");
        throw error;
      }
    },
    async update(
      ownerId: string,
      id: string,
      input: FlowDocumentInput,
      options: { recordVersion?: boolean } = {},
    ): Promise<FlowRecord | null> {
      const db = connection();
      return db.begin(async (tx) => {
        const previous = await tx<FlowRow[]>`
          SELECT ${tx.unsafe(ownerColumns)} FROM automator_flows
          WHERE owner_id = ${ownerId} AND id = ${id} FOR UPDATE`;
        if (!previous[0]) return null;
        const before = toRecord(previous[0]).flow;
        const document = toDocument(input);
        const pollingRevision = Value.Equal(
          executionConfiguration(before),
          executionConfiguration(input),
        )
          ? previous[0].pollingRevision
          : crypto.randomUUID();
        const rows = await tx<FlowRow[]>`
          UPDATE automator_flows SET
            name = ${input.name}, description = ${input.description},
            document = ${document}::jsonb, polling_revision = ${pollingRevision}, updated_at = now()
          WHERE owner_id = ${ownerId} AND id = ${id}
          RETURNING ${tx.unsafe(ownerColumns)}`;
        if (!rows[0]) return null;

        const nextNodes = new Map(input.nodes.map((node) => [node.id, node]));
        const chainChanged = flowChainId(before) !== flowChainId(input);
        const changedNodes = before.nodes
          .filter((node) => {
            const next = nextNodes.get(node.id);
            return (
              chainChanged ||
              !next ||
              node.type !== next.type ||
              !Value.Equal(node.config, next.config)
            );
          })
          .map((node) => node.id);
        if (changedNodes.length > 0) {
          await tx`DELETE FROM automator_event_cursors
            WHERE flow_id = ${id} AND node_id = ANY(${tx.array(changedNodes, "TEXT")}::text[])`;
          await tx`DELETE FROM automator_watch_state
            WHERE flow_id = ${id} AND node_id = ANY(${tx.array(changedNodes, "TEXT")}::text[])`;
        }
        if (options.recordVersion && !Value.Equal(toDocument(before), document))
          await recordFlowVersion(tx, ownerId, id, input);
        return toRecord(rows[0]);
      });
    },
    async setEnabled(ownerId: string, id: string, enabled: boolean): Promise<FlowRecord | null> {
      const db = connection();
      const rows = await db<FlowRow[]>`
        UPDATE automator_flows SET enabled = ${enabled},
          polling_revision = CASE WHEN enabled = ${enabled} THEN polling_revision ELSE ${crypto.randomUUID()} END
        WHERE owner_id = ${ownerId} AND id = ${id}
        RETURNING ${db.unsafe(ownerColumns)}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async setAppPublished(
      ownerId: string,
      id: string,
      appPublished: boolean,
    ): Promise<FlowRecord | null> {
      const db = connection();
      const rows = await db<FlowRow[]>`
        UPDATE automator_flows SET app_published = ${appPublished}
        WHERE owner_id = ${ownerId} AND id = ${id}
        RETURNING ${db.unsafe(ownerColumns)}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async findForWebhook(id: string, token: string): Promise<OwnedFlow | null> {
      const db = connection();
      const rows = await db<(FlowRow & { ownerId: string })[]>`
        SELECT ${db.unsafe(ownerColumns)}, owner_id AS "ownerId"
        FROM automator_flows WHERE id = ${id} AND webhook_token = ${token} AND enabled`;
      return rows[0]
        ? {
            ownerId: rows[0].ownerId,
            record: toRecord(rows[0]),
            pollingRevision: rows[0].pollingRevision,
          }
        : null;
    },
    /** An owner's active flows, in full, so a caller can read what each one declares. */
    async listEnabledForOwner(ownerId: string): Promise<FlowRecord[]> {
      const db = connection();
      const rows = await db<FlowRow[]>`
        SELECT ${db.unsafe(ownerColumns)} FROM automator_flows
        WHERE owner_id = ${ownerId} AND enabled ORDER BY updated_at DESC, id`;
      return rows.map(toRecord);
    },
    async listEnabled(): Promise<OwnedFlow[]> {
      const db = connection();
      const rows = await db<(FlowRow & { ownerId: string })[]>`
        SELECT ${db.unsafe(ownerColumns)}, owner_id AS "ownerId"
        FROM automator_flows WHERE enabled ORDER BY updated_at DESC, id`;
      return rows.map((row) => ({
        ownerId: row.ownerId,
        record: toRecord(row),
        pollingRevision: row.pollingRevision,
      }));
    },
    /**
     * The owner's flows whose documents point a `data.*` node at this table, newest first. One
     * query over the stored nodes, so deleting a table does not read every flow the owner has.
     */
    async listUsingTable(
      ownerId: string,
      tableId: string,
    ): Promise<{ id: string; name: string }[]> {
      const db = connection();
      return db<{ id: string; name: string }[]>`
        SELECT f.id, f.name FROM automator_flows f
        WHERE f.owner_id = ${ownerId}
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(f.document->'nodes') AS n
            WHERE n->>'type' LIKE 'data.%' AND n->'config'->>'tableId' = ${tableId}
          )
        ORDER BY f.updated_at DESC, f.id`;
    },
    async isCurrentPoll(id: string, pollingRevision: string): Promise<boolean> {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        SELECT id FROM automator_flows
        WHERE id = ${id} AND enabled AND polling_revision = ${pollingRevision}`;
      return rows.length > 0;
    },
    async delete(ownerId: string, id: string): Promise<boolean> {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        DELETE FROM automator_flows WHERE owner_id = ${ownerId} AND id = ${id} RETURNING id`;
      return rows.length > 0;
    },
    async findPublished(id: string): Promise<FlowRecord | null> {
      return (await this.findPublishedWithOwner(id))?.record ?? null;
    },
    async findPublishedWithOwner(
      id: string,
    ): Promise<{ record: FlowRecord; ownerId: string } | null> {
      const db = connection();
      /* Typed as the columns actually selected: a visitor's record carries no owner-only fields. */
      type PublishedRow = Pick<
        FlowRow,
        "id" | "name" | "description" | "document" | "createdAt" | "updatedAt"
      > & { ownerId: string };
      const rows = await db<PublishedRow[]>`
        SELECT f.id, f.name, f.description, f.document, f.owner_id AS "ownerId",
          f.created_at AS "createdAt", f.updated_at AS "updatedAt"
        FROM automator_flows f WHERE f.id = ${id} AND f.app_published`;
      return rows[0] ? { record: toRecord(rows[0]), ownerId: rows[0].ownerId } : null;
    },
  };
}
export type FlowStore = ReturnType<typeof createFlowStore>;
