import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { navigationModule } from "../../../auth/test-navigation";

mock.module("server-only", () => ({}));
mock.module("next/navigation", () => navigationModule);

const server = await import("../../../flows/server");
const { default: RunsPage } = await import("./page");

afterEach(() => mock.restore());

test("a malformed cursor returns to the latest page and preserves the selected flow", async () => {
  spyOn(server, "listFlows").mockResolvedValue([]);
  spyOn(server, "listRuns").mockRejectedValue(new server.FlowApiError(400));
  await expect(
    RunsPage({ searchParams: Promise.resolve({ flow: "flow-1", cursor: "broken" }) }),
  ).rejects.toThrow("redirect:/runs?flow=flow-1");
});

test("an API outage remains an error instead of silently restarting pagination", async () => {
  spyOn(server, "listFlows").mockResolvedValue([]);
  spyOn(server, "listRuns").mockRejectedValue(new server.FlowApiError(503));
  await expect(RunsPage({ searchParams: Promise.resolve({ cursor: "existing" }) })).rejects.toThrow(
    "Flow request failed with 503",
  );
});
