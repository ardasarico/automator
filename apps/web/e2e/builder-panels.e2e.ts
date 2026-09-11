import { expect, test, type BrowserContext } from "@playwright/test";
import type { FlowDocumentInput, FlowRecord } from "@automator/contracts";
import { apiUrl, e2eToken } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };
const created: string[] = [];

async function signIn(context: BrowserContext) {
  const session = await fetch(`${apiUrl}/auth/session`, { method: "POST", headers });
  expect(session.status).toBe(200);
  const profile = await fetch(`${apiUrl}/auth/profile`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ name: "E2E Tester", username: "e2e_tester" }),
  });
  expect(profile.status).toBe(200);
  await context.addCookies([
    { name: "automator-session", value: e2eToken, domain: "localhost", path: "/" },
  ]);
}

async function seedFlow(name: string, nodes: FlowDocumentInput["nodes"]) {
  const response = await fetch(`${apiUrl}/flows`, {
    method: "POST",
    headers,
    body: JSON.stringify({ version: 1, name, description: "E2E fixture", nodes, edges: [] }),
  });
  expect(response.status).toBe(201);
  const record = (await response.json()) as FlowRecord;
  created.push(record.flow.id);
  return record.flow;
}

test.beforeEach(async ({ context }) => signIn(context));
test.afterEach(async () => {
  for (const id of created.splice(0)) {
    await fetch(`${apiUrl}/flows/${id}`, { method: "DELETE", headers });
  }
});

const apiFlow = (): FlowDocumentInput["nodes"] => [
  {
    id: "call",
    type: "trigger.api",
    position: { x: 0, y: 0 },
    label: "API call",
    config: { description: "Quote a swap", inputs: [{ name: "amount", type: "number" }] },
  },
  { id: "code", type: "logic.run-code", position: { x: 320, y: 0 }, label: "Compute", config: {} },
  { id: "out", type: "logic.return", position: { x: 640, y: 0 }, label: "Answer", config: {} },
];

/*
 * The example call is one long line per header, so it has to scroll rather than grow: sized to
 * its own content it escaped the dialog and the endpoint was clipped mid-URL at the panel edge.
 */
test("the Use as API snippets are readable inside the dialog", async ({ page }) => {
  const flow = await seedFlow(`E2E api ${Date.now()}`, apiFlow());
  await page.goto(`/flows/${flow.id}`);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("menuitem", { name: /Use as API/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const fits = await page.evaluate(() =>
    [...document.querySelectorAll("pre")].map((pre) => ({
      text: pre.textContent?.slice(0, 12) ?? "",
      within: pre.clientWidth <= (pre.parentElement?.clientWidth ?? 0),
      scrollable: pre.scrollWidth > pre.clientWidth ? getComputedStyle(pre).overflowX : "n/a",
    })),
  );
  for (const pre of fits) {
    // Never wider than what holds it, and anything longer scrolls rather than being cut off.
    expect(pre.within, `snippet "${pre.text}" overflows its container`).toBe(true);
    expect(["auto", "scroll", "n/a"]).toContain(pre.scrollable);
  }

  // The command reads as the command: broken at its own arguments, not mid-word by wrapping.
  const command = await page.locator('[data-snippet="claude-code"] pre').textContent();
  expect(command).toContain("claude mcp add --transport http \\");
  expect(command).not.toContain("add--transport");
});

/*
 * MiniMap draws its svg at the size it reads from `style`, so sizing it in CSS alone left the
 * svg at React Flow's default and the smaller frame clipped it — the rightmost node cut off by
 * the border and the flow pressed against the bottom edge.
 */
test("the minimap frames the whole flow inside its own box", async ({ page }) => {
  const flow = await seedFlow(`E2E map ${Date.now()}`, [
    { id: "a", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Start", config: {} },
    { id: "b", type: "logic.condition", position: { x: 360, y: 0 }, label: "Check", config: {} },
    { id: "c", type: "notify.discord", position: { x: 720, y: 0 }, label: "Tell", config: {} },
  ]);
  await page.goto(`/flows/${flow.id}`);
  await page.waitForSelector(".react-flow__node");
  await page.getByRole("button", { name: "Fit view", exact: true }).click();

  const map = await page.evaluate(() => {
    const el = document.querySelector(".react-flow__minimap") as HTMLElement | null;
    const svg = el?.querySelector("svg");
    const [vx, vy, vw, vh] = (svg?.getAttribute("viewBox") ?? "0 0 0 0").split(" ").map(Number);
    const nodes = [...(el?.querySelectorAll(".react-flow__minimap-node") ?? [])].map((n) => ({
      x: Number(n.getAttribute("x")),
      y: Number(n.getAttribute("y")),
      w: Number(n.getAttribute("width")),
      h: Number(n.getAttribute("height")),
    }));
    return {
      box: { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 },
      svg: { w: Number(svg?.getAttribute("width")), h: Number(svg?.getAttribute("height")) },
      view: { x: vx ?? 0, y: vy ?? 0, w: vw ?? 0, h: vh ?? 0 },
      nodes,
    };
  });

  // The drawing is the size of the frame, so none of it is cut off by the border.
  expect(Math.abs(map.svg.w - map.box.w)).toBeLessThanOrEqual(4);
  expect(Math.abs(map.svg.h - map.box.h)).toBeLessThanOrEqual(4);
  // And every node it draws is inside what the svg shows.
  expect(map.nodes.length).toBe(3);
  for (const node of map.nodes) {
    expect(node.x).toBeGreaterThanOrEqual(map.view.x);
    expect(node.y).toBeGreaterThanOrEqual(map.view.y);
    expect(node.x + node.w).toBeLessThanOrEqual(map.view.x + map.view.w);
    expect(node.y + node.h).toBeLessThanOrEqual(map.view.y + map.view.h);
  }
});

/*
 * Focus mode is a layout change, not a different tree: the canvas must keep the React Flow
 * instance it had, so the viewport it was left at survives the switch.
 */
test("focus mode widens the conversation without remounting the canvas", async ({ page }) => {
  const flow = await seedFlow(`E2E focus ${Date.now()}`, apiFlow());
  await page.goto(`/flows/${flow.id}`);

  const panel = page.getByRole("complementary", { name: "Panels" });
  await expect(panel).toBeVisible();
  const narrow = (await panel.boundingBox())!;
  const viewport = page.locator(".react-flow__viewport");
  await expect(viewport).toBeVisible();
  await page.evaluate(() => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement;
    el.dataset.witness = "kept";
  });

  await page.getByRole("button", { name: "Focus mode" }).click();
  const focused = (await panel.boundingBox())!;
  expect(focused.width).toBeGreaterThan(narrow.width);
  // The conversation is now left of the canvas, and the screen preview is not offered beside it.
  expect(focused.x).toBeLessThan(narrow.x);
  await expect(page.getByRole("tab", { name: "Screen preview" })).toHaveCount(0);
  // The flow's name moves to the canvas header, where the hidden left panel used to carry it.
  await expect(page.getByRole("banner").getByText(flow.name)).toBeVisible();
  // Same element, so the canvas was re-proportioned rather than rebuilt.
  await expect(viewport).toHaveAttribute("data-witness", "kept");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: "Screen preview" })).toBeVisible();
  expect((await panel.boundingBox())!.width).toBe(narrow.width);
});
