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
        expect((await left.boundingBox())!.width).toBe(260);
        expect((await right.boundingBox())!.width).toBe(360);
      }
      await page.locator('.react-flow__node[data-id="trigger"]').click();
      await expect(left.getByLabel("Label", { exact: true })).toBeVisible();
      if (width === 390) {
        await page.screenshot({ path: "/private/tmp/automator-responsive-390-settings.png" });
        await page.getByRole("button", { name: "Close left panel" }).click();
      }
      await page.getByRole("button", { name: "Flow settings", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Flow settings", exact: true });
      await expect(settings.getByLabel("Name", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(settings).toBeHidden();
      await page.getByRole("button", { name: "Simulate", exact: true }).click();
      const run = page.getByRole("region", { name: "Last run" });
      await expect(run).toContainText("Succeeded");
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: `/private/tmp/automator-responsive-${width}.png` });
    } finally {
      await fetch(`${apiUrl}/flows/${flow.id}`, { method: "DELETE", headers });
    }
  });
}
