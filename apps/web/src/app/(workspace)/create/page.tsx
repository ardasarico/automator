import { redirect } from "next/navigation";

/**
 * Opens a fresh canvas. The id is minted here so "New flow" and "Fork flow" both land on
 * the canonical flow URL; the flows API will replace this with a create call.
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ example?: string | string[] }>;
}) {
  const requested = (await searchParams).example;
  const slug = Array.isArray(requested) ? requested[0] : requested;
  const query = slug ? `?example=${encodeURIComponent(slug)}` : "";
  redirect(`/flows/${crypto.randomUUID()}${query}`);
}
