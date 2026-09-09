import type { Metadata } from "next";
import { getCurrentUser } from "../../../auth/server";
import { listFlows } from "../../../flows/server";
import { listMarketplaceItems } from "../../../marketplace/server";
import { MarketplaceBrowser } from "./marketplace-browser";

export const metadata: Metadata = { title: "Marketplace · Automator" };

export default async function MarketplacePage() {
  /* The flows are only for the publish picker, so a failure there must not cost the page. */
  const [listings, user, flows] = await Promise.all([
    listMarketplaceItems(),
    getCurrentUser(),
    listFlows().catch(() => []),
  ]);
  return <MarketplaceBrowser listings={listings} username={user?.username ?? null} flows={flows} />;
}
