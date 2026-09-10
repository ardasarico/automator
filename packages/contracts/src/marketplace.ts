import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
import { usernameSchema } from "./auth";
import { apiErrorResponses } from "./contract";
import { flowNodeConfigSchemas } from "./flow-node-configs";
import {
  flowDocumentSchema,
  flowNodeTypeSchema,
  flowOutlineSchema,
  flowRecordSchema,
  type FlowDocument,
  type FlowNodeType,
} from "./flows";
import { redactSecrets, secretFields, type TObject } from "./node-config";
import { screenConfigSchemas } from "./screens";

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

export const marketplaceListingSchema = Type.Object({
  slug: listingSlugSchema,
  name: Type.String(),
  description: Type.String(),
  author: listingAuthorSchema,
  nodeTypes: Type.Array(flowNodeTypeSchema),
  /* The flow's shape, so a list can draw it without asking for the whole document. */
  outline: flowOutlineSchema,
  forkCount: Type.Integer({ minimum: 0 }),
  publishedAt: Type.String(),
  updatedAt: Type.String(),
});
export type MarketplaceListing = Static<typeof marketplaceListingSchema>;

export const marketplaceListingDetailSchema = Type.Object({
  ...marketplaceListingSchema.properties,
  document: flowDocumentSchema,
});
export type MarketplaceListingDetail = Static<typeof marketplaceListingDetailSchema>;

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

export const reservedListingSlugs: ReadonlySet<string> = new Set([
  "ai-digest",
  "applicant-intake",
  "approval-request",
  "audience-gate",
  "event-check-in",
  "paid-report",
  "price-quote-api",
  "scheduled-reminder",
  "selfie-gated-claim",
  "support-triage",
  "uniswap-pool-watch",
  "usdc-balance-alert",
  "usdc-payout",
  "examples",
  "fork",
  "new",
]);

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

export function listingNodeTypes(document: Pick<FlowDocument, "nodes">): FlowNodeType[] {
  const types: FlowNodeType[] = [];
  for (const node of document.nodes) {
    if (node.type.startsWith("trigger.") || types.includes(node.type)) continue;
    types.push(node.type);
    if (types.length === 4) break;
  }
  return types;
}

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

export function redactFlowSecrets<T extends Pick<FlowDocument, "nodes">>(document: T): T {
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      const schema = configSchemas[node.type];
      return schema ? { ...node, config: redactSecrets(schema, node.config) } : node;
    }),
  };
}

export function restoreFlowSecrets<T extends Pick<FlowDocument, "nodes">>(
  document: T,
  source: Pick<FlowDocument, "nodes">,
): T {
  const before = new Map(source.nodes.map((node) => [node.id, node]));
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      const schema = configSchemas[node.type];
      const previous = before.get(node.id);
      if (!schema || !previous || previous.type !== node.type) return node;
      const config = { ...node.config };
      for (const name of secretFields(schema)) {
        const kept = previous.config[name];
        const fallback = (schema.properties[name] as { default?: unknown }).default;
        const blank = !(name in config) || config[name] === fallback || config[name] === "";
        if (blank && kept !== undefined && kept !== fallback && kept !== "") config[name] = kept;
      }
      return { ...node, config };
    }),
  };
}

const listingParamsSchema = Type.Object({ slug: listingSlugSchema });
const flowParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) });

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
export const publishListingContract = {
  method: "POST",
  path: "/marketplace",
  body: publishListingInputSchema,
  response: { 200: Type.Object({ listing: marketplaceListingSchema }), ...apiErrorResponses },
} as const;
export const unpublishListingContract = {
  method: "DELETE",
  path: "/marketplace/:slug",
  params: listingParamsSchema,
  response: { 200: Type.Object({ slug: listingSlugSchema }), ...apiErrorResponses },
} as const;
export const forkListingContract = {
  method: "POST",
  path: "/marketplace/:slug/fork",
  params: listingParamsSchema,
  response: { 201: flowRecordSchema, ...apiErrorResponses },
} as const;
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
