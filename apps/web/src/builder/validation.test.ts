import {
  flowNodeCategory,
  flowNodeTypes,
  type FlowConfigTable,
  type FlowNode,
} from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { getCatalogEntry } from "./catalog";
import { countErrors, findFlowProblems } from "./validation";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

const tables: FlowConfigTable[] = [
  { id: "tbl", name: "Applicants", columns: [{ id: "name" }, { id: "email" }] },
];

/**
 * The problems one node reports, with the rest of the flow made healthy around it: a trigger
 * stands on its own, anything else hangs off a manual trigger so nothing is unreachable.
 */
function problemsOf(type: FlowNode["type"], config: Record<string, unknown> = {}) {
  const subject = node("n", type, config);
  const document =
    getCatalogEntry(type).category === "trigger"
      ? { nodes: [subject], edges: [] }
      : {
          nodes: [node("start", "trigger.manual"), subject],
          edges: [{ id: "e", source: "start", target: "n" }],
        };
  return findFlowProblems(document, tables).filter((problem) => problem.nodeId === "n");
}

function messagesOf(type: FlowNode["type"], config: Record<string, unknown> = {}) {
  return problemsOf(type, config).map((problem) => `${problem.severity}: ${problem.message}`);
}

describe("findFlowProblems", () => {
  test("an empty flow and a flow without a trigger are errors", () => {
    expect(findFlowProblems({ nodes: [], edges: [] })).toEqual([
      { severity: "error", message: "The flow is empty. Add a trigger to start from." },
    ]);
    expect(findFlowProblems({ nodes: [node("page", "screen.page")], edges: [] })).toMatchObject([
      { severity: "error", message: "The flow has no trigger to start from." },
    ]);
  });

  test("a consistent flow has no problems", () => {
    const problems = findFlowProblems({
      nodes: [node("open", "trigger.manual"), node("page", "screen.page", { title: "Hi" })],
      edges: [
        { id: "e", source: "open", target: "page", sourceHandle: "run", targetHandle: "data" },
      ],
    });
    expect(problems).toEqual([]);
  });

  test("a trigger sample payload that is not JSON is a warning", () => {
    const problems = findFlowProblems({
      nodes: [node("hook", "trigger.webhook", { samplePayload: "{oops" })],
      edges: [],
    });
    expect(problems).toEqual([
      {
        severity: "warning",
        nodeId: "hook",
        message:
          "“hook” has a sample payload that is not valid JSON, so Simulate sends an empty one.",
      },
    ]);
    expect(
      findFlowProblems({
        nodes: [node("hook", "trigger.webhook", { samplePayload: '{"body":{}}' })],
        edges: [],
      }),
    ).toEqual([]);
  });

  test("nodes no trigger reaches are warned about", () => {
    const problems = findFlowProblems({
      nodes: [
        node("open", "trigger.manual"),
        node("page", "screen.page"),
        node("lonely", "logic.wait"),
      ],
      edges: [{ id: "e", source: "open", target: "page" }],
    });
    expect(problems).toEqual([
      {
        severity: "warning",
        nodeId: "lonely",
        message: "“lonely” is not connected to a trigger, so it never runs.",
      },
    ]);
  });

  test("required config is an error and a blank secret a warning that says set your own", () => {
    const problems = findFlowProblems({
      nodes: [
        node("open", "trigger.manual"),
        node("set", "logic.set-variable", { name: " " }),
        node("post", "notify.discord", { webhookUrl: "", content: "hi" }),
      ],
      edges: [
        { id: "e1", source: "open", target: "set" },
        { id: "e2", source: "set", target: "post" },
      ],
    });
    expect(problems).toEqual([
      { severity: "error", nodeId: "set", message: "“set” needs a variable name." },
      {
        severity: "warning",
        nodeId: "post",
        message: "“post” needs a Discord webhook URL: set your own.",
      },
    ]);
    expect(countErrors(problems)).toBe(1);
  });

  test("a World ID check needs an action and warns about an unwired Rejected port", () => {
    const problems = findFlowProblems({
      nodes: [
        node("open", "trigger.miniapp-open"),
        node("verify", "world.id-verify"),
        node("ok", "screen.page"),
      ],
      edges: [
        { id: "e1", source: "open", target: "verify", sourceHandle: "visitor" },
        { id: "e2", source: "verify", target: "ok", sourceHandle: "verified" },
      ],
    });
    expect(problems).toEqual([
      { severity: "error", nodeId: "verify", message: "“verify” needs a World action id." },
      {
        severity: "warning",
        nodeId: "verify",
        message: "“verify” has nothing on Rejected, so a failed verification ends the flow.",
      },
    ]);
    const wired = findFlowProblems({
      nodes: [
        node("open", "trigger.miniapp-open"),
        node("verify", "world.id-verify", { action: "claim" }),
        node("ok", "screen.page"),
        node("no", "screen.page"),
      ],
      edges: [
        { id: "e1", source: "open", target: "verify", sourceHandle: "visitor" },
        { id: "e2", source: "verify", target: "ok", sourceHandle: "verified" },
        { id: "e3", source: "verify", target: "no", sourceHandle: "rejected" },
      ],
    });
    expect(wired).toEqual([]);
  });

  test("unreadable settings and empty forms are reported", () => {
    const problems = findFlowProblems({
      nodes: [
        node("open", "trigger.manual"),
        node("wait", "logic.wait", { seconds: "soon" }),
        node("form", "screen.form"),
      ],
      edges: [
        { id: "e1", source: "open", target: "wait" },
        { id: "e2", source: "wait", target: "form" },
      ],
    });
    expect(problems.map((problem) => [problem.severity, problem.nodeId])).toEqual([
      ["error", "wait"],
      ["warning", "form"],
    ]);
  });

  test("structural problems short-circuit everything else", () => {
    const problems = findFlowProblems({
      nodes: [node("a", "trigger.manual"), node("a", "screen.page")],
      edges: [],
    });
    expect(problems).toEqual([{ severity: "error", message: 'Duplicate node id "a"' }]);
  });
});

