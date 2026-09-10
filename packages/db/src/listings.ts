import {
  clearDataTableReferences,
  documentOutline,
  listingNodeTypes,
  reservedListingSlugs,
  slugifyListingName,
  type FlowDocument,
  type FlowNodeType,
  type FlowRecord,
  type MarketplaceListing,
  type MarketplaceListingDetail,
} from "@automator/contracts";
import type { SQL } from "bun";
import { ownerColumns, toRecord, type FlowRow } from "./flows";
import { recordFlowVersion } from "./flow-versions";

type Snapshot = Pick<FlowDocument, "version" | "chainId" | "nodes" | "edges">;
/* The document travels with every row: a list sends only the outline drawn from it. */
type ListingRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  authorName: string | null;
  authorUsername: string;
  nodeTypes: FlowNodeType[];
  document: Snapshot;
  forkCount: number;
  publishedAt: Date;
  updatedAt: Date;
};
type ListingDetailRow = ListingRow;
function toListing(row: ListingRow): MarketplaceListing {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    author: { name: row.authorName ?? row.authorUsername, username: row.authorUsername },
    nodeTypes: row.nodeTypes,
    outline: documentOutline(row.document),
    forkCount: row.forkCount,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: ListingDetailRow): MarketplaceListingDetail {
  return {
    ...toListing(row),
    document: {
      version: row.document.version,
      id: row.id,
      name: row.name,
      description: row.description,
      ...(row.document.chainId === undefined ? {} : { chainId: row.document.chainId }),
      nodes: row.document.nodes,
      edges: row.document.edges,
    },
  };
}

function isSlugTaken(error: unknown) {
  return (
    error instanceof Error &&
    "errno" in error &&
    error.errno === "23505" &&
    "constraint" in error &&
    error.constraint === "automator_listings_slug_key"
  );
}

