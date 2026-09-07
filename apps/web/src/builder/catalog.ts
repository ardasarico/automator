import { flowNodeTypes, type FlowNodeType } from "@automator/contracts";
import {
  RiArrowLeftRightLine,
  RiBankCardLine,
  RiBracesLine,
  RiChatQuoteLine,
  RiCheckboxCircleLine,
  RiCodeSSlashLine,
  RiCoinLine,
  RiDiscordLine,
  RiFileEditLine,
  RiFileListLine,
  RiFileSearchLine,
  RiFileTextLine,
  RiFilter3Line,
  RiFlashlightLine,
  RiGitBranchLine,
  RiGitMergeLine,
  RiLayoutLine,
  RiLinksLine,
  RiLoginBoxLine,
  RiMailLine,
  RiNotification3Line,
  RiPenNibLine,
  RiPlayLine,
  RiPlugLine,
  RiPriceTag3Line,
  RiQrCodeLine,
  RiQuillPenLine,
  RiRepeatLine,
  RiRobot2Line,
  RiRouteLine,
  RiSendPlaneLine,
  RiSmartphoneLine,
  RiTelegramLine,
  RiTimeLine,
  RiTimerLine,
  RiWallet3Line,
  RiWebhookLine,
  type RemixiconComponentType,
} from "@remixicon/react";

/** What kind of step a node is. Integrations are provider actions; their triggers are triggers. */
export type FlowNodeCategory =
  | "trigger"
  | "logic"
  | "onchain"
  | "ai"
  | "screen"
  | "notify"
  | "integration";

/** The palette's first level: one group per core kind, one per integration provider. */
export type CatalogGroupId =
  | "triggers"
  | "logic"
  | "onchain"
  | "ai"
  | "screens"
  | "notify"
  | "world"
  | "privy"
  | "usdc";

export type CatalogIcon =
  | { kind: "remix"; icon: RemixiconComponentType }
  /** An integration logo from `public/integrations`. `onWhite` gives dark marks a white plate. */
  | { kind: "logo"; src: string; onWhite?: boolean };

/** One handle on a node card: `id` is the React Flow handle id the document records. */
export type CatalogPort = { id: string; label: string };

export type CatalogEntry = {
  type: FlowNodeType;
  category: FlowNodeCategory;
  group: CatalogGroupId;
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
  logic: "Logic",
  onchain: "Onchain",
  ai: "AI",
  screen: "Screens",
  notify: "Notifications",
  integration: "Integrations",
};

/** Singular names for one node's eyebrow and the inspector; the palette groups use `catalogCategories`. */
export const categoryLabels: Record<FlowNodeCategory, string> = {
  trigger: "Trigger",
  logic: "Logic",
  onchain: "Onchain",
  ai: "AI",
  screen: "Screen",
  notify: "Notification",
  integration: "Integration",
};

/** One icon per category, for the palette's category filter. */
export const categoryIcons: Record<FlowNodeCategory, RemixiconComponentType> = {
  trigger: RiFlashlightLine,
  logic: RiGitBranchLine,
  onchain: RiCoinLine,
  ai: RiRobot2Line,
  screen: RiLayoutLine,
  notify: RiNotification3Line,
  integration: RiPlugLine,
};

export type CatalogGroupDefinition = {
  id: CatalogGroupId;
  label: string;
  description: string;
  icon: CatalogIcon;
  /** Core groups are kinds of step; integration groups are providers, listed after them. */
  kind: "core" | "integration";
};

export const categoryOrder: readonly FlowNodeCategory[] = [
  "trigger",
  "logic",
  "onchain",
  "ai",
  "screen",
  "notify",
  "integration",
];

const remix = (icon: RemixiconComponentType): CatalogIcon => ({ kind: "remix", icon });
const worldLogo: CatalogIcon = { kind: "logo", src: "/integrations/world.svg", onWhite: true };
const privyLogo: CatalogIcon = { kind: "logo", src: "/integrations/privy.svg" };
const port = (id: string, label: string): CatalogPort => ({ id, label });

