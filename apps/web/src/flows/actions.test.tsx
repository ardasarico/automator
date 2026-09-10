import type { FlowRecord } from "@automator/contracts";
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { navigationModule, redirectError } from "../auth/test-navigation";

mock.module("server-only", () => ({}));
mock.module("next/navigation", () => navigationModule);

const auth = await import("../auth/server");
const flows = await import("./server");
const marketplace = await import("../marketplace/server");
const { createEmptyFlow } = await import("../builder/document");
const { curatedListings } = await import("../marketplace/curated");
const { createFlowAction, forkFlowAction } = await import("./actions");
const { actionUnavailable } = await import("./action-state");
const { FlowApiError } = await import("./server");
const { default: CreatePage } = await import("../app/(workspace)/create/page");
const { default: ForkPage } = await import("../app/(workspace)/marketplace/[slug]/fork/page");
const { default: ListingPage } = await import("../app/(workspace)/marketplace/[slug]/page");

const user = { id: "user", name: "Arda", username: "arda", walletAddress: null };
const record: FlowRecord = {
  flow: createEmptyFlow("created-flow"),
  createdAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

afterEach(() => mock.restore());

test("rendering a legacy creation link offers a submit action without creating a flow", async () => {
  const create = spyOn(flows, "createFlow");
  const html = renderToString(
    await CreatePage({ searchParams: Promise.resolve({ example: "ticket-checkout", ai: "1" }) }),
  );
  expect(create).not.toHaveBeenCalled();
  expect(html).toContain("Create flow");
  expect(html).toContain('type="submit"');
});

test("a legacy fork GET returns to the listing without making a copy", async () => {
  const fork = spyOn(marketplace, "forkListing");
  await expect(ForkPage({ params: Promise.resolve({ slug: "arda/example" }) })).rejects.toThrow(
    "redirect:/marketplace/arda%2Fexample",
  );
  expect(fork).not.toHaveBeenCalled();
});

test("a submitted blank flow action authenticates and creates once before opening AI", async () => {
  const authenticate = spyOn(auth, "requireUser").mockResolvedValue(user);
  const create = spyOn(flows, "createFlow").mockResolvedValue(record);
  await expect(createFlowAction({ ai: true })).rejects.toThrow("redirect:/flows/created-flow?ai=1");
  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]![0]).not.toHaveProperty("id");
  expect(create.mock.calls[0]![0].nodes).toEqual([]);
});

test("a curated action copies the chosen graph into a new stored flow", async () => {
  spyOn(auth, "requireUser").mockResolvedValue(user);
  const create = spyOn(flows, "createFlow").mockResolvedValue(record);
  const example = curatedListings[0]!;
  await expect(createFlowAction({ example: example.slug })).rejects.toThrow(
    "redirect:/flows/created-flow",
  );
  expect(create.mock.calls[0]![0].name).toBe(example.name);
  expect(create.mock.calls[0]![0].nodes.length).toBeGreaterThan(0);
});

test("a submitted published fork keeps the decoded slug and creates exactly once", async () => {
  spyOn(auth, "requireUser").mockResolvedValue(user);
  const fork = spyOn(marketplace, "forkListing").mockResolvedValue(record);
  await expect(forkFlowAction("arda/example")).rejects.toThrow("redirect:/flows/created-flow");
  expect(fork).toHaveBeenCalledTimes(1);
  expect(fork).toHaveBeenCalledWith("arda/example");
});

test("rejected authentication prevents both create and fork mutations", async () => {
  spyOn(auth, "requireUser").mockRejectedValue(redirectError("/login"));
  const create = spyOn(flows, "createFlow");
  const fork = spyOn(marketplace, "forkListing");
  await expect(createFlowAction()).rejects.toThrow("redirect:/login");
  await expect(forkFlowAction("example")).rejects.toThrow("redirect:/login");
  expect(create).not.toHaveBeenCalled();
  expect(fork).not.toHaveBeenCalled();
});

/* An unreachable API is what our own deploys look like from here, and a thrown server action
 * reaches the browser as nothing a form can render — so it has to come back as an answer. */
test("an unreachable API comes back as a message instead of throwing", async () => {
  spyOn(auth, "requireUser").mockResolvedValue(user);
  spyOn(flows, "createFlow").mockRejectedValue(new FlowApiError(503));
  spyOn(marketplace, "forkListing").mockRejectedValue(new FlowApiError(503));
  expect(await createFlowAction()).toEqual({ error: actionUnavailable });
  expect(await forkFlowAction("arda/example")).toEqual({ error: actionUnavailable });
});

test("a redirect still leaves the action, so a created flow opens", async () => {
  spyOn(auth, "requireUser").mockResolvedValue(user);
  spyOn(flows, "createFlow").mockResolvedValue(record);
  await expect(createFlowAction()).rejects.toThrow("redirect:/flows/created-flow");
});

test("listing rendering preserves decoded params and exposes a submit fork, with no mutation", async () => {
  const listing = { ...curatedListings[0]!, slug: "literal%2Fslug" };
  const lookup = spyOn(marketplace, "findMarketplaceItem").mockResolvedValue(listing);
  const fork = spyOn(marketplace, "forkListing");
  const html = renderToString(
    await ListingPage({ params: Promise.resolve({ slug: listing.slug }) }),
  );
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(lookup).toHaveBeenCalledWith("literal%2Fslug");
  expect(fork).not.toHaveBeenCalled();
  expect(html).toContain(`aria-label="Fork flow: ${listing.name}"`);
  expect(html).toContain('type="submit"');
  expect(html).not.toContain("/fork");
});
