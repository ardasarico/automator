import { expect, test } from "@playwright/test";
import { apiUrl, e2eToken } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };

for (const width of [1280, 390]) {
  test(`canvas panels and controls remain usable at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    expect((await fetch(`${apiUrl}/auth/session`, { method: "POST", headers })).status).toBe(200);
    await fetch(`${apiUrl}/auth/profile`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: "E2E Tester", username: "e2e_tester" }),
    });
    await context.addCookies([
      { name: "automator-session", value: e2eToken, domain: "localhost", path: "/" },
    ]);
    const response = await fetch(`${apiUrl}/flows`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        version: 1,
        name: "Responsive canvas",
        description: "Local responsive fixture",
        nodes: [
          {
            id: "trigger",
            type: "trigger.miniapp-open",
            position: { x: 0, y: 0 },
            label: "Mini-app opened",
            config: {},
          },
        ],
        edges: [],
      }),
    });
    expect(response.status).toBe(201);
    const { flow } = await response.json();
    try {
      await page.goto(`/flows/${flow.id}`);
      const canvas = page.locator(".react-flow");
      await expect(canvas).toBeVisible();
      const dismissChecklist = page.getByRole("button", { name: "Dismiss checklist" });
      if (await dismissChecklist.isVisible()) await dismissChecklist.click();
      const initialWidth = (await canvas.boundingBox())!.width;
      expect(initialWidth).toBeGreaterThan(250);
      const left = page.locator("#builder-left-panel");
      const right = page.locator("#builder-right-panel");
      if (width === 390) {
        await expect(left).toBeHidden();
        await expect(right).toBeHidden();
        await page.getByRole("button", { name: "Nodes", exact: true }).click();
        await expect(left).toBeVisible();
        expect((await left.boundingBox())!.width).toBe(initialWidth);
        expect((await left.boundingBox())!.y).toBe((await canvas.boundingBox())!.y);
        await page.getByRole("button", { name: "AI agent", exact: true }).click();
        await expect(right).toBeVisible();
        await expect(left).toBeHidden();
        expect((await canvas.boundingBox())!.width).toBe(initialWidth);
        await right.getByRole("tab", { name: "Screen preview", exact: true }).click();
        await expect(
          right.getByRole("tab", { name: "Screen preview", exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        await page.screenshot({ path: "/private/tmp/automator-responsive-390-preview.png" });
        await page.keyboard.press("Escape");
        await expect(right).toBeHidden();
        await expect(page.getByRole("button", { name: "AI agent", exact: true })).toBeFocused();
      } else {
        await expect(left).toBeVisible();
        await expect(right).toBeVisible();
        /* Node settings were widened to 340 so labels stop wrapping and help stays on one line. */
        expect((await left.boundingBox())!.width).toBe(340);
        expect((await right.boundingBox())!.width).toBe(360);
      }
      await page.locator('.react-flow__node[data-id="trigger"]').click();
      /*
       * Node settings no longer open with a "Label" field. Renaming moved into the panel's own
       * header, where the node's name is a button that becomes a "Node name" input, so the name
       * on that button is what says the panel is showing the node that was clicked.
       */
      const rename = left.getByRole("button", { name: "Mini-app opened", exact: true });
      await expect(rename).toBeVisible();
      await rename.click();
      await expect(left.getByLabel("Node name", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      if (width === 390) {
        await page.screenshot({ path: "/private/tmp/automator-responsive-390-settings.png" });
        await page.getByRole("button", { name: "Close left panel" }).click();
      }
      await page.getByRole("button", { name: "Flow settings", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Flow settings", exact: true });
      await expect(settings.getByLabel("Name", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(settings).toBeHidden();
      await page.getByRole("button", { name: "Run", exact: true }).click();
      const run = page.getByRole("region", { name: "Last run" });
      await expect(run).toContainText("Succeeded");
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Share", exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: `/private/tmp/automator-responsive-${width}.png` });
    } finally {
      await fetch(`${apiUrl}/flows/${flow.id}`, { method: "DELETE", headers });
    }
  });
}

/*
 * The canvas header used to be held to one line, so in the band where both side panels are open
 * but the window is not wide enough for them (roughly 1024-1365px) it overflowed its column to
 * the right. The right panel is a later sibling carrying an opaque background, so it painted
 * over the overflow: at 1024px it swallowed clicks on four controls, Share and Save among them,
 * with nothing on screen to say why. Nothing in the header may end up underneath it.
 */
test("header controls stay out from under the right panel at every width", async ({
  page,
  context,
}) => {
  expect((await fetch(`${apiUrl}/auth/session`, { method: "POST", headers })).status).toBe(200);
  await fetch(`${apiUrl}/auth/profile`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ name: "E2E Tester", username: "e2e_tester" }),
  });
  await context.addCookies([
    { name: "automator-session", value: e2eToken, domain: "localhost", path: "/" },
  ]);
  const response = await fetch(`${apiUrl}/flows`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      version: 1,
      name: "Header reach",
      description: "Local responsive fixture",
      nodes: [
        {
          id: "trigger",
          type: "trigger.miniapp-open",
          position: { x: 0, y: 0 },
          label: "Mini-app opened",
          config: {},
        },
      ],
      edges: [],
    }),
  });
  expect(response.status).toBe(201);
  const { flow } = await response.json();
  try {
    await page.goto(`/flows/${flow.id}`);
    await page.getByRole("button", { name: "Share", exact: true }).waitFor();
    const dismissChecklist = page.getByRole("button", { name: "Dismiss checklist" });
    if (await dismissChecklist.isVisible()) await dismissChecklist.click();

    for (const width of [1024, 1100, 1280, 1366, 1536]) {
      await page.setViewportSize({ width, height: 800 });
      const covered = await page.evaluate(() => {
        const header = document.querySelector("header");
        if (!header) return ["no header"];
        const bounds = header.getBoundingClientRect();
        return [...header.querySelectorAll("button")]
          .filter((button) => {
            const box = button.getBoundingClientRect();
            const over = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return (
              box.right > bounds.right + 0.5 ||
              box.bottom > bounds.bottom + 0.5 ||
              !!over?.closest("#builder-right-panel")
            );
          })
          .map((button) => button.getAttribute("aria-label") ?? button.textContent ?? "?");
      });
      expect(covered, `header controls unreachable at ${width}px`).toEqual([]);
    }
  } finally {
    await fetch(`${apiUrl}/flows/${flow.id}`, { method: "DELETE", headers });
  }
});