/** Palette groups in display order: core kinds first, then one entry per provider. */
export const catalogGroups: readonly CatalogGroupDefinition[] = [
  {
    id: "triggers",
    label: "Triggers",
    description: "Ways a flow can start.",
    icon: remix(RiFlashlightLine),
    kind: "core",
  },
  {
    id: "logic",
    label: "Logic",
    description: "Branch, loop, wait, and shape data.",
    icon: remix(RiGitBranchLine),
    kind: "core",
  },
  {
    id: "onchain",
    label: "Onchain",
    description: "Read and write contracts, move tokens.",
    icon: remix(RiCoinLine),
    kind: "core",
  },
  {
    id: "ai",
    label: "AI",
    description: "Agents and text models.",
    icon: remix(RiRobot2Line),
    kind: "core",
  },
  {
    id: "screens",
    label: "Screens",
    description: "What the visitor sees in the mini-app.",
    icon: remix(RiLayoutLine),
    kind: "core",
  },
  {
    id: "notify",
    label: "Notifications",
    description: "Messages to chats and inboxes.",
    icon: remix(RiNotification3Line),
    kind: "core",
  },
  {
    id: "world",
    label: "World",
    description: "Proof of personhood and World ID.",
    icon: worldLogo,
    kind: "integration",
  },
  {
    id: "privy",
    label: "Privy",
    description: "Wallets, login, and signing.",
    icon: privyLogo,
    kind: "integration",
  },
  {
    id: "usdc",
    label: "USDC",
    description: "Payments, payouts, and balances.",
    icon: remix(RiBankCardLine),
    kind: "integration",
  },
];

