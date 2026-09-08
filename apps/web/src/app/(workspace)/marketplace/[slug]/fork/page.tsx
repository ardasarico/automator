import { redirect } from "next/navigation";

/** Legacy links return to the listing; only the submitted fork action creates a flow. */
export default async function ForkListingPage({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/marketplace/${encodeURIComponent((await params).slug)}`);
}
