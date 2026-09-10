import type { ApiKeySummary, FlowDocument, FlowNode, FlowNodeType } from "@automator/contracts";
import { ApiKeyLimitError, apiKeyLimit, type ApiKeyStore } from "@automator/db";

export function node(
  id: string,
  type: FlowNodeType,
  config: Record<string, unknown> = {},
): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

export function flowDocument(
  id: string,
  name: string,
  nodes: FlowNode[],
  edges: FlowDocument["edges"] = [],
): FlowDocument {
  return { version: 1, id, name, description: "", nodes, edges };
}

export function memoryApiKeyStore() {
  const rows = new Map<
    string,
    { ownerId: string; name: string; keyHash: string; prefix: string; lastUsedAt?: string }
  >();
  const summary = (id: string): ApiKeySummary => {
    const row = rows.get(id)!;
    return {
      id,
      name: row.name,
      prefix: row.prefix,
      createdAt: "2026-09-10T10:00:00.000Z",
      ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt } : {}),
    };
  };
  const store: ApiKeyStore = {
    async list(ownerId) {
      return [...rows.keys()]
        .filter((id) => rows.get(id)!.ownerId === ownerId)
        .map(summary)
        .reverse();
    },
    async create(ownerId, name, keyHash, prefix) {
      const held = [...rows.values()].filter((row) => row.ownerId === ownerId).length;
      if (held >= apiKeyLimit) throw new ApiKeyLimitError();
      const id = crypto.randomUUID();
      rows.set(id, { ownerId, name, keyHash, prefix });
      return summary(id);
    },
    async revoke(ownerId, id) {
      return rows.get(id)?.ownerId === ownerId && rows.delete(id);
    },
    async findOwner(keyHash) {
      for (const [id, row] of rows)
        if (row.keyHash === keyHash) return { id, ownerId: row.ownerId };
      return null;
    },
    async touch(id) {
      const row = rows.get(id);
      if (row) row.lastUsedAt = "2026-09-10T11:00:00.000Z";
    },
  };
  return { store, rows };
}
