import "server-only";
import { ApiRequestError, request } from "@automator/api-client/server";
import {
  forkListingContract,
  getListingContract,
  listListingsContract,
  type FlowRecord,
} from "@automator/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "../auth/server";
import { curatedListings } from "./curated";
import { fromListing, type MarketplaceItem } from "./listing";
import { stepsFromDocument } from "./steps";

/** Raised for any API answer other than the one a page can render. */
export class MarketplaceApiError extends Error {
  constructor(public readonly status: number) {
    super(`Marketplace request failed with ${status}`);
    this.name = "MarketplaceApiError";
  }
}

async function sessionToken() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  return token;
}

function unavailable(error: unknown): never {
  throw error instanceof ApiRequestError ? new MarketplaceApiError(503) : error;
}

/** Every published listing, newest first, followed by the curated examples. */
export async function listMarketplaceItems(): Promise<readonly MarketplaceItem[]> {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, listListingsContract, { token }).catch(
    unavailable,
  );
  if (result.status === 401) redirect("/login");
  if (result.status !== 200) throw new MarketplaceApiError(result.status);
  return [...result.data.listings.map((listing) => fromListing(listing)), ...curatedListings];
}

/** A curated example by id, or a published listing by slug; `undefined` for neither. */
export async function findMarketplaceItem(slug: string): Promise<MarketplaceItem | undefined> {
  const curated = curatedListings.find((item) => item.slug === slug);
  if (curated) return curated;
  const token = await sessionToken();
  const result = await request(process.env.API_URL, getListingContract, {
    token,
    params: { slug },
  }).catch(unavailable);
  if (result.status === 401) redirect("/login");
  // A slug the contract rejects is as unknown as one the API has never seen.
  if (result.status === 404 || result.status === 400) return undefined;
  if (result.status !== 200) throw new MarketplaceApiError(result.status);
  const { document, ...listing } = result.data.listing;
  return fromListing(listing, stepsFromDocument(document), document);
}

/** Copies a published listing into a new flow for the signed-in user; `null` when unknown. */
export async function forkListing(slug: string): Promise<FlowRecord | null> {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, forkListingContract, {
    token,
    params: { slug },
    timeoutMs: 15_000,
  }).catch(unavailable);
  if (result.status === 401) redirect("/login");
  if (result.status === 404 || result.status === 400) return null;
  if (result.status !== 201) throw new MarketplaceApiError(result.status);
  return result.data;
}
