import { sampleFlowApiInput, type FlowApiInput } from "@automator/contracts";
import { publicApiUrl } from "../lib/api-url";

/*
 * What a caller has to type to reach a published flow. Built from the same declaration the
 * endpoint validates against, so the example in the dialog cannot describe a call the API
 * would refuse. The key is a placeholder: a real one is never printed anywhere but once.
 */

/** The environment variable the example reads, rather than a key pasted into a shell history. */
export const apiKeyPlaceholder = "$AUTOMATOR_API_KEY";

export function apiInvokeUrl(flowId: string, apiUrl: string = publicApiUrl): string {
  return `${apiUrl.replace(/\/+$/, "")}/v1/flows/${encodeURIComponent(flowId)}/invoke`;
}

export function apiCurlSnippet(url: string, inputs: readonly FlowApiInput[]): string {
  const body = JSON.stringify(sampleFlowApiInput(inputs), null, 2);
  return [
    `curl -X POST ${url} \\`,
    `  -H "Authorization: Bearer ${apiKeyPlaceholder}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${body}'`,
  ].join("\n");
}