/** Dummy entries: every type is a card with ports and no config until the runtime defines it. */
export const catalog: readonly CatalogEntry[] = [
  // Triggers
  {
    type: "trigger.schedule",
    category: "trigger",
    group: "triggers",
    label: "Schedule",
    description: "Start the flow on a fixed interval or at a set time.",
    icon: remix(RiTimeLine),
    inputs: [],
    outputs: [port("tick", "Tick")],
  },
  {
    type: "trigger.onchain-event",
    category: "trigger",
    group: "triggers",
    label: "Onchain event",
    description: "Start the flow when a contract emits an event.",
    icon: remix(RiLinksLine),
    inputs: [],
    outputs: [port("event", "Event")],
  },
  {
    type: "trigger.webhook",
    category: "trigger",
    group: "triggers",
    label: "Webhook",
    description: "Start the flow from an incoming HTTP request.",
    icon: remix(RiWebhookLine),
    inputs: [],
    outputs: [port("request", "Request")],
  },
  {
    type: "trigger.miniapp-open",
    category: "trigger",
    group: "triggers",
    label: "Mini-app opened",
    description: "Start the flow when a visitor opens the mini-app.",
    icon: remix(RiSmartphoneLine),
    inputs: [],
    outputs: [port("visitor", "Visitor")],
  },
  {
    type: "trigger.manual",
    category: "trigger",
    group: "triggers",
    label: "Manual run",
    description: "Start the flow by hand from the dashboard.",
    icon: remix(RiPlayLine),
    inputs: [],
    outputs: [port("run", "Run")],
  },
  {
    type: "world.verification-completed",
    category: "trigger",
    group: "world",
    label: "Verification completed",
    description: "Start the flow when a World verification finishes.",
    icon: worldLogo,
    inputs: [],
    outputs: [port("proof", "Proof")],
  },

  // Logic
  {
    type: "logic.condition",
    category: "logic",
    group: "logic",
    label: "If/else",
    description: "Branch on a condition.",
    icon: remix(RiGitBranchLine),
    inputs: [port("value", "Value")],
    outputs: [port("true", "True"), port("false", "False")],
  },
  {
    type: "logic.switch",
    category: "logic",
    group: "logic",
    label: "Switch",
    description: "Route by matching a value against cases.",
    icon: remix(RiRouteLine),
    inputs: [port("value", "Value")],
    outputs: [port("match", "Match"), port("default", "Default")],
  },
  {
    type: "logic.wait",
    category: "logic",
    group: "logic",
    label: "Wait",
    description: "Pause the flow for a duration or until a time.",
    icon: remix(RiTimerLine),
    inputs: [port("in", "In")],
    outputs: [port("done", "Done")],
  },
  {
    type: "logic.for-each",
    category: "logic",
    group: "logic",
    label: "For each",
    description: "Run the next steps once per item in a list.",
    icon: remix(RiRepeatLine),
    inputs: [port("items", "Items")],
    outputs: [port("item", "Item"), port("done", "Done")],
  },
  {
    type: "logic.merge",
    category: "logic",
    group: "logic",
    label: "Merge",
    description: "Wait for two branches and combine their results.",
    icon: remix(RiGitMergeLine),
    inputs: [port("a", "A"), port("b", "B")],
    outputs: [port("merged", "Merged")],
  },
  {
    type: "logic.filter",
    category: "logic",
    group: "logic",
    label: "Filter",
    description: "Keep only the items that pass a condition.",
    icon: remix(RiFilter3Line),
    inputs: [port("items", "Items")],
    outputs: [port("kept", "Kept"), port("dropped", "Dropped")],
  },
  {
    type: "logic.set-variable",
    category: "logic",
    group: "logic",
    label: "Set variable",
    description: "Store a value in a flow variable.",
    icon: remix(RiBracesLine),
    inputs: [port("value", "Value")],
    outputs: [port("value", "Value")],
  },
  {
    type: "logic.run-code",
    category: "logic",
    group: "logic",
    label: "Run code",
    description: "Transform data with a small JavaScript function.",
    icon: remix(RiCodeSSlashLine),
    inputs: [port("input", "Input")],
    outputs: [port("output", "Output")],
  },

  // Onchain
  {
    type: "onchain.read-contract",
    category: "onchain",
    group: "onchain",
    label: "Read contract",
    description: "Call a view function on a contract.",
    icon: remix(RiFileSearchLine),
    inputs: [port("args", "Args")],
    outputs: [port("result", "Result")],
  },
  {
    type: "onchain.write-contract",
    category: "onchain",
    group: "onchain",
    label: "Write contract",
    description: "Send a transaction that calls a contract function.",
    icon: remix(RiFileEditLine),
    inputs: [port("wallet", "Wallet"), port("args", "Args")],
    outputs: [port("receipt", "Receipt")],
  },
  {
    type: "onchain.transfer-token",
    category: "onchain",
    group: "onchain",
    label: "Transfer token",
    description: "Send a token from a wallet to an address.",
    icon: remix(RiArrowLeftRightLine),
    inputs: [port("wallet", "Wallet"), port("amount", "Amount")],
    outputs: [port("receipt", "Receipt")],
  },
  {
    type: "onchain.sign-message",
    category: "onchain",
    group: "onchain",
    label: "Sign message",
    description: "Sign a message with a wallet.",
    icon: remix(RiQuillPenLine),
    inputs: [port("wallet", "Wallet"), port("message", "Message")],
    outputs: [port("signature", "Signature")],
  },

  // AI
  {
    type: "ai.agent",
    category: "ai",
    group: "ai",
    label: "AI agent",
    description: "Run an agent with a prompt and a fixed set of tools.",
    icon: remix(RiRobot2Line),
    inputs: [port("prompt", "Prompt"), port("context", "Context")],
    outputs: [port("result", "Result")],
  },
  {
    type: "ai.classify",
    category: "ai",
    group: "ai",
    label: "Classify",
    description: "Pick one label for a text from a fixed list.",
    icon: remix(RiPriceTag3Line),
    inputs: [port("text", "Text")],
    outputs: [port("label", "Label")],
  },
  {
    type: "ai.extract",
    category: "ai",
    group: "ai",
    label: "Extract data",
    description: "Pull structured fields out of a text.",
    icon: remix(RiFileListLine),
    inputs: [port("text", "Text")],
    outputs: [port("data", "Data")],
  },
  {
    type: "ai.generate-text",
    category: "ai",
    group: "ai",
    label: "Generate text",
    description: "Write a text from a prompt.",
    icon: remix(RiChatQuoteLine),
    inputs: [port("prompt", "Prompt")],
    outputs: [port("text", "Text")],
  },

  // Screens
  {
    type: "screen.page",
    category: "screen",
    group: "screens",
    label: "Screen",
    description: "Show a screen to the visitor in the mini-app.",
    icon: remix(RiLayoutLine),
    inputs: [port("data", "Data")],
    outputs: [port("next", "Next")],
  },
  {
    type: "screen.form",
    category: "screen",
    group: "screens",
    label: "Form",
    description: "Ask the visitor to fill in a form.",
    icon: remix(RiFileTextLine),
    inputs: [port("data", "Data")],
    outputs: [port("submitted", "Submitted")],
  },
  {
    type: "screen.confirmation",
    category: "screen",
    group: "screens",
    label: "Confirmation",
    description: "Ask the visitor to confirm or cancel.",
    icon: remix(RiCheckboxCircleLine),
    inputs: [port("data", "Data")],
    outputs: [port("confirmed", "Confirmed"), port("cancelled", "Cancelled")],
  },
  {
    type: "screen.qr-code",
    category: "screen",
    group: "screens",
    label: "QR code",
    description: "Show a value as a QR code.",
    icon: remix(RiQrCodeLine),
    inputs: [port("value", "Value")],
    outputs: [port("next", "Next")],
  },

  // Notifications
  {
    type: "notify.telegram",
    category: "notify",
    group: "notify",
    label: "Telegram message",
    description: "Send a message to a Telegram chat.",
    icon: remix(RiTelegramLine),
    inputs: [port("message", "Message")],
    outputs: [port("sent", "Sent")],
  },
  {
    type: "notify.email",
    category: "notify",
    group: "notify",
    label: "Email",
    description: "Send an email.",
    icon: remix(RiMailLine),
    inputs: [port("message", "Message")],
    outputs: [port("sent", "Sent")],
  },
  {
    type: "notify.discord",
    category: "notify",
    group: "notify",
    label: "Discord message",
    description: "Post a message to a Discord channel.",
    icon: remix(RiDiscordLine),
    inputs: [port("message", "Message")],
    outputs: [port("sent", "Sent")],
  },

  // Integrations
  {
    type: "world.selfie-check",
    category: "integration",
    group: "world",
    label: "World Selfie Check",
    description: "Verify the visitor with a World Selfie Check.",
    icon: worldLogo,
    inputs: [port("visitor", "Visitor")],
    outputs: [port("verified", "Verified")],
  },
  {
    type: "world.id-verify",
    category: "integration",
    group: "world",
    label: "World ID verify",
    description: "Verify the visitor's World ID proof.",
    icon: worldLogo,
    inputs: [port("visitor", "Visitor")],
    outputs: [port("proof", "Proof")],
  },
  {
    type: "privy.wallet",
    category: "integration",
    group: "privy",
    label: "Privy Wallet",
    description: "Connect or use the visitor's Privy wallet.",
    icon: privyLogo,
    inputs: [port("visitor", "Visitor")],
    outputs: [port("wallet", "Wallet")],
  },
  {
    type: "privy.login",
    category: "integration",
    group: "privy",
    label: "Privy login",
    description: "Sign the visitor in with Privy.",
    icon: remix(RiLoginBoxLine),
    inputs: [port("visitor", "Visitor")],
    outputs: [port("user", "User")],
  },
  {
    type: "privy.sign-transaction",
    category: "integration",
    group: "privy",
    label: "Sign transaction",
    description: "Sign a transaction with the visitor's Privy wallet.",
    icon: remix(RiPenNibLine),
    inputs: [port("wallet", "Wallet"), port("transaction", "Transaction")],
    outputs: [port("signed", "Signed")],
  },
  {
    type: "usdc.payment",
    category: "integration",
    group: "usdc",
    label: "USDC payment",
    description: "Request a USDC payment and wait for confirmation.",
    icon: remix(RiBankCardLine),
    inputs: [port("amount", "Amount"), port("payer", "Payer")],
    outputs: [port("receipt", "Receipt")],
  },
  {
    type: "usdc.payout",
    category: "integration",
    group: "usdc",
    label: "USDC payout",
    description: "Send USDC to a recipient.",
    icon: remix(RiSendPlaneLine),
    inputs: [port("recipient", "Recipient"), port("amount", "Amount")],
    outputs: [port("receipt", "Receipt")],
  },
  {
    type: "usdc.balance",
    category: "integration",
    group: "usdc",
    label: "Check balance",
    description: "Read a wallet's USDC balance.",
    icon: remix(RiWallet3Line),
    inputs: [port("wallet", "Wallet")],
    outputs: [port("balance", "Balance")],
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

export type CatalogGroupSummary = CatalogGroupDefinition & { count: number };

/** The palette's first level: every group with how many entries it holds, in display order. */
export function listCatalogGroups(): CatalogGroupSummary[] {
  return catalogGroups.map((group) => ({
    ...group,
    count: catalog.filter((entry) => entry.group === group.id).length,
  }));
}

export type CatalogSection = { key: string; label: string; entries: CatalogEntry[] };

/**
 * One group's entries split by category in category order, so a provider shows its triggers
 * before its actions. Inside a provider the integration category reads as "Actions". A group
 * with a single category comes back as one unlabelled section.
 */
export function getCatalogGroupSections(group: CatalogGroupId): CatalogSection[] {
  const entries = catalog.filter((entry) => entry.group === group);
  const sections = categoryOrder.flatMap((category) => {
    const matching = entries.filter((entry) => entry.category === category);
    const label = category === "integration" ? "Actions" : catalogCategories[category];
    return matching.length === 0 ? [] : [{ key: category, label, entries: matching }];
  });
  return sections.length === 1 ? [{ key: "all", label: "", entries }] : sections;
}

/**
 * Search across every group, case-insensitively on labels and descriptions, ignoring
 * surrounding space. Results come back grouped by palette group in display order; a blank
 * query matches nothing, since the group list is the palette's resting state.
 */
export function searchCatalog(query: string): CatalogSection[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const matches = (entry: CatalogEntry) =>
    entry.label.toLowerCase().includes(needle) || entry.description.toLowerCase().includes(needle);
  return catalogGroups.flatMap((group) => {
    const entries = catalog.filter((entry) => entry.group === group.id && matches(entry));
    return entries.length === 0 ? [] : [{ key: group.id, label: group.label, entries }];
  });
}
