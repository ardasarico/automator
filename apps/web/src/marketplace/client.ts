import {
  getFlowListingContract,
  parseResponse,
  publishListingContract,
  unpublishListingContract,
  type MarketplaceListing,
  type PublishListingInput,
} from "@automator/contracts";

export class MarketplaceRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "MarketplaceRequestError";
  }
}

async function proxy(path: string, method: string, token: string | null, body?: unknown) {
  if (!token) throw new MarketplaceRequestError("unauthorized");
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, data: (await response.json()) as unknown };
}

export async function getFlowListingRequest(
  token: string | null,
  flowId: string,
): Promise<MarketplaceListing | null> {
  const { status, data } = await proxy(
    `/api/marketplace/flows/${encodeURIComponent(flowId)}`,
    "GET",
    token,
  );
  const result = parseResponse(getFlowListingContract, status, data);
  if (result.status !== 200) throw new MarketplaceRequestError(result.data.error);
  return result.data.listing;
}

export async function publishListingRequest(
  token: string | null,
  input: PublishListingInput,
): Promise<MarketplaceListing> {
  const { status, data } = await proxy("/api/marketplace", "POST", token, input);
  const result = parseResponse(publishListingContract, status, data);
  if (result.status !== 200) throw new MarketplaceRequestError(result.data.error);
  return result.data.listing;
}

export async function unpublishListingRequest(token: string | null, slug: string): Promise<void> {
  const { status, data } = await proxy(
    `/api/marketplace/${encodeURIComponent(slug)}`,
    "DELETE",
    token,
  );
  const result = parseResponse(unpublishListingContract, status, data);
  if (result.status !== 200) throw new MarketplaceRequestError(result.data.error);
}
