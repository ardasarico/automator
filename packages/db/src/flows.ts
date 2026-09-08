import { flowChainId, Value } from "@automator/contracts";
import type {
  FlowDocument,
  FlowDocumentInput,
  FlowNodeType,
  FlowRecord,
  FlowSummary,
} from "@automator/contracts";
import type { SQL } from "bun";
import { recordFlowVersion } from "./flow-versions";
import { executionConfiguration } from "./polling-fence";

/** Raised when the owner has no user row yet, so a flow cannot reference it. */
export class FlowOwnerMissingError extends Error {}

/** The stored document keeps the graph; name and description are columns for listing. */
type FlowRow = {
  id: string;
  name: string;
  description: string;
  document: Pick<FlowDocument, "version" | "chainId" | "nodes" | "edges">;
  createdAt: Date;
  updatedAt: Date;
  /** Present on owner-facing reads only. */
  enabled?: boolean;
  webhookToken?: string;
  pollingRevision: string;
};

/** The columns of an owner-facing read, activation and token included. */
const ownerColumns = `id, name, description, document, enabled, webhook_token AS "webhookToken",
  polling_revision AS "pollingRevision",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

function toRecord(row: FlowRow): FlowRecord {
  const record: FlowRecord = {
    flow: {
      version: row.document.version,
      id: row.id,
      name: row.name,
      description: row.description,
      ...(row.document.chainId === undefined ? {} : { chainId: row.document.chainId }),
      nodes: row.document.nodes,
      edges: row.document.edges,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.enabled !== undefined) record.enabled = row.enabled;
  if (row.webhookToken !== undefined) record.webhookToken = row.webhookToken;
  return record;
}

/** Trigger node types in a document, distinct and in document order. */
export function documentTriggerTypes(nodes: readonly { type: FlowNodeType }[]): FlowNodeType[] {
  const types = nodes
    .map((node) => node.type)
    .filter((type) => type.startsWith("trigger.") || type === "world.verification-completed");
  return [...new Set(types)];
}

/** A flow the scheduler or a webhook may run: the owner's record with its owner. */
export type OwnedFlow = { ownerId: string; record: FlowRecord; pollingRevision: string };

function toDocument(input: FlowDocumentInput): FlowRow["document"] {
  return {
    version: input.version,
    ...(input.chainId === undefined ? {} : { chainId: input.chainId }),
    nodes: input.nodes,
    edges: input.edges,
  };
}

/** Every read and write is scoped to the owner: another user's flow answers `null`. */
export function createFlowStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async list(ownerId: string): Promise<FlowSummary[]> {
      const db = connection();
      const rows = await db<
        (Omit<FlowSummary, "updatedAt" | "triggerTypes"> & {
          updatedAt: Date;
          nodes: { type: FlowNodeType }[];
        })[]
      >`
        SELECT id, name, description, updated_at AS "updatedAt", enabled,
          jsonb_array_length(document->'nodes') AS "nodeCount",
          (SELECT coalesce(jsonb_agg(jsonb_build_object('type', n->>'type')), '[]'::jsonb)
             FROM jsonb_array_elements(document->'nodes') n) AS nodes
        FROM automator_flows
        WHERE owner_id = ${ownerId} ORDER BY updated_at DESC, id`;
      return rows.map(({ nodes, ...row }) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
        triggerTypes: documentTriggerTypes(nodes),
      }));
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
    /** Replaces the document; `null` when the owner has no flow with this id. */
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

        // A new trigger configuration starts with fresh polling state. Layout and labels
        // do not change what a trigger observes, so they keep its cursor and comparison.
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
    /** Turns webhook and schedule triggers on or off; `null` when the owner has no such flow. */
    async setEnabled(ownerId: string, id: string, enabled: boolean): Promise<FlowRecord | null> {
      const db = connection();
      const rows = await db<FlowRow[]>`
        UPDATE automator_flows SET enabled = ${enabled},
          polling_revision = CASE WHEN enabled = ${enabled} THEN polling_revision ELSE ${crypto.randomUUID()} END
        WHERE owner_id = ${ownerId} AND id = ${id}
        RETURNING ${db.unsafe(ownerColumns)}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },
    /** The flow a webhook call names, only while enabled and the token matches. */
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
    /** Every enabled flow across owners, for the scheduler. */
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
    /** Rejects a poll captured before an executable edit or activation change. */
    async isCurrentPoll(id: string, pollingRevision: string): Promise<boolean> {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        SELECT id FROM automator_flows
        WHERE id = ${id} AND enabled AND polling_revision = ${pollingRevision}`;
      return rows.length > 0;
    },
    /** True when the owner had this flow and it is gone now, listing and runs with it. */
    async delete(ownerId: string, id: string): Promise<boolean> {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        DELETE FROM automator_flows WHERE owner_id = ${ownerId} AND id = ${id} RETURNING id`;
      return rows.length > 0;
    },
    /** The live flow behind a marketplace listing, for anyone; `null` unless it is published. */
    async findPublished(id: string): Promise<FlowRecord | null> {
      return (await this.findPublishedWithOwner(id))?.record ?? null;
    },
    /** A published flow with who owns it, for running it on a visitor's behalf. */
    async findPublishedWithOwner(
      id: string,
    ): Promise<{ record: FlowRecord; ownerId: string } | null> {
      const db = connection();
      const rows = await db<(FlowRow & { ownerId: string })[]>`
        SELECT f.id, f.name, f.description, f.document, f.owner_id AS "ownerId",
          f.created_at AS "createdAt", f.updated_at AS "updatedAt"
        FROM automator_flows f JOIN automator_listings l ON l.flow_id = f.id
        WHERE f.id = ${id}`;
      return rows[0] ? { record: toRecord(rows[0]), ownerId: rows[0].ownerId } : null;
    },
  };
}
export type FlowStore = ReturnType<typeof createFlowStore>;
