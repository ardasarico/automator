import type { ToolDefinition } from "@automator/flow-engine";

const edgeParameters = {
  type: "object",
  properties: {
    source: { type: "string", description: "Source node id" },
    sourceHandle: { type: "string", description: "An output handle of the source node" },
    target: { type: "string", description: "Target node id" },
    targetHandle: { type: "string", description: "An input handle of the target node" },
  },
  required: ["source", "sourceHandle", "target", "targetHandle"],
} as const;

/** The tools that change the working copy, so a successful call carries a canvas preview. */
export const mutatingTools = new Set([
  "add_node",
  "update_node",
  "remove_node",
  "connect",
  "disconnect",
  "set_flow",
]);

/** The tools that speak to the user rather than the flow: each produces its own part instead. */
export const conversationTools = new Set(["ask_user", "suggest_next"]);

export const canvasTools: ToolDefinition[] = [
  {
    name: "add_node",
    description:
      "Add a node to the flow. Returns an error if the type, id or config is not usable.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Short unique id such as n1" },
        type: { type: "string", description: "One of the listed node types" },
        label: { type: "string", description: "Short human label" },
        config: {
          type: "object",
          description: "Config fields listed for the type; leave secrets empty",
        },
      },
      required: ["id", "type", "label"],
    },
  },
  {
    name: "update_node",
    description: "Change a node's label or merge fields into its config.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        config: { type: "object" },
      },
      required: ["id"],
    },
  },
  {
    name: "remove_node",
    description: "Remove a node and every edge touching it.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "connect",
    description: "Connect an output handle to an input handle. Each input takes one edge.",
    parameters: edgeParameters,
  },
  { name: "disconnect", description: "Remove an edge.", parameters: edgeParameters },
  {
    name: "set_flow",
    description: "Set the flow's name, description or chain id.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        chainId: {
          type: "number",
          description: "84532 (Base Sepolia) or 4801 (World Chain Sepolia)",
        },
      },
    },
  },
  {
    name: "add_test",
    description:
      "Add a behavioral test scenario the automatic checks run against the flow: concrete visitor answers or a trigger payload and expected results. Required for mini-apps with a form.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        triggerNodeId: { type: "string" },
        payload: {},
        answers: {
          type: "object",
          description: "Screen node id → { port, data } with the visitor's answers",
        },
        expect: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string" },
              output: { type: "string" },
              path: { type: "string" },
              equals: {},
              greaterThan: { type: "number" },
              lessThan: { type: "number" },
              contains: { type: "string" },
              screenBody: { type: "string" },
            },
            required: ["nodeId"],
          },
        },
      },
      required: ["name", "expect"],
    },
  },
  {
    name: "ask_user",
    description:
      "Ask the user one short question with up to four options when the request cannot be built without it. Ends your turn; do not change the flow in the same turn.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" }, maxItems: 4 },
      },
      required: ["question", "options"],
    },
  },
  {
    name: "suggest_next",
    description:
      "Offer up to three short follow-up requests the user might make next. Call it once, at the end of a turn that changed the flow.",
    parameters: {
      type: "object",
      properties: { items: { type: "array", items: { type: "string" }, maxItems: 3 } },
      required: ["items"],
    },
  },
];
