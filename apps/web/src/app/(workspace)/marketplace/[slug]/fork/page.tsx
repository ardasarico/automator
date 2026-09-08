import { redirect } from "next/navigation";

export default async function ForkListingPage({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/marketplace/${encodeURIComponent((await params).slug)}`);
}
