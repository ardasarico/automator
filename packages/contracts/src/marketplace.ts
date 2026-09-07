import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
import { usernameSchema } from "./auth";
import { apiErrorResponses } from "./contract";
import { flowNodeConfigSchemas } from "./flow-node-configs";
import {
  flowDocumentSchema,
  flowNodeTypeSchema,
  flowRecordSchema,
  type FlowDocument,
  type FlowNodeType,
} from "./flows";
import { redactSecrets, type TObject } from "./node-config";
import { screenConfigSchemas } from "./screens";

/**
 * A listing's URL segment: lowercase words joined by single hyphens. The API mints it from
 * the listing name and keeps it stable across re-publishes.
 */
export const listingSlugSchema = Type.String({
  minLength: 1,
  maxLength: 80,
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
});

export const listingAuthorSchema = Type.Object({
  name: Type.String(),
  username: usernameSchema,
});
export type ListingAuthor = Static<typeof listingAuthorSchema>;

/**
 * A published flow as the marketplace lists it. `nodeTypes` are the highlighted node types
 * (see `listingNodeTypes`); `forkCount` counts forks made through the API. Timestamps are
 * ISO-8601: `publishedAt` is the first publish, `updatedAt` the latest re-publish.
 */
export const marketplaceListingSchema = Type.Object({
  slug: listingSlugSchema,
  name: Type.String(),
  description: Type.String(),
  author: listingAuthorSchema,
  nodeTypes: Type.Array(flowNodeTypeSchema),
  forkCount: Type.Integer({ minimum: 0 }),
  publishedAt: Type.String(),
  updatedAt: Type.String(),
});
export type MarketplaceListing = Static<typeof marketplaceListingSchema>;

/** The listing with the snapshot of the flow it was published from; its id is the listing's. */
export const marketplaceListingDetailSchema = Type.Object({
  ...marketplaceListingSchema.properties,
  document: flowDocumentSchema,
});
export type MarketplaceListingDetail = Static<typeof marketplaceListingDetailSchema>;

/**
 * What a client sends to publish one of its flows. Publishing a flow that already has a
 * listing replaces the listing's name, description and snapshot and keeps its slug.
 */
export const publishListingInputSchema = Type.Object(
  {
    flowId: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1, maxLength: 120, pattern: "\\S" }),
    description: Type.String({ maxLength: 280 }),
  },
  { additionalProperties: false },
);
export type PublishListingInput = Static<typeof publishListingInputSchema>;

export function isPublishListingInput(body: unknown): body is PublishListingInput {
  return Check(publishListingInputSchema, body);
}

/**
 * Slugs the API never mints: the curated examples the web app serves at the same
 * `/marketplace/[slug]` URLs, and segments reserved for routes beside them.
 */
export const reservedListingSlugs: ReadonlySet<string> = new Set([
  "ai-digest",
  "approval-request",
  "audience-gate",
  "event-check-in",
  "scheduled-reminder",
  "support-triage",
  "usdc-balance-alert",
  "usdc-payout",
  "examples",
  "fork",
  "new",
]);

/** Lowercases, strips accents, and joins words with hyphens; an empty result becomes `flow`. */
export function slugifyListingName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "flow";
}

/**
 * The node types a listing highlights: every distinct non-trigger type in node order, at
 * most four. Triggers are implied by every flow, so they add nothing to a card.
 */
export function listingNodeTypes(document: Pick<FlowDocument, "nodes">): FlowNodeType[] {
  const types: FlowNodeType[] = [];
  for (const node of document.nodes) {
    if (node.type.startsWith("trigger.") || types.includes(node.type)) continue;
    types.push(node.type);
    if (types.length === 4) break;
  }
  return types;
}

/** Every config schema with fields to redact, by node type; types without one keep their config. */
const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

/**
 * The document as a marketplace snapshot: every node's secret config fields (see
 * `secretFields`) are reset, so a listing never carries the publisher's credentials.
 */
export function redactFlowSecrets<T extends Pick<FlowDocument, "nodes">>(document: T): T {
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      const schema = configSchemas[node.type];
      return schema ? { ...node, config: redactSecrets(schema, node.config) } : node;
    }),
  };
}

const listingParamsSchema = Type.Object({ slug: listingSlugSchema });
const flowParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) });

/** Every listing, newest publish first. */
export const listListingsContract = {
  method: "GET",
  path: "/marketplace",
  response: {
    200: Type.Object({ listings: Type.Array(marketplaceListingSchema) }),
    ...apiErrorResponses,
  },
} as const;
export const getListingContract = {
  method: "GET",
  path: "/marketplace/:slug",
  params: listingParamsSchema,
  response: {
    200: Type.Object({ listing: marketplaceListingDetailSchema }),
    ...apiErrorResponses,
  },
} as const;
/** Publishes or re-publishes one of the caller's flows; the flow must be the caller's. */
export const publishListingContract = {
  method: "POST",
  path: "/marketplace",
  body: publishListingInputSchema,
  response: { 200: Type.Object({ listing: marketplaceListingSchema }), ...apiErrorResponses },
} as const;
/** Removes the caller's listing; another user's listing answers 404. */
export const unpublishListingContract = {
  method: "DELETE",
  path: "/marketplace/:slug",
  params: listingParamsSchema,
  response: { 200: Type.Object({ slug: listingSlugSchema }), ...apiErrorResponses },
} as const;
/** Copies the listing's snapshot into a new flow owned by the caller and counts the fork. */
export const forkListingContract = {
  method: "POST",
  path: "/marketplace/:slug/fork",
  params: listingParamsSchema,
  response: { 201: flowRecordSchema, ...apiErrorResponses },
} as const;
/** The caller's listing for one of their flows, so the builder can offer update or unpublish. */
export const getFlowListingContract = {
  method: "GET",
  path: "/flows/:id/listing",
  params: flowParamsSchema,
  response: {
    200: Type.Object({ listing: Type.Union([marketplaceListingSchema, Type.Null()]) }),
    ...apiErrorResponses,
  },
} as const;

export type ListListingsResponse = Static<(typeof listListingsContract.response)[200]>;
export type GetListingResponse = Static<(typeof getListingContract.response)[200]>;
export type PublishListingResponse = Static<(typeof publishListingContract.response)[200]>;
export type GetFlowListingResponse = Static<(typeof getFlowListingContract.response)[200]>;
