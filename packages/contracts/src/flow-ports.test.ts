import { describe, expect, test } from "bun:test";
import { flowNodePorts } from "./flow-ports";
import { flowNodeTypes } from "./flows";
import { screenNodeTypes, screenPorts } from "./screens";

describe("flow node ports", () => {
  test("cover every node type with unique handle ids", () => {
    for (const type of flowNodeTypes) {
      const { inputs, outputs } = flowNodePorts[type];
      expect(new Set(inputs).size).toBe(inputs.length);
      expect(new Set(outputs).size).toBe(outputs.length);
    }
  });

  test("triggers have no inputs and every other type has at least one", () => {
    for (const type of flowNodeTypes) {
      const isTrigger = type.startsWith("trigger.") || type === "world.verification-completed";
      expect(flowNodePorts[type].inputs.length === 0).toBe(isTrigger);
    }
  });
});

describe("screen node ports", () => {
  test("agree with the ports a session answers on", () => {
    for (const type of screenNodeTypes) {
      const ports = screenPorts(type);
      expect([type, flowNodePorts[type].outputs]).toEqual([
        type,
        ports.secondary ? [ports.primary, ports.secondary] : [ports.primary],
      ]);
    }
  });

  test("the payment screen takes an amount and answers paid or declined", () => {
    expect(flowNodePorts["usdc.payment"]).toEqual({
      inputs: ["amount"],
      outputs: ["paid", "declined"],
    });
  });
});

describe("data node ports", () => {
  test("name the handles the data executors and the catalog share", () => {
    expect(flowNodePorts["data.create-record"]).toEqual({
      inputs: ["values"],
      outputs: ["record"],
    });
    expect(flowNodePorts["data.find-records"]).toEqual({
      inputs: ["query"],
      outputs: ["found", "empty"],
    });
    expect(flowNodePorts["data.update-record"]).toEqual({
      inputs: ["record"],
      outputs: ["record"],
    });
    expect(flowNodePorts["data.delete-record"]).toEqual({
      inputs: ["record"],
      outputs: ["record"],
    });
  });
});
