import { nodePresetLimit, type FlowNodeType, type NodePreset } from "@automator/contracts";
import type { SQL } from "bun";

export class NodePresetLimitError extends Error {}
export class NodePresetOwnerMissingError extends Error {}

type PresetRow = {
  id: string;
  name: string;
  type: FlowNodeType;
  label: string;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const columns = `id, name, node_type AS "type", label, config,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

function toPreset(row: PresetRow): NodePreset {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    label: row.label,
    config: row.config,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createNodePresetStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async list(ownerId: string): Promise<NodePreset[]> {
      const db = connection();
      const rows = await db<PresetRow[]>`
        SELECT ${db.unsafe(columns)} FROM automator_node_presets
        WHERE owner_id = ${ownerId} ORDER BY created_at DESC, id DESC`;
      return rows.map(toPreset);
    },
    async create(
      ownerId: string,
      input: { name: string; type: FlowNodeType; label: string; config: Record<string, unknown> },
    ): Promise<NodePreset> {
      const db = connection();
      try {
        return await db.begin(async (tx) => {
          // The owner row serialises concurrent saves, so the cap cannot be raced past.
          const owner = await tx`SELECT id FROM automator_users WHERE id = ${ownerId} FOR UPDATE`;
          if (!owner.length) throw new NodePresetOwnerMissingError("Preset owner does not exist");
          const [count] = await tx<{ total: string }[]>`
            SELECT count(*)::text AS total FROM automator_node_presets WHERE owner_id = ${ownerId}`;
          if (Number(count?.total ?? 0) >= nodePresetLimit)
            throw new NodePresetLimitError(`You can keep at most ${nodePresetLimit} saved nodes.`);
          const rows = await tx<PresetRow[]>`
            INSERT INTO automator_node_presets (id, owner_id, name, node_type, label, config)
            VALUES (${crypto.randomUUID()}, ${ownerId}, ${input.name}, ${input.type},
              ${input.label}, ${input.config}::jsonb)
            RETURNING ${tx.unsafe(columns)}`;
          if (!rows[0]) throw new Error("Saved node creation failed");
          return toPreset(rows[0]);
        });
      } catch (error) {
        if (error instanceof Error && "errno" in error && error.errno === "23503")
          throw new NodePresetOwnerMissingError("Preset owner does not exist");
        throw error;
      }
    },
    async remove(ownerId: string, id: string): Promise<boolean> {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        DELETE FROM automator_node_presets
        WHERE owner_id = ${ownerId} AND id = ${id} RETURNING id`;
      return rows.length > 0;
    },
  };
}
export type NodePresetStore = ReturnType<typeof createNodePresetStore>;
