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
