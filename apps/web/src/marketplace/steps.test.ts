import { expect, test } from "bun:test";
import { stepsFromDocument } from "./steps";

test("stepsFromDocument names steps by node label and skips triggers", () => {
  expect(
    stepsFromDocument({
      nodes: [
        { id: "a", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Start", config: {} },
        { id: "b", type: "world.id-verify", position: { x: 0, y: 0 }, label: "Prove", config: {} },
        { id: "c", type: "usdc.payout", position: { x: 0, y: 0 }, label: "Pay out", config: {} },
      ],
    }).map((step) => step.name),
  ).toEqual(["Prove", "Pay out"]);
  expect(stepsFromDocument({ nodes: [] })).toEqual([]);
});
