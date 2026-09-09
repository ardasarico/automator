import { RiGitForkLine } from "@remixicon/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageFrame } from "../../../../components/page-frame";
import { FlowActionButton } from "../../../../flows/action-button";
import { createFlowAction, forkFlowAction } from "../../../../flows/actions";
import { CopyLinkButton } from "../../../../marketplace/copy-link-button";
import { FlowPreview } from "../../../../marketplace/flow-preview";
import type { MarketplaceItem } from "../../../../marketplace/listing";
import { ListingMarks } from "../../../../marketplace/listing-marks";
import { findMarketplaceItem } from "../../../../marketplace/server";

type Props = { params: Promise<{ slug: string }> };

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const forkCountFormat = new Intl.NumberFormat("en");

async function loadListing(slug: string) {
  const listing = await findMarketplaceItem(slug);
  if (!listing) notFound();
  return listing;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const listing = await loadListing((await params).slug);
  return {
    title: `${listing.name} · Marketplace · Automator`,
    description: listing.description,
  };
}

function ListingByline({ listing }: { listing: MarketplaceItem }) {
  if (listing.author.kind === "automator")
    return <p className="mb-2 text-caption text-muted-foreground">By Automator</p>;
  const { name, username } = listing.author;
  return (
    <p className="mb-2 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground tabular-nums">
      <span>
        By {name} <span className="text-muted-foreground/80">@{username}</span>
      </span>
      {listing.publishedAt && (
        <>
          <span aria-hidden="true">·</span>
          <time dateTime={listing.publishedAt}>
            {dateFormat.format(new Date(listing.publishedAt))}
          </time>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span>
        {forkCountFormat.format(listing.forkCount)} {listing.forkCount === 1 ? "fork" : "forks"}
      </span>
    </p>
  );
}

export default async function ListingPage({ params }: Props) {
  const listing = await loadListing((await params).slug);

  return (
    <PageFrame
      title={listing.name}
      parents={[{ label: "Marketplace", href: "/marketplace" }]}
      actions={
        <>
          <CopyLinkButton size="sm" path={`/marketplace/${encodeURIComponent(listing.slug)}`} />
          <FlowActionButton
            size="sm"
            action={
              listing.author.kind === "automator"
                ? createFlowAction.bind(null, { example: listing.slug })
                : forkFlowAction.bind(null, listing.slug)
            }
            aria-label={`Fork flow: ${listing.name}`}
          >
            <RiGitForkLine aria-hidden="true" />
            Fork flow
          </FlowActionButton>
        </>
      }
    >
      <div className="w-full max-w-4xl pb-12">
        <header className="border-b pb-8">
          <ListingMarks nodeTypes={listing.nodeTypes} />
          <div className="mt-5">
            <ListingByline listing={listing} />
            <p className="max-w-lg text-body text-pretty text-muted-foreground">
              {listing.description}
            </p>
          </div>
        </header>
        {listing.document && listing.document.nodes.length > 0 && (
          <section className="mt-8" aria-labelledby="flow-preview-title">
            <h2 id="flow-preview-title" className="text-section">
              The flow
            </h2>
            <p className="mt-1 mb-4 text-caption text-muted-foreground">
              Read-only. Fork it to edit a copy on your own canvas.
            </p>
            <FlowPreview document={listing.document} label={`Graph of ${listing.name}`} />
          </section>
        )}
        <section className="mt-8" aria-labelledby="flow-steps-title">
          <h2 id="flow-steps-title" className="text-section">
            How it works
          </h2>
          <ol className="mt-6 space-y-6">
            {listing.steps.map((step, index) => (
              <li key={step.name} className="flex gap-4">
                <span
                  className="pt-0.5 font-mono text-caption text-muted-foreground"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-label">{step.name}</h3>
                  <p className="mt-1 max-w-lg text-body text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </PageFrame>
  );
}
