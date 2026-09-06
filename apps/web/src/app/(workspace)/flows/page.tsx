import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FlowBrowser, type FlowListItem } from "./flow-browser";

export const metadata: Metadata = { title: "Flows · Automator" };

// Temporary fixtures for /flows?preview=filled in development.
const previewFlows: readonly FlowListItem[] = [
  {
    id: "preview-ticket",
    href: "/marketplace/ticket-checkout",
    name: "Event ticket checkout",
    description: "Verify visitors, collect USDC and issue an event ticket.",
    status: "Published",
    updatedAt: "2026-09-06T09:00:00Z",
    steps: ["Selfie Check", "USDC payment", "Issue ticket"],
  },
  {
    id: "preview-payment",
    href: "/marketplace/payment-link",
    name: "Freelance payment link",
    description: "Accept a payment through a shareable checkout.",
    status: "Draft",
    updatedAt: "2026-09-05T14:00:00Z",
    steps: ["Connect wallet", "USDC payment"],
  },
  {
    id: "preview-access",
    href: "/marketplace/verification-gate",
    name: "Community access",
    description: "Verify each visitor before granting access to the community.",
    status: "Published",
    updatedAt: "2026-09-04T11:00:00Z",
    steps: ["Selfie Check", "Access check"],
  },
  {
    id: "preview-approval",
    href: "/marketplace/approval-flow",
    name: "Team expense approval",
    description: "Review a request and approve the next step.",
    status: "Draft",
    updatedAt: "2026-09-03T16:00:00Z",
    steps: [],
  },
];

export default async function FlowsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const view = (await cookies()).get("flows_view")?.value;
  const showPreview =
    process.env.NODE_ENV === "development" && (await searchParams).preview === "filled";
  return (
    <FlowBrowser
      flows={showPreview ? previewFlows : []}
      initialView={view === "table" ? "table" : "grid"}
    />
  );
}
