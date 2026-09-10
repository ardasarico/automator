/*
 * A pass-through in front of the e2e API that can be told to fail one route, so a test can see
 * what the browser does when the API is briefly gone — which is what our own deploys look like
 * from the web server. Everything else is forwarded untouched, so the suite behaves as if it
 * were talking to the API directly.
 *
 * Started only when the Playwright config is run with E2E_API_PROXY=1; without it the web server
 * points straight at the API and nothing here runs.
 */

const target = process.env.E2E_PROXY_TARGET ?? "http://localhost:3101";
const port = Number(process.env.E2E_PROXY_PORT ?? 3102);

/** Method and path prefix to answer with 503 until cleared, as `POST /flows`. */
let fault: string | null = null;

function matches(request: Request): boolean {
  if (fault === null) return false;
  const [method, prefix] = fault.split(" ");
  return request.method === method && new URL(request.url).pathname.startsWith(prefix ?? "");
}

Bun.serve({
  port,
  idleTimeout: 30,
  async fetch(request) {
    const url = new URL(request.url);

    // The test's own control surface, never forwarded.
    if (url.pathname === "/__fault") {
      if (request.method === "POST") fault = await request.text();
      if (request.method === "DELETE") fault = null;
      return new Response(JSON.stringify({ fault }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (matches(request)) {
      return new Response(JSON.stringify({ error: "unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const forwarded = new URL(url.pathname + url.search, target);
    return fetch(forwarded, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      // Bun requires this when a body is streamed rather than buffered.
      ...(request.body ? { duplex: "half" } : {}),
    } as RequestInit);
  },
});

console.log(`e2e API proxy on ${port} → ${target}`);
