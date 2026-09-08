import { expect, test } from "@playwright/test";
import type { FlowRecord, TriggerExecutionIssue } from "@automator/contracts";
import { apiUrl, e2eToken } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };

test("polling issues preserve uncertain wording, private evidence and mobile settings access", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  expect((await fetch(`${apiUrl}/auth/session`, { method: "POST", headers })).status).toBe(200);
  await fetch(`${apiUrl}/auth/profile`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ name: "E2E Tester", username: "e2e_tester" }),
  });
  await context.addCookies([
    { name: "automator-session", value: e2eToken, domain: "localhost", path: "/" },
  ]);
  const created = await fetch(`${apiUrl}/flows`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      version: 1,
      name: `Trigger visibility ${Date.now()}`,
      description: "Isolated inactive fixture",
      nodes: [
        {
          id: "schedule",
          type: "trigger.schedule",
          position: { x: 0, y: 0 },
          label: "Schedule",
          config: {},
        },
      ],
      edges: [],
    }),
  });
  expect(created.status).toBe(201);
  const { flow } = (await created.json()) as FlowRecord;
  try {
    const startedAt = "2026-09-08T10:00:00.000Z";
    const record = {
      document: flow,
      flowName: flow.name,
      source: "schedule" as const,
      run: {
        id: "retained-run",
        flowId: flow.id,
        status: "succeeded" as const,
        startedAt,
        finishedAt: startedAt,
        trigger: { nodeId: "schedule" },
        nodes: [],
        variables: { evidence: "owner-only-evidence" },
      },
    };
    const issues: TriggerExecutionIssue[] = [
      {
        id: "active-claim",
        nodeId: "schedule",
        source: "schedule",
        status: "running",
        startedAt,
        historySaved: false,
        record: null,
      },
      {
        id: "uncertain-claim",
        nodeId: "event",
        source: "event",
        status: "uncertain",
        startedAt,
        historySaved: false,
        record: null,
      },
      {
        id: "history-claim",
        nodeId: "watch",
        source: "watch",
        status: "completed",
        startedAt,
        historySaved: false,
        record,
      },
    ];
    let requests = 0;
    let fail = false;
    await page.route(`**/api/flows/${flow.id}/trigger-issues`, async (route) => {
      requests++;
      expect(route.request().headers().authorization).toBe(`Bearer ${e2eToken}`);
      await route.fulfill(
        fail ? { status: 503, json: { error: "unavailable" } } : { json: { issues } },
      );
    });
    await page.goto(`/flows/${flow.id}`);
    await expect(page.getByRole("button", { name: "Flow settings", exact: true })).toBeVisible();
    expect(requests).toBe(0);
    await page.getByRole("button", { name: "Flow settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Flow settings", exact: true });
    const section = dialog.getByRole("region", { name: "Polling trigger issues" });
    await expect(section).toContainText("3 retained issues.");
    await expect(
      section.getByText("Execution outcome is unresolved.", { exact: false }),
    ).toHaveCount(2);
    await expect(section).toContainText(
      "The worker may still execute actions; avoid starting a duplicate run.",
    );
    await expect(section).toContainText("Execution finished, but run history has not been saved.");
    await section.getByText("Retained execution evidence", { exact: true }).click();
    await expect(section.locator("pre")).toContainText("owner-only-evidence");
    const downloadPromise = page.waitForEvent("download");
    await section.getByRole("button", { name: "Download evidence" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("trigger-evidence-history-claim.json");
    await page.screenshot({ path: "/private/tmp/automator-trigger-issues-390.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    fail = true;
    await expect(section).toContainText("Trigger issue monitoring is unavailable.", {
      timeout: 20_000,
    });
    await expect(section.locator("pre")).toHaveCount(0);
    expect(requests).toBeGreaterThanOrEqual(2);
    fail = false;
    await section.getByRole("button", { name: "Retry issue check" }).click();
    await expect(section).toContainText("3 retained issues.");
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(dialog).toBeHidden();
    const countAfterClose = requests;
    await page.waitForTimeout(16_000);
    expect(requests).toBe(countAfterClose);
    const persisted = await fetch(`${apiUrl}/flows/${flow.id}`, { headers });
    expect(((await persisted.json()) as FlowRecord).enabled).not.toBe(true);
    expect(pageErrors).toEqual([]);
  } finally {
    expect((await fetch(`${apiUrl}/flows/${flow.id}`, { method: "DELETE", headers })).status).toBe(
      200,
    );
  }
});
