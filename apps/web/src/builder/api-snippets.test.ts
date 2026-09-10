import type { FlowApiInput } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { apiCurlSnippet, apiInvokeUrl } from "./api-snippets";

const origin = "https://api.example.com";

describe("apiInvokeUrl", () => {
  test("points at the flow's own endpoint on the API host", () => {
    expect(apiInvokeUrl("flow-1", origin)).toBe("https://api.example.com/v1/flows/flow-1/invoke");
  });

  test("drops a trailing slash rather than doubling it", () => {
    expect(apiInvokeUrl("flow-1", "https://api.example.com/")).toBe(
      "https://api.example.com/v1/flows/flow-1/invoke",
    );
  });

  test("escapes a flow id that would otherwise change the path", () => {
    expect(apiInvokeUrl("a/b", origin)).toContain("/flows/a%2Fb/invoke");
  });
});

describe("apiCurlSnippet", () => {
  const inputs: FlowApiInput[] = [
    { name: "amount", type: "number", description: "", required: true },
    { name: "to", type: "address", description: "", required: false },
  ];

  test("sends a body built from the declared inputs", () => {
    const snippet = apiCurlSnippet(apiInvokeUrl("flow-1", origin), inputs);
    expect(snippet).toContain("curl -X POST https://api.example.com/v1/flows/flow-1/invoke");
    expect(snippet).toContain("Authorization: Bearer $AUTOMATOR_API_KEY");
    expect(snippet).toContain('"amount": 1');
    expect(snippet).toContain('"to": "0x0000000000000000000000000000000000000000"');
  });

  test("still sends a JSON object when the flow declares no inputs", () => {
    expect(apiCurlSnippet(apiInvokeUrl("flow-1", origin), [])).toContain("-d '{}'");
  });

  test("never puts a real key in the example", () => {
    expect(apiCurlSnippet(apiInvokeUrl("flow-1", origin), inputs)).not.toContain("ak_");
  });
});
