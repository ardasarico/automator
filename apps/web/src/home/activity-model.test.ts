import { describe, expect, test } from "bun:test";
import type { FlowRunSummary, FlowSummary } from "@automator/contracts";
import { buildActivity, upcomingLimit, runLimit } from "./activity-model";

function flow(overrides: Partial<FlowSummary> = {}): FlowSummary {
  return {
    id: "f1",
    name: "DCA into ETH",
    description: "",
    updatedAt: "2026-09-09T09:00:00.000Z",
    enabled: true,
    triggerTypes: ["trigger.schedule"],
    triggers: [{ nodeId: "n1", type: "trigger.schedule", summary: "every 1h" }],
    nodeCount: 3,
    outline: { nodes: [], edges: [] },
    ...overrides,
  };
}

function run(overrides: Partial<FlowRunSummary> = {}): FlowRunSummary {
  return {
    id: "r1",
    flowId: "f1",
    flowName: "DCA into ETH",
    status: "succeeded",
    source: "schedule",
    startedAt: "2026-09-09T09:14:00.000Z",
    finishedAt: "2026-09-09T09:14:06.200Z",
    ...overrides,
  };
}

describe("upcoming rows", () => {
  test("an armed flow reads as a future sentence", () => {
    const { upcoming } = buildActivity({ flows: [flow()], runs: [] });
    expect(upcoming).toEqual([
      {
        id: "f1:n1",
        flowId: "f1",
        flowName: "DCA into ETH",
        sentence: "runs every 1h",
      },
    ]);
  });

  test("a disabled flow is not coming up", () => {
    const { upcoming } = buildActivity({ flows: [flow({ enabled: false })], runs: [] });
    expect(upcoming).toEqual([]);
  });

  test("triggers that wait for a person are not coming up", () => {
    const { upcoming } = buildActivity({
      flows: [
        flow({
          triggerTypes: ["trigger.manual"],
          triggers: [
            { nodeId: "n1", type: "trigger.manual", summary: "when you run it" },
            { nodeId: "n2", type: "trigger.miniapp-open", summary: "when someone opens the app" },
          ],
        }),
      ],
      runs: [],
    });
    expect(upcoming).toEqual([]);
  });

  /* An active API flow waits on a caller exactly as a webhook flow does, so it is armed. */
  test("an active API flow is coming up like a webhook flow", () => {
    const { upcoming } = buildActivity({
      flows: [
        flow({
          triggers: [
            {
              nodeId: "n1",
              type: "trigger.api",
              summary: "when something calls its endpoint",
            },
          ],
        }),
      ],
      runs: [],
    });
    expect(upcoming.map((row) => row.sentence)).toEqual(["runs when something calls its endpoint"]);
  });

  test("a flow armed twice contributes both triggers", () => {
    const { upcoming } = buildActivity({
      flows: [
        flow({
          triggers: [
            { nodeId: "n1", type: "trigger.schedule", summary: "every 1h" },
            {
              nodeId: "n2",
              type: "trigger.price",
              summary: "when ETH / USD is below 2,000",
            },
          ],
        }),
      ],
      runs: [],
    });
    expect(upcoming.map((row) => row.sentence)).toEqual([
      "runs every 1h",
      "runs when ETH / USD is below 2,000",
    ]);
  });

  test("only the first few armed triggers are listed", () => {
    const flows = Array.from({ length: upcomingLimit + 2 }, (_, index) =>
      flow({ id: `f${index}`, name: `Flow ${index}` }),
    );
    expect(buildActivity({ flows, runs: [] }).upcoming).toHaveLength(upcomingLimit);
  });
});

describe("run rows", () => {
  test("a finished run reads as what it did, with what started it beside it", () => {
    const { runs } = buildActivity({ flows: [], runs: [run()] });
    expect(runs).toEqual([
      {
        id: "r1",
        flowId: "f1",
        flowName: "DCA into ETH",
        status: "succeeded",
        at: "2026-09-09T09:14:00.000Z",
        sentence: "ran",
        source: "Schedule",
        reason: undefined,
      },
    ]);
  });

  test("a failed run carries the first line of its error", () => {
    const { runs } = buildActivity({
      flows: [],
      runs: [
        run({
          status: "failed",
          source: "manual",
          error: "ERC20: transfer amount exceeds allowance\n  at step 2",
        }),
      ],
    });
    expect(runs[0]).toMatchObject({
      sentence: "failed",
      source: "Simulate",
      reason: "ERC20: transfer amount exceeds allowance",
    });
  });

  test("a waiting run says so, in the present tense", () => {
    const { runs } = buildActivity({ flows: [], runs: [run({ status: "waiting" })] });
    expect(runs[0]).toMatchObject({ sentence: "is waiting for an answer" });
  });

  test("only the most recent runs are listed", () => {
    const many = Array.from({ length: runLimit + 3 }, (_, index) => run({ id: `r${index}` }));
    expect(buildActivity({ flows: [], runs: many }).runs).toHaveLength(runLimit);
  });
});
