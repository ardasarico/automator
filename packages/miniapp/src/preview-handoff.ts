import { flowDocumentSchema, Value, type FlowDocument } from "@automator/contracts";

const readyType = "automator.preview.ready.v1";
const documentType = "automator.preview.document.v1";
const handoffTimeout = 30_000;
const noncePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function message(data: unknown): Record<string, unknown> | null {
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
}

/** Only an opaque request id enters history. The snapshot stays in the opening tab's memory. */
export function openPreview(
  runtimeUrl: string,
  document: FlowDocument,
  onClose: () => void,
  host: Window = window,
): (() => void) | null {
  document = structuredClone(document);
  const nonce = crypto.randomUUID();
  const url = new URL(`/a/${encodeURIComponent(document.id)}`, runtimeUrl);
  url.searchParams.set("preview", "");
  url.hash = `preview=${nonce}`;
  // This is an explicit trusted-app handoff. An opener is required for reloads; never use
  // the origin or a WindowProxy supplied inside a message as the credential destination.
  const popup = host.open(url.href, "_blank");
  if (!popup) return null;
  let received = false;
  let active = true;
  const close = () => {
    if (!active) return;
    active = false;
    host.removeEventListener("message", receive);
    host.clearTimeout(timeout);
    host.clearInterval(closed);
    onClose();
  };
  const receive = (event: MessageEvent) => {
    if (event.origin !== url.origin || event.source !== popup) return;
    const data = message(event.data);
    if (data?.type !== readyType || data.nonce !== nonce || data.flowId !== document.id) return;
    received = true;
    host.clearTimeout(timeout);
    popup.postMessage({ type: documentType, nonce, document }, url.origin);
  };
  host.addEventListener("message", receive);
  const timeout = host.setTimeout(() => {
    if (!received) close();
  }, handoffTimeout);
  const closed = host.setInterval(() => {
    if (popup.closed) close();
  }, 1_000);
  return close;
}

/** Receive only from the actual opener at the configured builder origin, within 30 seconds. */
export function receivePreview(
  flowId: string,
  builderUrl: string | undefined,
  onDocument: (document: FlowDocument | null) => void,
  host: Window = window,
): () => void {
  const nonce = new URLSearchParams(host.location.hash.slice(1)).get("preview");
  const opener: Window | null = host.opener;
  let origin: string;
  try {
    origin = new URL(builderUrl ?? "").origin;
  } catch {
    onDocument(null);
    return () => {};
  }
  if (!opener || !nonce || !noncePattern.test(nonce) || origin === "null") {
    onDocument(null);
    return () => {};
  }
  let active = true;
  const stop = () => {
    active = false;
    host.removeEventListener("message", receive);
    host.clearTimeout(timeout);
    host.clearInterval(retry);
  };
  const receive = (event: MessageEvent) => {
    if (!active || event.origin !== origin || event.source !== opener) return;
    const data = message(event.data);
    if (data?.type !== documentType || data.nonce !== nonce) return;
    if (!Value.Check(flowDocumentSchema, data.document) || data.document.id !== flowId) return;
    stop();
    onDocument(data.document);
  };
  const request = () => opener.postMessage({ type: readyType, nonce, flowId }, origin);
  host.addEventListener("message", receive);
  const timeout = host.setTimeout(() => {
    stop();
    onDocument(null);
  }, handoffTimeout);
  const retry = host.setInterval(request, 250);
  request();
  return stop;
}