/*
 * One row per node type in `flowNodeTypes`, so a new type has to state what it needs — or state
 * that it needs nothing — before this suite passes again. Each config blanks every field the
 * schema fills with a default, which is the state a half-configured node is really in.
 */
const blankedConfigs: Record<FlowNode["type"], [Record<string, unknown>, string[]]> = {
  "trigger.schedule": [
    { every: "" },
    [
      "error: “n” has no interval, so it never fires. Use a whole number and a unit: 30s, 15m, 1h or 7d.",
    ],
  ],
  "trigger.onchain-event": [
    { address: "", event: "", args: "" },
    ["error: “n” needs a contract address.", "error: “n” needs an event signature."],
  ],
  "trigger.price": [
    { pair: "custom", feed: "", threshold: "" },
    ["error: “n” needs a feed address.", "error: “n” needs a price threshold."],
  ],
  "trigger.balance": [
    { address: "", token: "", threshold: "" },
    ["error: “n” needs a watched address.", "error: “n” needs a balance threshold."],
  ],
  "trigger.webhook": [{}, []],
  "trigger.miniapp-open": [{}, []],
  "trigger.manual": [{}, []],
  "logic.condition": [{ left: "", right: "" }, []],
  "logic.switch": [{ value: "", cases: [] }, []],
  "logic.wait": [{}, []],
  "logic.for-each": [{ items: "" }, ["error: “n” needs a list of items."]],
  "logic.merge": [{}, []],
  "logic.filter": [{ items: "", field: "", value: "" }, ["error: “n” needs a list of items."]],
  "logic.set-variable": [{ name: "", value: "" }, ["error: “n” needs a variable name."]],
  "logic.run-code": [{ code: "" }, ["error: “n” needs a snippet of code to run."]],
  "onchain.read-contract": [
    { address: "", abi: "", functionName: "", args: "" },
    [
      "error: “n” needs a contract address.",
      "error: “n” needs a contract ABI.",
      "error: “n” needs a function name.",
    ],
  ],
  "onchain.write-contract": [
    { address: "", abi: "", functionName: "", args: "", value: "" },
    [
      "error: “n” needs a contract address.",
      "error: “n” needs a contract ABI.",
      "error: “n” needs a function name.",
    ],
  ],
  "onchain.transfer-token": [
    { to: "", amount: "", token: "" },
    ["error: “n” needs a recipient address.", "error: “n” needs an amount."],
  ],
  "onchain.sign-message": [{ message: "" }, ["error: “n” needs a message to sign."]],
  "ai.agent": [
    { instructions: "", task: "", tools: [], allowedHosts: [], discordWebhookUrl: "" },
    ["error: “n” needs a task."],
  ],
  "ai.classify": [
    { text: "", labels: [], instructions: "" },
    ["error: “n” needs a label to choose between."],
  ],
  "ai.extract": [{ text: "", schema: "", instructions: "" }, ["error: “n” needs a result shape."]],
  "ai.generate-text": [{ prompt: "", instructions: "" }, ["error: “n” needs a prompt."]],
  "screen.page": [{ title: "", body: "", button: "" }, []],
  "screen.form": [{ fields: [] }, ["warning: “n” has no fields yet."]],
  "screen.confirmation": [{ title: "", message: "" }, []],
  "screen.qr-code": [{ title: "", value: "", caption: "" }, []],
  "notify.telegram": [
    { botToken: "", chatId: "", text: "" },
    [
      "warning: “n” needs a Telegram bot token: set your own.",
      "error: “n” needs a chat id.",
      "error: “n” needs a message text.",
    ],
  ],
  "notify.email": [
    { apiKey: "", from: "", to: "", subject: "", text: "" },
    [
      "warning: “n” needs a Resend API key: set your own.",
      "error: “n” needs a sender address.",
      "error: “n” needs a recipient address.",
      "error: “n” needs a subject line.",
      "error: “n” needs a message body.",
    ],
  ],
  "notify.discord": [
    { webhookUrl: "", content: "", username: "" },
    [
      "warning: “n” needs a Discord webhook URL: set your own.",
      "error: “n” needs a message content.",
    ],
  ],
  "world.id-verify": [
    { action: "" },
    [
      "error: “n” needs a World action id.",
      "warning: “n” has nothing on Rejected, so a failed verification ends the flow.",
    ],
  ],
  "world.selfie-check": [
    { action: "" },
    [
      "error: “n” needs a World action id.",
      "warning: “n” has nothing on Rejected, so a failed verification ends the flow.",
    ],
  ],
  "world.verification-completed": [{}, []],
  "privy.wallet": [{}, []],
  "privy.login": [{ title: "", message: "", button: "" }, []],
  "privy.sign-transaction": [
    { to: "", value: "", data: "" },
    ["error: “n” needs a recipient address."],
  ],
  /* A blank recipient collects into the owner's own wallet, so only the amount is required. */
  "usdc.payment": [
    { to: "", amount: "" },
    [
      "error: “n” needs an amount.",
      "warning: “n” has nothing on Declined, so a visitor who does not pay ends the flow.",
    ],
  ],
  "usdc.payout": [
    { to: "", amount: "" },
    ["error: “n” needs a recipient address.", "error: “n” needs an amount."],
  ],
  "usdc.balance": [{ address: "" }, []],
  "graph.query-subgraph": [
    { subgraph: "", query: "", variables: "" },
    ["error: “n” needs a subgraph.", "error: “n” needs a GraphQL query."],
  ],
  "data.create-record": [{ tableId: "tbl", values: [] }, []],
  "data.find-records": [{ tableId: "tbl", filters: [], sortColumn: "" }, []],
  "data.update-record": [
    { tableId: "tbl", target: "record", recordId: "", values: [], filters: [] },
    ["error: “n” needs a record id."],
  ],
  "data.delete-record": [
    { tableId: "tbl", target: "record", recordId: "", filters: [] },
    ["error: “n” needs a record id."],
  ],
};