/* Keep queries as tagged templates: Bun does not decode JSONB from parameterized unsafe queries. */
export function createListingStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async list(): Promise<MarketplaceListing[]> {
      const db = connection();
      const rows = await db<ListingRow[]>`
        SELECT l.id, l.slug, l.name, l.description, l.node_types AS "nodeTypes",
          l.fork_count AS "forkCount", l.published_at AS "publishedAt", l.updated_at AS "updatedAt",
          u.name AS "authorName", u.username AS "authorUsername", l.document
        FROM automator_listings l JOIN automator_users u ON u.id = l.owner_id
        ORDER BY l.published_at DESC, l.slug`;
      return rows.map(toListing);
    },
    async find(slug: string): Promise<MarketplaceListingDetail | null> {
      const db = connection();
      const rows = await db<ListingDetailRow[]>`
        SELECT l.id, l.slug, l.name, l.description, l.node_types AS "nodeTypes",
          l.fork_count AS "forkCount", l.published_at AS "publishedAt", l.updated_at AS "updatedAt",
          u.name AS "authorName", u.username AS "authorUsername", l.document
        FROM automator_listings l JOIN automator_users u ON u.id = l.owner_id
        WHERE l.slug = ${slug}`;
      return rows[0] ? toDetail(rows[0]) : null;
    },
    async findByFlow(ownerId: string, flowId: string): Promise<MarketplaceListing | null> {
      const db = connection();
      const rows = await db<ListingRow[]>`
        SELECT l.id, l.slug, l.name, l.description, l.node_types AS "nodeTypes",
          l.fork_count AS "forkCount", l.published_at AS "publishedAt", l.updated_at AS "updatedAt",
          u.name AS "authorName", u.username AS "authorUsername", l.document
        FROM automator_listings l JOIN automator_users u ON u.id = l.owner_id
        WHERE l.owner_id = ${ownerId} AND l.flow_id = ${flowId}`;
      return rows[0] ? toListing(rows[0]) : null;
    },
    async publish(
      ownerId: string,
      flow: FlowRecord["flow"],
      input: { name: string; description: string },
    ): Promise<MarketplaceListing> {
      const db = connection();
      const name = input.name.trim();
      const document: Snapshot = {
        version: flow.version,
        ...(flow.chainId === undefined ? {} : { chainId: flow.chainId }),
        nodes: flow.nodes,
        edges: flow.edges,
      };
      const nodeTypes = listingNodeTypes(flow);
      const updated = await db<ListingRow[]>`
        WITH saved AS (
          UPDATE automator_listings SET name = ${name}, description = ${input.description},
            document = ${document}::jsonb, node_types = ${nodeTypes}::jsonb, updated_at = now()
          WHERE owner_id = ${ownerId} AND flow_id = ${flow.id} RETURNING *
        )
        SELECT l.id, l.slug, l.name, l.description, l.node_types AS "nodeTypes",
          l.fork_count AS "forkCount", l.published_at AS "publishedAt", l.updated_at AS "updatedAt",
          u.name AS "authorName", u.username AS "authorUsername", l.document
        FROM saved l JOIN automator_users u ON u.id = l.owner_id`;
      if (updated[0]) return toListing(updated[0]);

      const base = slugifyListingName(name);
      for (let attempt = 1; attempt <= 50; attempt++) {
        const slug = attempt === 1 ? base : `${base}-${attempt}`;
        if (reservedListingSlugs.has(slug)) continue;
        try {
          const rows = await db<ListingRow[]>`
            WITH saved AS (
              INSERT INTO automator_listings
                (id, slug, flow_id, owner_id, name, description, document, node_types)
              VALUES (${crypto.randomUUID()}, ${slug}, ${flow.id}, ${ownerId}, ${name},
                ${input.description}, ${document}::jsonb, ${nodeTypes}::jsonb)
              ON CONFLICT (flow_id) DO UPDATE SET
                name = EXCLUDED.name, description = EXCLUDED.description,
                document = EXCLUDED.document, node_types = EXCLUDED.node_types, updated_at = now()
              WHERE automator_listings.owner_id = EXCLUDED.owner_id
              RETURNING *
            )
            SELECT l.id, l.slug, l.name, l.description, l.node_types AS "nodeTypes",
              l.fork_count AS "forkCount", l.published_at AS "publishedAt",
              l.updated_at AS "updatedAt", u.name AS "authorName",
              u.username AS "authorUsername", l.document
            FROM saved l JOIN automator_users u ON u.id = l.owner_id`;
          if (!rows[0]) throw new Error("Listing creation failed");
          return toListing(rows[0]);
        } catch (error) {
          if (!isSlugTaken(error)) throw error;
        }
      }
      throw new Error("Could not find a free listing slug");
    },
    async unpublish(ownerId: string, slug: string): Promise<boolean> {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        DELETE FROM automator_listings WHERE owner_id = ${ownerId} AND slug = ${slug} RETURNING id`;
      return rows.length > 0;
    },
    async fork(ownerId: string, slug: string): Promise<FlowRecord | null> {
      const db = connection();
      return db.begin(async (tx) => {
        const listings = await tx<Pick<ListingDetailRow, "name" | "description" | "document">[]>`
          SELECT name, description, document FROM automator_listings WHERE slug = ${slug} FOR UPDATE`;
        const listing = listings[0];
        if (!listing) return null;
        /* Tables belong to the publisher; a fork starts with no table selected. */
        const document = clearDataTableReferences(listing.document);
        /* The flow store's own columns and mapping, so a fork reads back exactly as the flow
         * it just created does. */
        const rows = await tx<FlowRow[]>`
          INSERT INTO automator_flows (id, owner_id, name, description, document)
          VALUES (${crypto.randomUUID()}, ${ownerId}, ${listing.name}, ${listing.description},
            ${document}::jsonb)
          RETURNING ${tx.unsafe(ownerColumns)}`;
        if (!rows[0]) throw new Error("Fork creation failed");
        const record = toRecord(rows[0]);
        await recordFlowVersion(tx, ownerId, record.flow.id, record.flow);
        await tx`UPDATE automator_listings SET fork_count = fork_count + 1 WHERE slug = ${slug}`;
        return record;
      });
    },
  };
}
export type ListingStore = ReturnType<typeof createListingStore>;
