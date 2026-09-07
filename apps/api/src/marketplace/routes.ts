import {
  forkListingContract,
  getFlowListingContract,
  getListingContract,
  isPublishListingInput,
  listListingsContract,
  publishListingContract,
  redactFlowSecrets,
  Type,
  unpublishListingContract,
} from "@automator/contracts";
import type { FlowStore, ListingStore, UserStore } from "@automator/db";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";

export interface MarketplaceDependencies {
  listings: ListingStore;
  flows: FlowStore;
  users: UserStore;
  identity: IdentityProvider | undefined;
}

/**
 * Listings are readable by every signed-in user. Publishing and unpublishing are scoped to
 * the caller's own flows and listings, so someone else's answer 404 like a missing one, and
 * only an onboarded user (one with a username for the byline) may publish.
 */
export function createMarketplaceRoutes({
  listings,
  flows,
  users,
  identity,
}: MarketplaceDependencies) {
  return new Elysia({ name: "marketplace" })
    .use(createAuthGuard(identity))
    .get(listListingsContract.path, async () => ({ listings: await listings.list() }), {
      response: listListingsContract.response,
    })
    .get(
      getListingContract.path,
      async ({ params, status }) => {
        const listing = await listings.find(params.slug);
        return listing ? { listing } : status(404, { error: "not_found" });
      },
      { params: getListingContract.params, response: getListingContract.response },
    )
    .post(
      publishListingContract.path,
      async ({ claims, body, status }) => {
        // Checked here rather than by the route schema so that input the client can fix
        // answers 422 `invalid_listing` instead of the generic 400.
        if (!isPublishListingInput(body)) return status(422, { error: "invalid_listing" });
        const user = await users.find(claims.id);
        if (!user) return status(401, { error: "unauthorized" });
        if (!user.username) return status(403, { error: "forbidden" });
        const record = await flows.find(claims.id, body.flowId);
        if (!record) return status(404, { error: "not_found" });
        // The snapshot never carries the publisher's credentials: secret fields are blanked.
        const listing = await listings.publish(claims.id, redactFlowSecrets(record.flow), {
          name: body.name,
          description: body.description,
        });
        return { listing };
      },
      { body: Type.Unknown(), response: publishListingContract.response },
    )
    .delete(
      unpublishListingContract.path,
      async ({ claims, params, status }) =>
        (await listings.unpublish(claims.id, params.slug))
          ? { slug: params.slug }
          : status(404, { error: "not_found" }),
      { params: unpublishListingContract.params, response: unpublishListingContract.response },
    )
    .post(
      forkListingContract.path,
      async ({ claims, params, status }) => {
        // The fork inserts a flow for the caller, which needs their user row to exist.
        if (!(await users.find(claims.id))) return status(401, { error: "unauthorized" });
        const record = await listings.fork(claims.id, params.slug);
        return record ? status(201, record) : status(404, { error: "not_found" });
      },
      { params: forkListingContract.params, response: forkListingContract.response },
    )
    .get(
      getFlowListingContract.path,
      async ({ claims, params }) => ({
        listing: await listings.findByFlow(claims.id, params.id),
      }),
      { params: getFlowListingContract.params, response: getFlowListingContract.response },
    );
}