describe("required config per node type", () => {
  test("every node type states what a half-configured one reports", () => {
    expect(Object.keys(blankedConfigs).sort()).toEqual([...flowNodeTypes].sort());
  });

  test.each([...flowNodeTypes])("%s", (type: FlowNode["type"]) => {
    const [config, expected] = blankedConfigs[type];
    expect(messagesOf(type, config)).toEqual(expected);
  });

  test("a node that is fully configured reports nothing", () => {
    expect(
      messagesOf("usdc.payout", {
        to: "0x1111111111111111111111111111111111111111",
        amount: "12.50",
      }),
    ).toEqual([]);
    expect(
      messagesOf("notify.email", {
        apiKey: "re_key",
        from: "bot@example.com",
        to: "ada@example.com",
        subject: "Hello",
        text: "Hi",
      }),
    ).toEqual([]);
  });
});

describe("fields that legitimately default", () => {
  test("a blank usdc.balance address reads the run's own wallet", () => {
    expect(messagesOf("usdc.balance", { address: "" })).toEqual([]);
  });

  test("AI instructions are optional everywhere they appear", () => {
    expect(messagesOf("ai.generate-text", { prompt: "Write", instructions: "" })).toEqual([]);
    expect(messagesOf("ai.classify", { labels: ["bug"], instructions: "" })).toEqual([]);
    expect(messagesOf("ai.extract", { schema: '{"type":"object"}', instructions: "" })).toEqual([]);
  });

  test("a blank Discord username, token address, call data and argument list stay silent", () => {
    expect(
      messagesOf("notify.discord", { webhookUrl: "https://x", content: "hi", username: "" }),
    ).toEqual([]);
    expect(
      messagesOf("onchain.transfer-token", {
        to: "0x1111111111111111111111111111111111111111",
        amount: "1",
        token: "",
      }),
    ).toEqual([]);
    expect(
      messagesOf("privy.sign-transaction", {
        to: "0x1111111111111111111111111111111111111111",
        value: "",
        data: "",
      }),
    ).toEqual([]);
    expect(
      messagesOf("onchain.read-contract", {
        address: "0x1111111111111111111111111111111111111111",
        abi: "[]",
        functionName: "name",
        args: "",
      }),
    ).toEqual([]);
    expect(
      messagesOf("trigger.balance", {
        address: "0x1111111111111111111111111111111111111111",
        token: "",
        threshold: "1",
      }),
    ).toEqual([]);
  });

  test("a price feed address only matters for the custom pair", () => {
    expect(messagesOf("trigger.price", { pair: "ETH / USD", feed: "", threshold: "4000" })).toEqual(
      [],
    );
  });

  test("agent tools decide which of its settings are needed", () => {
    expect(messagesOf("ai.agent", { task: "Do it", tools: [], allowedHosts: [] })).toEqual([]);
    expect(
      messagesOf("ai.agent", { task: "Do it", tools: ["http_get"], allowedHosts: [] }),
    ).toEqual(["error: “n” needs an allowed host for its HTTP tool."]);
    expect(
      messagesOf("ai.agent", {
        task: "Do it",
        tools: ["discord_message"],
        discordWebhookUrl: "",
      }),
    ).toEqual(["warning: “n” needs a Discord webhook URL: set your own."]);
    expect(
      messagesOf("ai.agent", {
        task: "Do it",
        tools: ["http_get", "discord_message"],
        allowedHosts: ["api.example.com"],
        discordWebhookUrl: "https://discord.example",
      }),
    ).toEqual([]);
  });

  test("a record id is only needed by the target that uses one", () => {
    expect(
      messagesOf("data.update-record", {
        tableId: "tbl",
        target: "filter",
        recordId: "",
        filters: [{ column: "email", operator: "equals", value: "a@b.c" }],
        values: [{ column: "name", value: "Ada" }],
      }),
    ).toEqual([]);
  });
});

