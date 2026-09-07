import { describe, expect, test } from "bun:test";
import { flowNodeTypes } from "./flows";
import {
  flowNodeConfigSchemas,
  parseSamplePayload,
  samplePayloadProblem,
} from "./flow-node-configs";
import { parseNodeConfig } from "./node-config";

describe("flow node config schemas", () => {
  test("only name known node types", () => {
    for (const type of Object.keys(flowNodeConfigSchemas))
      expect(flowNodeTypes as readonly string[]).toContain(type);
  });

  test("every schema accepts an empty config", () => {
    for (const schema of Object.values(flowNodeConfigSchemas))
      expect(() => parseNodeConfig(schema, {})).not.toThrow();
  });

  test("condition defaults to comparing the input value", () => {
    expect(parseNodeConfig(flowNodeConfigSchemas["logic.condition"], {})).toEqual({
      left: "{{input.value}}",
      operator: "equals",
      right: "",
    });
  });

  test("wait rejects a duration above the cap", () => {
    expect(() => parseNodeConfig(flowNodeConfigSchemas["logic.wait"], { seconds: 60 })).toThrow();
  });
});

describe("trigger sample payloads", () => {
  test("every simulated trigger type carries a JSON sample payload", () => {
    for (const type of [
      "trigger.manual",
      "trigger.webhook",
      "trigger.schedule",
      "trigger.miniapp-open",
    ] as const) {
      const config = parseNodeConfig(flowNodeConfigSchemas[type], {}) as Record<string, unknown>;
      expect(typeof config.samplePayload).toBe("string");
      expect(() => JSON.parse(config.samplePayload as string)).not.toThrow();
      const property = flowNodeConfigSchemas[type].properties.samplePayload as {
        contentMediaType?: string;
      };
      expect(property.contentMediaType).toBe("application/json");
    }
  });

  test("the webhook sample mirrors the request shape the hook route sends", () => {
    const config = parseNodeConfig(flowNodeConfigSchemas["trigger.webhook"], {});
    expect(Object.keys(JSON.parse(config.samplePayload))).toEqual([
      "method",
      "headers",
      "query",
      "body",
    ]);
  });

  test("parseSamplePayload reads the sample and falls back to an empty object", () => {
    expect(parseSamplePayload({ samplePayload: '{"a":1}' })).toEqual({ a: 1 });
    expect(parseSamplePayload({ samplePayload: "[1, 2]" })).toEqual([1, 2]);
    expect(parseSamplePayload({ samplePayload: "not json" })).toEqual({});
    expect(parseSamplePayload({ samplePayload: "" })).toEqual({});
    expect(parseSamplePayload({})).toEqual({});
    expect(parseSamplePayload(undefined)).toEqual({});
    expect(parseSamplePayload({ samplePayload: 42 })).toEqual({});
  });

  test("samplePayloadProblem names invalid JSON and accepts valid text", () => {
    expect(samplePayloadProblem("{}")).toBeNull();
    expect(samplePayloadProblem("")).toBeNull();
    expect(samplePayloadProblem("{oops")).toBe("Invalid JSON");
  });
});
