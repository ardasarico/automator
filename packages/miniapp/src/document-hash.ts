import { flowDocumentSchema, Value, type FlowDocument } from "@automator/contracts";

/**
 * A flow document carried in a URL fragment, so the runtime can show a flow that is not
 * stored anywhere yet: the builder's preview links to `/a/<id>#<document>`. The fragment
 * never reaches a server. Encoding is base64url over UTF-8 JSON.
 */
export function encodeDocumentHash(document: FlowDocument): string {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return "#" + btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The document in a fragment, or null when there is none or it is not a valid document. */
export function decodeDocumentHash(hash: string): FlowDocument | null {
  const encoded = hash.startsWith("#") ? hash.slice(1) : hash;
  if (encoded === "" || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return Value.Check(flowDocumentSchema, parsed) ? parsed : null;
  } catch {
    return null;
  }
}