describe("template values", () => {
  test.each([
    ["usdc.payout", { to: "{{vars.recipient}}", amount: "{{vars.amount}}" }],
    ["usdc.payment", { to: "{{vars.wallet}}", amount: "{{vars.amount}}" }],
    ["trigger.balance", { address: "{{trigger.address}}", threshold: "{{vars.floor}}" }],
    [
      "onchain.read-contract",
      {
        address: "{{vars.contract}}",
        abi: "{{vars.abi}}",
        functionName: "{{vars.fn}}",
        args: "{{vars.args}}",
      },
    ],
    [
      "notify.email",
      {
        apiKey: "{{secrets.resend}}",
        from: "{{vars.from}}",
        to: "{{vars.to}}",
        subject: "{{vars.subject}}",
        text: "{{vars.body}}",
      },
    ],
    ["ai.extract", { schema: "{{vars.shape}}" }],
    ["logic.run-code", { code: "{{vars.code}}" }],
  ] as const)("%s accepts templates in place of literal values", (type, config) => {
    expect(problemsOf(type, config).filter((problem) => problem.severity === "error")).toEqual([]);
  });

  test("a schedule interval is read as typed, so a template there never fires", () => {
    expect(messagesOf("trigger.schedule", { every: "{{vars.every}}" })).toEqual([
      'error: “n” has an interval the scheduler cannot read ("{{vars.every}}"), so it never fires. Use a whole number and a unit: 30s, 15m, 1h or 7d.',
    ]);
  });
});

