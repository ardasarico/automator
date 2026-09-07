import { notFound, redirect } from "next/navigation";
import { forkListing } from "../../../../../marketplace/server";

/** "Fork flow" on a published listing: the API copies it into a new flow, which opens here. */
export default async function ForkListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const record = await forkListing(decodeURIComponent((await params).slug));
  if (!record) notFound();
  redirect(`/flows/${record.flow.id}`);
}
