import type { Metadata } from "next";
import { getCurrentUser } from "../../../auth/server";
import { listMarketplaceItems } from "../../../marketplace/server";
import { MarketplaceBrowser } from "./marketplace-browser";

export const metadata: Metadata = { title: "Marketplace · Automator" };

export default async function MarketplacePage() {
  const [listings, user] = await Promise.all([listMarketplaceItems(), getCurrentUser()]);
  return <MarketplaceBrowser listings={listings} username={user?.username ?? null} />;
}
