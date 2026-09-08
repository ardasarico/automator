/// <reference types="bun" />
import type { MarketplaceListing } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const getAccessToken = async () => "privy-token";
mock.module("../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => getAccessToken,
}));

const { createRoot } = await import("react-dom/client");
const { PublishDialog } = await import("./publish-dialog");

const listing: MarketplaceListing = {
  slug: "published-flow",
  name: "Published flow",
  description: "The public description.",
  author: { name: "Arda", username: "arda" },
  nodeTypes: ["logic.wait"],
  forkCount: 2,
  publishedAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const originalFetch = globalThis.fetch;
let answer: (method: string) => Response | Promise<Response>;
let calls: string[];
let closed: number;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls = [];
  closed = 0;
  answer = () => Response.json({ listing: null });
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(method);
    return answer(method);
  }) as typeof fetch;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

afterAll(() => GlobalRegistrator.unregister());

async function mount(description = "The private flow description.") {
  await act(async () => {
    root.render(
      <PublishDialog
        flowId="flow-id"
        flowName="Private flow"
        flowDescription={description}
        unsaved={false}
        onClose={() => closed++}
      />,
    );
  });
}

function button(label: string) {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

function submit() {
  document
    .querySelector<HTMLFormElement>("#publish-listing")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

/** React may have loaded before another test registered Happy DOM, disabling input events. */
function typeDescription(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(
    textarea,
    value,
  );
  const key = Object.keys(textarea).find((name) => name.startsWith("__reactProps"))!;
  const props = (textarea as unknown as Record<string, { onChange(event: unknown): void }>)[key]!;
  props.onChange({ target: textarea, currentTarget: textarea });
}

test("uses the existing listing metadata when updating", async () => {
  answer = () => Response.json({ listing });
  await mount();

  expect(document.querySelector<HTMLInputElement>("#listing-name")?.value).toBe(listing.name);
  expect(document.querySelector<HTMLTextAreaElement>("#listing-description")?.value).toBe(
    listing.description,
  );
  expect(button("Update listing").disabled).toBe(false);
  expect(button("Unpublish")).toBeDefined();
});

test("serializes repeated submit events until the publish request settles", async () => {
  const pending = deferred<Response>();
  answer = (method) => (method === "POST" ? pending.promise : Response.json({ listing: null }));
  await mount();

  await act(async () => {
    submit();
    submit();
  });
  expect(calls).toEqual(["GET", "POST"]);

  await act(async () => pending.resolve(Response.json({ listing })));
  expect(document.querySelector("[data-slot=dialog-title]")?.textContent).toBe(
    "Published to the marketplace",
  );
  expect(
    document.querySelector<HTMLAnchorElement>('a[href="/marketplace/published-flow"]'),
  ).not.toBeNull();
});

test("keeps the pending publication visible through Close and Escape, then allows dismissal", async () => {
  const pending = deferred<Response>();
  answer = (method) => (method === "POST" ? pending.promise : Response.json({ listing: null }));
  await mount();
  await act(async () => submit());

  expect(button("Close").disabled).toBe(true);
  await act(async () => {
    button("Close").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(closed).toBe(0);
  expect(document.querySelector("[role=dialog]")?.getAttribute("aria-busy")).toBe("true");

  await act(async () => pending.resolve(Response.json({ listing })));
  await act(async () => button("Close").click());
  expect(closed).toBe(1);
});

test("keeps an unpublish failure visible and lets the owner retry", async () => {
  const pending = deferred<Response>();
  answer = (method) => (method === "DELETE" ? pending.promise : Response.json({ listing }));
  await mount();
  await act(async () => button("Unpublish").click());
  await act(async () => {
    button("Unpublish").click();
    button("Unpublish").click();
  });
  expect(calls).toEqual(["GET", "DELETE"]);
  await act(async () => button("Close").click());
  expect(closed).toBe(0);

  await act(async () => pending.resolve(Response.json({ error: "unavailable" }, { status: 503 })));
  expect(document.querySelector("[role=alert]")?.textContent).toBe(
    "The listing could not be removed. Please try again.",
  );
  expect(button("Close").disabled).toBe(false);
  answer = () => Response.json({ slug: listing.slug });
  await act(async () => button("Unpublish").click());
  await act(async () => button("Unpublish").click());
  expect(closed).toBe(1);
});

test("requires shortening a seeded description that exceeds the marketplace limit", async () => {
  await mount("a".repeat(281));
  const description = document.querySelector<HTMLTextAreaElement>("#listing-description")!;
  expect(description.value).toHaveLength(281);
  expect(description.getAttribute("aria-invalid")).toBe("true");
  expect(button("Publish").disabled).toBe(true);
  await act(async () => submit());
  expect(calls).toEqual(["GET"]);
  const feedback = document.getElementById("listing-description-help");
  expect(feedback?.textContent).toContain("Shorten the description to 280 characters or fewer.");
  expect(description.getAttribute("aria-describedby")?.split(" ")).toContain(feedback!.id);

  await act(async () => typeDescription(description, "a".repeat(280)));
  expect(description.getAttribute("aria-invalid")).toBeNull();
  expect(button("Publish").disabled).toBe(false);
});

test("does not publish while the current listing is still loading", async () => {
  const pending = deferred<Response>();
  answer = () => pending.promise;
  await mount();
  await act(async () => submit());
  expect(calls).toEqual(["GET"]);

  await act(async () => pending.resolve(Response.json({ listing })));
  expect(button("Update listing").disabled).toBe(false);
});
