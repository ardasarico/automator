import {
  RiBubbleChartLine,
  RiCornerDownLeftLine,
  RiCameraLensLine,
  RiCheckboxCircleLine,
  RiCoinLine,
  RiDiscordLine,
  RiFileAddLine,
  RiFileList3Line,
  RiFileSearchLine,
  RiGitBranchLine,
  RiPriceTag3Line,
  RiQrCodeLine,
  RiSparklingLine,
  RiTerminalBoxLine,
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
  {
    id: "applicant-intake",
    name: "Applicant intake",
    description: "Save applicants to a table and recognise the ones who come back.",
    steps: [
      { name: "Your details", description: "A form collects the applicant's name and email." },
      {
        name: "Seen this email?",
        description: "Find records looks the email up in the table you pick after forking.",
      },
      {
        name: "Save the applicant",
        description: "A new email becomes a record; a known one skips straight to the greeting.",
      },
    ],
    nodes: [
      { name: "Find records", icon: RiFileSearchLine },
      { name: "Create record", icon: RiFileAddLine },
    ],
    nodeTypes: ["screen.form", "data.find-records", "data.create-record", "screen.page"],
  },
  {
    id: "uniswap-pool-watch",
    name: "Uniswap pool watch",
    description:
      "Read a Uniswap v3 pool from a subgraph every hour and post when ETH crosses a price.",
    steps: [
      { name: "Every hour", description: "A schedule trigger starts the flow." },
      {
        name: "Read the pool",
        description: "Query subgraph asks the Uniswap v3 subgraph for the USDC/ETH pool's price.",
      },
      {
        name: "Above $4,000?",
        description: "A condition posts to Discord only when the pool prices ETH above the line.",
      },
    ],
    nodes: [
      { name: "Query subgraph", icon: RiBubbleChartLine },
      { name: "Discord message", icon: RiDiscordLine },
    ],
    nodeTypes: ["trigger.schedule", "graph.query-subgraph", "logic.condition", "notify.discord"],
  },
  {
    id: "selfie-gated-claim",
    name: "Selfie-gated claim",
    description: "Pay one USDC claim per live person, checked with a World App selfie.",
    steps: [
      { name: "Sign in", description: "Privy signs the visitor in and keeps their wallet." },
      {
        name: "Selfie Check",
        description:
          "World App takes a selfie and proves a live person is claiming, no Orb needed.",
      },
      {
        name: "Verified?",
        description: "A condition lets only a verified check through to the payout.",
      },
      { name: "Send USDC", description: "The payout node pays the visitor's wallet once." },
    ],
    nodes: [
      { name: "Selfie Check", icon: RiCameraLensLine },
      { name: "USDC payout", icon: RiCoinLine },
    ],
    nodeTypes: ["privy.login", "world.selfie-check", "logic.condition", "usdc.payout"],
  },
  {
    id: "price-quote-api",
    name: "Price quote API",
    description: "Publish a pool price as an HTTP endpoint your own code and agents can call.",
    steps: [
      {
        name: "API call",
        description: "The endpoint takes a pool address and hands it to the rest of the flow.",
      },
      {
        name: "Read the pool",
        description: "Query subgraph asks Uniswap v3 what that pool prices its tokens at.",
      },
      {
        name: "Answer the caller",
        description: "Return hands back the price and the pool's locked value as JSON.",
      },
    ],
    nodes: [
      { name: "API call", icon: RiTerminalBoxLine },
      { name: "Return", icon: RiCornerDownLeftLine },
    ],
    nodeTypes: ["trigger.api", "graph.query-subgraph", "logic.return"],
  },
] as const;
