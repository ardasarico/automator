import type { FlowDocument, FlowEdge, FlowNode, FlowNodeType } from "@automator/contracts";
import { flowExamples } from "../app/(workspace)/marketplace/examples";

export type FlowExample = (typeof flowExamples)[number];

type Fixture = { nodes: FlowNode[]; edges: FlowEdge[] };

const columnGap = 300;
const rowGap = 150;
const origin = { x: 80, y: 120 };

function node(
  id: string,
  type: FlowNodeType,
  column: number,
  row: number,
  label: string,
  config: Record<string, unknown> = {},
): FlowNode {
  return {
    id,
    type,
    position: { x: origin.x + column * columnGap, y: origin.y + row * rowGap },
    label,
    config,
  };
}

function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): FlowEdge {
  return {
    id: `${source}.${sourceHandle}->${target}.${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

const fixtures: Record<FlowExample["id"], () => Fixture> = {
  "applicant-intake": () => ({
    nodes: [
      node("open", "trigger.miniapp-open", 0, 0, "Mini-app opened"),
      node("apply", "screen.form", 1, 0, "Your details", {
        title: "Your details",
        description: "Leave your name and email and we will take it from there.",
        fields: [
          { id: "name", label: "Full name", type: "text", placeholder: "", required: true },
          {
            id: "email",
            label: "Email",
            type: "email",
            placeholder: "you@example.com",
            required: true,
          },
        ],
        submit: "Continue",
      }),
      node("remember", "logic.set-variable", 2, 0, "Remember the applicant", {
        name: "applicant",
        value: "{{input.value}}",
      }),
      node("lookup", "data.find-records", 3, 0, "Seen this email?", {
        tableId: "",
        filters: [{ column: "email", operator: "equals", value: "{{vars.applicant.email}}" }],
        sortColumn: "",
        sortDirection: "desc",
        limit: 25,
      }),
      node("save", "data.create-record", 4, 0, "Save the applicant", {
        tableId: "",
        values: [
          { column: "name", value: "{{vars.applicant.name}}" },
          { column: "email", value: "{{vars.applicant.email}}" },
        ],
      }),
      node("welcome", "screen.page", 5, 0, "You're on the list", {
        title: "You're on the list",
        body: "Thanks {{vars.applicant.name}}, we saved your details and will be in touch.",
        button: "Done",
      }),
      node("back", "screen.page", 4, 1, "Welcome back", {
        title: "Welcome back",
        body: "We already have an application for {{vars.applicant.email}}.",
        button: "Done",
      }),
    ],
    edges: [
      edge("open", "visitor", "apply", "data"),
      edge("apply", "submitted", "remember", "value"),
      edge("remember", "value", "lookup", "query"),
      edge("lookup", "empty", "save", "values"),
      edge("save", "record", "welcome", "data"),
      edge("lookup", "found", "back", "data"),
    ],
  }),

  "approval-request": () => ({
    nodes: [
      node("open", "trigger.miniapp-open", 0, 0, "Mini-app opened"),
      node("request", "screen.form", 1, 0, "Request access", {
        title: "Request access",
        description: "Tell the reviewers who you are and what you need.",
        fields: [
          { id: "name", label: "Your name", type: "text", placeholder: "", required: true },
          {
            id: "reason",
            label: "Why do you need access?",
            type: "textarea",
            placeholder: "One or two sentences",
            required: true,
          },
        ],
        submit: "Continue",
      }),
      node("confirm", "screen.confirmation", 2, 0, "Send this request?", {
        title: "Send this request?",
        message: "The reviewers get your request on Discord and reply there.",
        confirm: "Send request",
        cancel: "Go back",
      }),
      node("notify", "notify.discord", 3, 0, "Post to Discord", {
        webhookUrl: "",
        content: "New access request from {{input.message.name}}: {{input.message.reason}}",
        username: "Automator",
      }),
      node("cancelled", "screen.page", 3, 1, "Request not sent", {
        title: "Request not sent",
        body: "Nothing was shared. Come back whenever you are ready.",
        button: "Start over",
      }),
    ],
    edges: [
      edge("open", "visitor", "request", "data"),
      edge("request", "submitted", "confirm", "data"),
      edge("confirm", "confirmed", "notify", "message"),
      edge("confirm", "cancelled", "cancelled", "data"),
    ],
  }),

  "audience-gate": () => ({
    nodes: [
      node("open", "trigger.miniapp-open", 0, 0, "Mini-app opened"),
      node("audience", "logic.set-variable", 1, 0, "Set audience", {
        name: "audience",
        value: "guest",
      }),
      node("check", "logic.condition", 2, 0, "Is a member?", {
        left: "{{vars.audience}}",
        operator: "equals",
        right: "member",
      }),
      node("members", "screen.page", 3, 0, "Welcome back", {
        title: "Welcome back",
        body: "Members go straight in.",
        button: "Enter",
      }),
      node("waitlist", "screen.form", 3, 1, "Join the waitlist", {
        title: "Join the waitlist",
        description: "Guests get an invite as soon as a seat opens.",
        fields: [
          {
            id: "email",
            label: "Email",
            type: "email",
            placeholder: "you@example.com",
            required: true,
          },
        ],
        submit: "Join",
      }),
      node("joined", "screen.page", 4, 1, "You're on the list", {
        title: "You're on the list",
        body: "We'll email you when it is your turn.",
        button: "Done",
      }),
    ],
    edges: [
      edge("open", "visitor", "audience", "value"),
      edge("audience", "value", "check", "value"),
      edge("check", "true", "members", "data"),
      edge("check", "false", "waitlist", "data"),
      edge("waitlist", "submitted", "joined", "data"),
    ],
  }),

  "scheduled-reminder": () => ({
    nodes: [
      node("schedule", "trigger.schedule", 0, 0, "Every hour", { every: "1h" }),
      node("dry-run", "logic.set-variable", 1, 0, "Dry run?", { name: "dryRun", value: "yes" }),
      node("check", "logic.condition", 2, 0, "Is a dry run?", {
        left: "{{vars.dryRun}}",
        operator: "equals",
        right: "yes",
      }),
      node("rehearse", "logic.wait", 3, 0, "Rehearse", { seconds: 1 }),
      node("notify", "notify.discord", 3, 1, "Post reminder", {
        webhookUrl: "",
        content: "Reminder: the standup starts in 10 minutes.",
        username: "Automator",
      }),
    ],
    edges: [
      edge("schedule", "tick", "dry-run", "value"),
      edge("dry-run", "value", "check", "value"),
      edge("check", "true", "rehearse", "in"),
      edge("check", "false", "notify", "message"),
    ],
  }),

  "event-check-in": () => ({
    nodes: [
      node("open", "trigger.miniapp-open", 0, 0, "Mini-app opened"),
      node("welcome", "screen.page", 1, 0, "Welcome", {
        title: "Welcome to Automator Night",
        body: "Register in a few seconds and get your entry code.",
        button: "Register",
      }),
      node("details", "screen.form", 2, 0, "Your details", {
        title: "Your details",
        description: "",
        fields: [
          { id: "name", label: "Full name", type: "text", placeholder: "", required: true },
          {
            id: "email",
            label: "Email",
            type: "email",
            placeholder: "you@example.com",
            required: true,
          },
        ],
        submit: "Get my code",
      }),
      node("code", "screen.qr-code", 3, 0, "Entry code", {
        title: "Your entry code",
        value: "{{input.value.email}}",
        caption: "Show this code at the door.",
        button: "Done",
      }),
      node("notify", "notify.discord", 4, 0, "Announce check-in", {
        webhookUrl: "",
        content: "{{input.message.name}} just checked in.",
        username: "Automator",
      }),
    ],
    edges: [
      edge("open", "visitor", "welcome", "data"),
      edge("welcome", "next", "details", "data"),
      edge("details", "submitted", "code", "value"),
      edge("code", "next", "notify", "message"),
    ],
  }),
  "ai-digest": () => ({
    nodes: [
      node("start", "trigger.manual", 0, 0, "Run"),
      node("topic", "logic.set-variable", 1, 0, "Set topic", {
        name: "topic",
        value: "what shipped in Automator this week",
      }),
      node("write", "ai.generate-text", 2, 0, "Write the digest", {
        instructions: "You write short, friendly release notes for a developer community.",
        prompt: "Write a two-sentence update about {{vars.topic}}.",
      }),
      node("notify", "notify.discord", 3, 0, "Post the digest", {
        webhookUrl: "",
        content: "{{input.message}}",
        username: "Automator",
      }),
    ],
    edges: [
      edge("start", "run", "topic", "value"),
      edge("topic", "value", "write", "prompt"),
      edge("write", "text", "notify", "message"),
    ],
  }),

  "support-triage": () => ({
    nodes: [
      node("open", "trigger.miniapp-open", 0, 0, "Mini-app opened"),
      node("message", "screen.form", 1, 0, "Describe the issue", {
        title: "How can we help?",
        description: "Tell us what happened and we will route it to the right people.",
        fields: [
          {
            id: "message",
            label: "Your message",
            type: "textarea",
            placeholder: "What happened?",
            required: true,
            sample: "The payout button does nothing when I tap it on Base Sepolia.",
          },
          {
            id: "email",
            label: "Email",
            type: "email",
            placeholder: "you@example.com",
            required: false,
            sample: "",
          },
        ],
        submit: "Send",
      }),
      node("remember", "logic.set-variable", 2, 0, "Remember the message", {
        name: "message",
        value: "{{input.value.message}}",
      }),
      node("classify", "ai.classify", 3, 0, "Sort the message", {
        text: "{{vars.message}}",
        labels: ["bug", "question", "feedback"],
        instructions:
          "You triage support messages for a small product team. A bug reports something broken, a question asks how something works, feedback is everything else.",
      }),
      node("is-bug", "logic.condition", 4, 0, "Is a bug?", {
        left: "{{input.value}}",
        operator: "equals",
        right: "bug",
      }),
      node("bug", "notify.discord", 5, 0, "Report the bug", {
        webhookUrl: "",
        content: "Bug report: {{vars.message}}",
        username: "Automator triage",
      }),
      node("bug-done", "screen.page", 6, 0, "Bug filed", {
        title: "Thanks, we are on it",
        body: "Your report went straight to the engineers.",
        button: "Done",
      }),
      node("is-question", "logic.condition", 5, 1, "Is a question?", {
        left: "{{input.value}}",
        operator: "equals",
        right: "question",
      }),
      node("question", "notify.discord", 6, 1, "Ask the team", {
        webhookUrl: "",
        content: "Question from a visitor: {{vars.message}}",
        username: "Automator triage",
      }),
      node("question-done", "screen.page", 7, 1, "Answer on the way", {
        title: "Good question",
        body: "Someone from the team will get back to you.",
        button: "Done",
      }),
      node("feedback", "notify.discord", 6, 2, "Share the feedback", {
        webhookUrl: "",
        content: "Feedback: {{vars.message}}",
        username: "Automator triage",
      }),
      node("feedback-done", "screen.page", 7, 2, "Feedback noted", {
        title: "Thanks for the feedback",
        body: "It is in front of the team already.",
        button: "Done",
      }),
    ],
    edges: [
      edge("open", "visitor", "message", "data"),
      edge("message", "submitted", "remember", "value"),
      edge("remember", "value", "classify", "text"),
      edge("classify", "label", "is-bug", "value"),
      edge("is-bug", "true", "bug", "message"),
      edge("bug", "sent", "bug-done", "data"),
      edge("is-bug", "false", "is-question", "value"),
      edge("is-question", "true", "question", "message"),
      edge("question", "sent", "question-done", "data"),
      edge("is-question", "false", "feedback", "message"),
      edge("feedback", "sent", "feedback-done", "data"),
    ],
  }),

  "usdc-balance-alert": () => ({
    nodes: [
      node("start", "trigger.manual", 0, 0, "Run"),
      node("balance", "usdc.balance", 1, 0, "Read USDC balance", { address: "" }),
      node("check", "logic.condition", 2, 0, "Below 10 USDC?", {
        left: "{{input.value.formatted}}",
        operator: "less_than",
        right: "10",
      }),
      node("notify", "notify.discord", 3, 0, "Warn on Discord", {
        webhookUrl: "",
        content: "Low USDC: {{input.message.formatted}}",
        username: "Automator",
      }),
    ],
    edges: [
      edge("start", "run", "balance", "wallet"),
      edge("balance", "balance", "check", "value"),
      edge("check", "true", "notify", "message"),
    ],
  }),

  "usdc-payout": () => ({
    nodes: [
      node("hook", "trigger.webhook", 0, 0, "Payout request"),
      node("pay", "usdc.payout", 1, 0, "Send USDC", {
        to: "{{input.recipient.to}}",
        amount: "{{input.recipient.amount}}",
      }),
      node("notify", "notify.discord", 2, 0, "Confirm on Discord", {
        webhookUrl: "",
        content:
          "Paid {{input.message.amount}} USDC to {{input.message.to}} ({{input.message.hash}})",
        username: "Automator",
      }),
    ],
    edges: [
      edge("hook", "request", "pay", "recipient"),
      edge("pay", "receipt", "notify", "message"),
    ],
  }),

  "uniswap-pool-watch": () => ({
    nodes: [
      node("tick", "trigger.schedule", 0, 0, "Every hour", { every: "1h" }),
      node("pool", "graph.query-subgraph", 1, 0, "Read the pool", {
        // Uniswap v3 on Ethereum mainnet, and its USDC/WETH 0.05% pool.
        subgraph: "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
        query: [
          "query Pool($id: ID!) {",
          "  pool(id: $id) {",
          "    token0Price",
          "    totalValueLockedUSD",
          "  }",
          "}",
        ].join("\n"),
        variables: '{"id": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"}',
      }),
      node("check", "logic.condition", 2, 0, "Above $4,000?", {
        left: "{{input.value.pool.token0Price}}",
        operator: "greater_than",
        right: "4000",
      }),
      node("notify", "notify.discord", 3, 0, "Post the price", {
        webhookUrl: "",
        content:
          "ETH is at ${{input.message.pool.token0Price}} on Uniswap v3 (pool TVL ${{input.message.pool.totalValueLockedUSD}}).",
        username: "Automator",
      }),
    ],
    edges: [
      edge("tick", "tick", "pool", "params"),
      edge("pool", "data", "check", "value"),
      edge("check", "true", "notify", "message"),
    ],
  }),
  "paid-report": () => ({
    nodes: [
      node("open", "trigger.miniapp-open", 0, 0, "Mini-app opened"),
      node("pay", "usdc.payment", 1, 0, "Pay for the report", {
        title: "One market report",
        description: "Pay 1 USDC and we will write it for you right now.",
        amount: "1",
        // Blank collects into the wallet of whoever forks this flow.
        to: "",
      }),
      node("write", "ai.generate-text", 2, 0, "Write the report", {
        prompt:
          "Write a short, friendly two-sentence market report for a reader who just paid {{input.prompt.amount}} USDC for it.",
      }),
      node("done", "screen.page", 3, 0, "Your report", {
        title: "Your report",
        body: "{{input.data.text}}",
        button: "Done",
      }),
      node("no", "screen.page", 2, 1, "No payment, no report", {
        title: "Nothing was charged",
        body: "You can come back and pay whenever you want the report.",
        button: "Close",
      }),
    ],
    edges: [
      edge("open", "visitor", "pay", "amount"),
      edge("pay", "paid", "write", "prompt"),
      edge("pay", "declined", "no", "data"),
      edge("write", "text", "done", "data"),
    ],
  }),

  "selfie-gated-claim": () => ({
    nodes: [
      node("open", "trigger.miniapp-open", 0, 0, "Mini-app opened"),
      node("login", "privy.login", 1, 0, "Sign in", {
        title: "Claim your USDC",
        message: "Sign in so we know which wallet to pay.",
        methods: ["email", "wallet"],
      }),
      node("selfie", "world.selfie-check", 2, 0, "Selfie Check", {
        title: "One claim per person",
        message: "World App takes a quick selfie to confirm a live person is claiming.",
        action: "claim",
        signal: "{{vars.visitor.wallet}}",
      }),
      node("gate", "logic.condition", 3, 0, "Verified?", {
        left: "{{input.value.verified}}",
        operator: "equals",
        right: "true",
      }),
      node("pay", "usdc.payout", 4, 0, "Send USDC", {
        to: "{{vars.visitor.wallet}}",
        amount: "1",
      }),
      node("paid", "screen.confirmation", 5, 0, "Claimed", {
        title: "Claimed",
        message: "1 USDC is on its way to {{vars.visitor.wallet}}.",
        confirm: "Done",
        cancel: "Close",
      }),
      node("denied", "screen.page", 4, 1, "Not this time", {
        title: "Not this time",
        body: "The selfie check did not go through, so nothing was paid. You can try again.",
        button: "Back",
      }),
    ],
    edges: [
      edge("open", "visitor", "login", "visitor"),
      edge("login", "user", "selfie", "visitor"),
      edge("selfie", "verified", "gate", "value"),
      edge("selfie", "rejected", "denied", "data"),
      edge("gate", "true", "pay", "recipient"),
      edge("gate", "false", "denied", "data"),
      edge("pay", "receipt", "paid", "data"),
    ],
  }),
};

export function findFlowExample(slug: string | undefined): FlowExample | undefined {
  return slug ? flowExamples.find((example) => example.id === slug) : undefined;
}

export function exampleToFlowDocument(example: FlowExample, id: string): FlowDocument {
  const fixture = fixtures[example.id]();
  const ids = new Map(fixture.nodes.map((entry) => [entry.id, crypto.randomUUID()]));
  return {
    version: 1,
    id,
    name: example.name,
    description: example.description,
    nodes: fixture.nodes.map((entry) => ({ ...entry, id: ids.get(entry.id)! })),
    edges: fixture.edges.map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
      source: ids.get(entry.source)!,
      target: ids.get(entry.target)!,
    })),
  };
}
