import { describe, expect, test } from "bun:test";
import {
  describeFlowApiProblems,
  flowApiSchema,
  isApiFlow,
  readFlowApiInputs,
  validateFlowApiInput,
  type FlowApiInput,
} from "./api-publishing";
import type { FlowNode } from "./flows";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

const amount: FlowApiInput = {
  name: "amount",
  type: "number",
  description: "How much to quote",
  required: true,
};

describe("flowApiSchema", () => {
  test("reads the declared inputs, the description and the returned names", () => {
    expect(
      flowApiSchema({
        name: "Price quote",
        nodes: [
          node("call", "trigger.api", {
            description: "Quote a swap",
            inputs: [amount],
          }),
          node("out", "logic.return", {
            outputs: [
              { name: "price", value: "{{input.price}}" },
              { name: "at", value: "{{input.at}}" },
            ],
          }),
        ],
      }),
    ).toEqual({
      name: "Price quote",
      description: "Quote a swap",
      inputs: [amount],
      outputs: ["price", "at"],
    });
  });

  test("is null for a flow with no API trigger", () => {
    expect(flowApiSchema({ name: "Nightly", nodes: [node("t", "trigger.schedule")] })).toBeNull();
  });

  test("falls back to the flow name when the trigger has no description", () => {
    expect(flowApiSchema({ name: "Quote", nodes: [node("call", "trigger.api")] })).toEqual({
      name: "Quote",
      description: "",
      inputs: [],
      outputs: [],
    });
  });

  test("keeps each returned name once, in document order", () => {
    const schema = flowApiSchema({
      name: "Two returns",
      nodes: [
        node("call", "trigger.api"),
        node("a", "logic.return", { outputs: [{ name: "price", value: "1" }] }),
        node("b", "logic.return", {
          outputs: [
            { name: "price", value: "2" },
            { name: "fee", value: "3" },
          ],
        }),
      ],
    });
    expect(schema?.outputs).toEqual(["price", "fee"]);
  });

  test("ignores an input with no name and a return row with no name", () => {
    const schema = flowApiSchema({
      name: "Sloppy",
      nodes: [
        node("call", "trigger.api", {
          inputs: [{ name: "", type: "text", description: "", required: false }, amount],
        }),
        node("out", "logic.return", {
          outputs: [
            { name: "", value: "x" },
            { name: "ok", value: "y" },
          ],
        }),
      ],
    });
    expect(schema).toEqual({
      name: "Sloppy",
      description: "",
      inputs: [amount],
      outputs: ["ok"],
    });
  });

  test("survives a trigger whose settings the engine cannot read", () => {
    expect(readFlowApiInputs([node("call", "trigger.api", { inputs: "not a list" })])).toEqual([]);
  });
});

describe("isApiFlow", () => {
  test("is true only when the document has an API trigger", () => {
    expect(isApiFlow({ nodes: [node("call", "trigger.api")] })).toBe(true);
    expect(isApiFlow({ nodes: [node("hook", "trigger.webhook")] })).toBe(false);
  });
});

describe("validateFlowApiInput", () => {
  const inputs: FlowApiInput[] = [
    amount,
    { name: "to", type: "address", description: "", required: true },
    { name: "note", type: "text", description: "", required: false },
    { name: "dry", type: "boolean", description: "", required: false },
  ];
  const wallet = "0x1111111111111111111111111111111111111111";

  test("accepts a body that declares every required input", () => {
    expect(validateFlowApiInput(inputs, { amount: 2, to: wallet })).toEqual({
      values: { amount: 2, to: wallet },
    });
  });

  test("coerces a numeric string, a boolean string and a number to their declared types", () => {
    expect(
      validateFlowApiInput(inputs, { amount: "2.5", to: wallet, note: "hi", dry: "true" }),
    ).toEqual({ values: { amount: 2.5, to: wallet, note: "hi", dry: true } });
  });

  test("reports a missing required input by name", () => {
    expect(validateFlowApiInput(inputs, { amount: 1 })).toEqual({
      problems: [{ input: "to", message: "to is required." }],
    });
  });

  test("reports a value that is not the declared type", () => {
    expect(validateFlowApiInput(inputs, { amount: "soon", to: "not-an-address" })).toEqual({
      problems: [
        { input: "amount", message: "amount must be a number." },
        { input: "to", message: "to must be a 0x address." },
      ],
    });
  });

  test("refuses an input the flow never declared", () => {
    expect(validateFlowApiInput(inputs, { amount: 1, to: wallet, extra: 1 })).toEqual({
      problems: [{ input: "extra", message: "extra is not an input of this flow." }],
    });
  });

  test("refuses a body that is not a JSON object", () => {
    expect(validateFlowApiInput(inputs, [1, 2])).toEqual({
      problems: [{ input: "", message: "The request body must be a JSON object." }],
    });
  });

  test("treats a missing body as an empty one", () => {
    expect(validateFlowApiInput([], undefined)).toEqual({ values: {} });
  });

  test("leaves an omitted optional input out rather than filling it in", () => {
    const result = validateFlowApiInput(inputs, { amount: 1, to: wallet });
    expect(result).toEqual({ values: { amount: 1, to: wallet } });
  });

  test("rejects a number that is not finite", () => {
    expect(validateFlowApiInput([amount], { amount: Number.POSITIVE_INFINITY })).toEqual({
      problems: [{ input: "amount", message: "amount must be a number." }],
    });
  });
});

describe("describeFlowApiProblems", () => {
  test("joins the problems into one sentence a caller can act on", () => {
    expect(
      describeFlowApiProblems([
        { input: "amount", message: "amount must be a number." },
        { input: "to", message: "to is required." },
      ]),
    ).toBe("amount must be a number. to is required.");
  });

  test("says the input was refused when it carries no problems", () => {
    expect(describeFlowApiProblems([])).toBe("The input did not match what this flow declares.");
  });
});