describe("values the executor could not parse", () => {
  test.each([
    [
      "usdc.payout",
      { to: "vitalik.eth", amount: "1" },
      "error: “n” needs its recipient address to be a 0x address.",
    ],
    [
      "usdc.payout",
      { to: "0x1111111111111111111111111111111111111111", amount: "$12" },
      "error: “n” needs its amount to be a decimal amount, such as 1.5.",
    ],
    [
      "trigger.balance",
      { address: "0x1111111111111111111111111111111111111111", threshold: "lots" },
      "error: “n” needs its balance threshold to be a number.",
    ],
    [
      "trigger.balance",
      {
        address: "0x1111111111111111111111111111111111111111",
        token: "USDC",
        threshold: "1",
      },
      "error: “n” needs its token address to be a 0x address.",
    ],
    [
      "onchain.read-contract",
      {
        address: "0x1111111111111111111111111111111111111111",
        abi: "[]",
        functionName: "name",
        args: "{}",
      },
      "error: “n” needs its argument list to be a JSON array.",
    ],
    ["ai.extract", { schema: "{oops" }, "error: “n” needs its result shape to be valid JSON."],
    [
      "trigger.onchain-event",
      { address: "0x1111111111111111111111111111111111111111", event: "Transfer()", args: "[]" },
      "error: “n” needs its argument filter to be a JSON object.",
    ],
    [
      "privy.sign-transaction",
      { to: "0x1111111111111111111111111111111111111111", data: "not-hex" },
      "error: “n” needs its call data to be 0x hex.",
    ],
  ] as const)("%s reports a value the run would reject", (type, config, message) => {
    expect(messagesOf(type, config)).toContain(message);
  });

  test("a decimal threshold, a checksummed address and a plain amount pass", () => {
    expect(
      messagesOf("trigger.price", {
        pair: "custom",
        feed: "0xAbC1111111111111111111111111111111111111",
        threshold: "-0.5",
      }),
    ).toEqual([]);
    expect(
      messagesOf("usdc.payout", {
        to: "0xAbC1111111111111111111111111111111111111",
        amount: "12.50",
      }),
    ).toEqual([]);
  });
});

describe("data node rows", () => {
  test("a value or filter row with no column is an error", () => {
    expect(
      messagesOf("data.create-record", {
        tableId: "tbl",
        values: [
          { column: "name", value: "Ada" },
          { column: "", value: "x" },
        ],
      }),
    ).toEqual(["error: “n” has a value row 2 with no column."]);
    expect(
      messagesOf("data.find-records", {
        tableId: "tbl",
        filters: [{ column: "", operator: "equals", value: "x" }],
      }),
    ).toEqual(["error: “n” has a filter row 1 with no column."]);
  });

  test("filters a record target never reads are left alone", () => {
    expect(
      messagesOf("data.delete-record", {
        tableId: "tbl",
        target: "record",
        recordId: "rec-1",
        filters: [{ column: "", operator: "equals", value: "x" }],
      }),
    ).toEqual([]);
  });
});

describe("schedule intervals", () => {
  test.each(["1h", "30m", "7d", "45s", " 2 H "])("%p can fire, so it is silent", (every) => {
    expect(messagesOf("trigger.schedule", { every })).toEqual([]);
  });

  test.each([
    ["every Monday", 'has an interval the scheduler cannot read ("every Monday")'],
    ["abc", 'has an interval the scheduler cannot read ("abc")'],
    ["0h", "has an interval of zero"],
    ["30", 'has an interval with no unit ("30")'],
    ["", "has no interval"],
  ])("%p is an error that names the accepted forms", (every, fragment) => {
    const problems = problemsOf("trigger.schedule", { every });
    expect(problems).toHaveLength(1);
    expect(problems[0]!.severity).toBe("error");
    expect(problems[0]!.message).toContain(fragment);
    expect(problems[0]!.message).toContain("30s, 15m, 1h or 7d");
  });

  test("an unfireable interval counts as an error the builder can block on", () => {
    expect(countErrors(problemsOf("trigger.schedule", { every: "every Monday" }))).toBe(1);
  });
});

describe("the builder and the API agree on what a node is", () => {
  test("every catalog category matches the one contracts checks against", () => {
    // The canvas decides which nodes can start a flow from its catalog; the API decides the same
    // thing from `flowNodeCategory`. If these drift, a flow the builder calls startable would be
    // refused activation, or worse, the other way round.
    for (const type of flowNodeTypes)
      expect([type, flowNodeCategory[type]]).toEqual([type, getCatalogEntry(type).category]);
  });
});
