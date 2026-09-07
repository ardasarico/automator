import { describe, expect, test } from "bun:test";
import { completedSteps, gettingStartedSteps } from "./getting-started";

const idle = { built: false, dirty: false, simulated: false, live: false };

describe("gettingStartedSteps", () => {
  test("a fresh blank flow has nothing done, including save", () => {
    const steps = gettingStartedSteps(idle);
    expect(steps.map((step) => step.done)).toEqual([false, false, false, false]);
    expect(completedSteps(steps)).toBe(0);
  });

  test("save counts only once something is built and saved", () => {
    expect(gettingStartedSteps({ ...idle, built: true, dirty: true })[1]!.done).toBe(false);
    expect(gettingStartedSteps({ ...idle, built: true, dirty: false })[1]!.done).toBe(true);
  });

  test("simulate and live follow their own signals", () => {
    const steps = gettingStartedSteps({ built: true, dirty: false, simulated: true, live: true });
    expect(steps.every((step) => step.done)).toBe(true);
    expect(completedSteps(steps)).toBe(4);
  });
});
