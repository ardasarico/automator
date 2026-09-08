import {
  RiCheckboxCircleLine,
  RiCoinLine,
  RiDiscordLine,
  RiFileList3Line,
  RiGitBranchLine,
  RiPriceTag3Line,
  RiQrCodeLine,
  RiSparklingLine,
  RiTimeLine,
  RiWebhookLine,
} from "@remixicon/react";

export const flowExamples = [
  {
    id: "approval-request",
    name: "Approval request",
    description: "Collect a request, confirm it, and post it to Discord.",
    steps: [
      { name: "Request access", description: "A form asks for the visitor's name and reason." },
      {
        name: "Send this request?",
        description: "A confirmation screen sends the request or goes back.",
      },
      {
        name: "Post to Discord",
        description: "The request lands in a channel through a webhook you set after forking.",
      },
    ],
    nodes: [
      { name: "Form", icon: RiFileList3Line },
      { name: "Discord message", icon: RiDiscordLine },
    ],
    nodeTypes: ["screen.form", "screen.confirmation", "notify.discord"],
  },
  {
    id: "audience-gate",
    name: "Audience gate",
    description: "Send members and guests down different paths.",
    steps: [
      { name: "Set audience", description: "A variable names the visitor's audience." },
      {
        name: "Is a member?",
        description: "A condition sends members to the welcome screen and guests to the waitlist.",
      },
      { name: "Join the waitlist", description: "Guests leave an email and see a confirmation." },
    ],
    nodes: [
      { name: "Condition", icon: RiGitBranchLine },
      { name: "Form", icon: RiFileList3Line },
    ],
    nodeTypes: ["logic.set-variable", "logic.condition", "screen.form"],
  },
  {
    id: "scheduled-reminder",
    name: "Scheduled reminder",
    description: "Post a reminder to Discord every hour, with a dry-run switch.",
    steps: [
      { name: "Every hour", description: "A schedule trigger starts the flow." },
      { name: "Dry run?", description: "A variable set to “yes” keeps the run silent." },
      {
        name: "Rehearse or post",
        description: "The dry run waits a second; switching it to “no” posts to Discord.",
      },
    ],
    nodes: [
      { name: "Schedule", icon: RiTimeLine },
      { name: "Discord message", icon: RiDiscordLine },
    ],
    nodeTypes: ["logic.set-variable", "logic.condition", "logic.wait", "notify.discord"],
  },
  {
    id: "event-check-in",
    name: "Event check-in",
    description: "Register visitors and hand them a QR code for the door.",
    steps: [
      { name: "Welcome", description: "A welcome screen invites the visitor to register." },
      { name: "Your details", description: "A form collects a name and an email." },
      {
        name: "Entry code",
        description: "A QR code screen shows the code to present at the door.",
      },
      { name: "Announce check-in", description: "Discord gets a message once the code is shown." },
    ],
    nodes: [
      { name: "QR code", icon: RiQrCodeLine },
      { name: "Confirmation", icon: RiCheckboxCircleLine },
    ],
    nodeTypes: ["screen.page", "screen.form", "screen.qr-code", "notify.discord"],
  },
  {
    id: "ai-digest",
    name: "AI digest",
    description: "Have a model write a short update and post it to Discord.",
    steps: [
      { name: "Set topic", description: "A variable names what the update is about." },
      {
        name: "Write the digest",
        description: "Generate text turns the topic into two friendly sentences.",
      },
      {
        name: "Post the digest",
        description: "Discord gets the text through a webhook you set after forking.",
      },
    ],
    nodes: [
      { name: "Generate text", icon: RiSparklingLine },
      { name: "Discord message", icon: RiDiscordLine },
    ],
    nodeTypes: ["logic.set-variable", "ai.generate-text", "notify.discord"],
  },
  {
    id: "support-triage",
    name: "Support triage",
    description: "Sort support messages with AI and route each kind to Discord.",
    steps: [
      { name: "Describe the issue", description: "A form takes the visitor's message." },
      {
        name: "Sort the message",
        description: "Classify labels it a bug, a question or feedback.",
      },
      {
        name: "Route it",
        description:
          "Two conditions send each label down its own branch to a Discord message written for it.",
      },
      { name: "Confirm", description: "The visitor sees a screen matching where it went." },
    ],
    nodes: [
      { name: "Classify", icon: RiPriceTag3Line },
      { name: "Condition", icon: RiGitBranchLine },
    ],
    nodeTypes: ["screen.form", "ai.classify", "logic.condition", "notify.discord"],
  },
  {
    id: "usdc-balance-alert",
    name: "USDC balance alert",
    description: "Warn on Discord when the wallet drops below 10 USDC.",
    steps: [
      { name: "Read USDC balance", description: "Reads the flow owner's USDC balance." },
      { name: "Below 10 USDC?", description: "A condition compares the formatted balance." },
      { name: "Warn on Discord", description: "Only the low-balance branch posts a message." },
    ],
    nodes: [
      { name: "USDC balance", icon: RiCoinLine },
      { name: "Condition", icon: RiGitBranchLine },
    ],
    nodeTypes: ["usdc.balance", "logic.condition", "notify.discord"],
  },
  {
    id: "usdc-payout",
    name: "USDC payout",
    description: "Pay a recipient from a webhook request and confirm on Discord.",
    steps: [
      { name: "Payout request", description: "A webhook delivers the recipient and amount." },
      { name: "Send USDC", description: "The payout node transfers the amount to the recipient." },
      {
        name: "Confirm on Discord",
        description: "The receipt is posted with its transaction hash.",
      },
    ],
    nodes: [
      { name: "Webhook", icon: RiWebhookLine },
      { name: "USDC payout", icon: RiCoinLine },
    ],
    nodeTypes: ["trigger.webhook", "usdc.payout", "notify.discord"],
  },
] as const;
