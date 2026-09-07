import { flowNodeTypes, type FlowNodeType } from "@automator/contracts";
import {
  RiBankCardLine,
  RiLayoutLine,
  RiLinksLine,
  RiRobot2Line,
  RiSmartphoneLine,
  RiTimeLine,
  RiWebhookLine,
  type RemixiconComponentType,
} from "@remixicon/react";

export type FlowNodeCategory = "trigger" | "integration" | "ai" | "screen";

export type CatalogIcon =
  | { kind: "remix"; icon: RemixiconComponentType }
  /** An integration logo from `public/integrations`. `onWhite` gives dark marks a white plate. */
  | { kind: "logo"; src: string; onWhite?: boolean };

/** One handle on a node card: `id` is the React Flow handle id the document records. */
export type CatalogPort = { id: string; label: string };

export type CatalogEntry = {
  type: FlowNodeType;
  category: FlowNodeCategory;
  label: string;
  description: string;
  icon: CatalogIcon;
  /** Handles on the left edge; triggers have none. */
  inputs: readonly CatalogPort[];
  /** Handles on the right edge; every type has at least one. */
  outputs: readonly CatalogPort[];
};

export const catalogCategories: Record<FlowNodeCategory, string> = {
  trigger: "Triggers",
  integration: "Integrations",
  ai: "AI",
  screen: "Screens",
};

/** Singular names for one node's eyebrow and the inspector; the palette groups use `catalogCategories`. */
export const categoryLabels: Record<FlowNodeCategory, string> = {
  trigger: "Trigger",
  integration: "Integration",
  ai: "AI",
  screen: "Screen",
};

export const categoryOrder: readonly FlowNodeCategory[] = [
  "trigger",
  "integration",
  "ai",
  "screen",
];

export const catalog: readonly CatalogEntry[] = [
  {
    type: "trigger.schedule",
    category: "trigger",
    label: "Schedule",
    description: "Start the flow on a fixed interval or at a set time.",
    icon: { kind: "remix", icon: RiTimeLine },
    inputs: [],
    outputs: [{ id: "tick", label: "Tick" }],
  },
  {
    type: "trigger.onchain-event",
    category: "trigger",
    label: "Onchain event",
    description: "Start the flow when a contract emits an event.",
    icon: { kind: "remix", icon: RiLinksLine },
    inputs: [],
    outputs: [{ id: "event", label: "Event" }],
  },
  {
    type: "trigger.webhook",
    category: "trigger",
    label: "Webhook",
    description: "Start the flow from an incoming HTTP request.",
    icon: { kind: "remix", icon: RiWebhookLine },
    inputs: [],
    outputs: [{ id: "request", label: "Request" }],
  },
  {
    type: "trigger.miniapp-open",
    category: "trigger",
    label: "Mini-app opened",
    description: "Start the flow when a visitor opens the mini-app.",
    icon: { kind: "remix", icon: RiSmartphoneLine },
    inputs: [],
    outputs: [{ id: "visitor", label: "Visitor" }],
  },
  {
    type: "integration.world-selfie-check",
    category: "integration",
    label: "World Selfie Check",
    description: "Verify the visitor with a World Selfie Check.",
    icon: { kind: "logo", src: "/integrations/world.svg", onWhite: true },
    inputs: [{ id: "visitor", label: "Visitor" }],
    outputs: [{ id: "verified", label: "Verified" }],
  },
  {
    type: "integration.privy-wallet",
    category: "integration",
    label: "Privy Wallet",
    description: "Connect or use the visitor's Privy wallet.",
    icon: { kind: "logo", src: "/integrations/privy.svg" },
    inputs: [{ id: "visitor", label: "Visitor" }],
    outputs: [{ id: "wallet", label: "Wallet" }],
  },
  {
    type: "integration.usdc-payment",
    category: "integration",
    label: "USDC payment",
    description: "Request a USDC payment and wait for confirmation.",
    icon: { kind: "remix", icon: RiBankCardLine },
    inputs: [
      { id: "amount", label: "Amount" },
      { id: "payer", label: "Payer" },
    ],
    outputs: [{ id: "receipt", label: "Receipt" }],
  },
  {
    type: "ai.agent",
    category: "ai",
    label: "AI agent",
    description: "Run an agent with a prompt and a fixed set of tools.",
    icon: { kind: "remix", icon: RiRobot2Line },
    inputs: [
      { id: "prompt", label: "Prompt" },
      { id: "context", label: "Context" },
    ],
    outputs: [{ id: "result", label: "Result" }],
  },
  {
    type: "screen.page",
    category: "screen",
    label: "Screen",
    description: "Show a screen to the visitor in the mini-app.",
    icon: { kind: "remix", icon: RiLayoutLine },
    inputs: [{ id: "data", label: "Data" }],
    outputs: [{ id: "next", label: "Next" }],
  },
];

const byType = new Map(catalog.map((entry) => [entry.type, entry]));

export function getCatalogEntry(type: FlowNodeType): CatalogEntry {
  const entry = byType.get(type);
  if (!entry) throw new Error(`Unknown node type: ${type}`);
  return entry;
}

/** Narrow an arbitrary string, such as a drag payload, to a known node type. */
export function isFlowNodeType(value: string): value is FlowNodeType {
  return (flowNodeTypes as readonly string[]).includes(value);
}
