import { describe, expect, test } from "bun:test";
import type { AiStreamEvent } from "@automator/contracts";
import { runCanvasAgent } from "./canvas-agent";
import { createScriptedCanvasModel } from "./scripted";

describe("scripted canvas model", () => {
  test("builds the two-node manual-trigger to Discord flow and stops after one round of tools", async () => {
    const events: AiStreamEvent[] = [];
    await runCanvasAgent({
      model: createScriptedCanvasModel(),
      text: "Post hi to Discord when I run it",
      history: [],
      emit: (event) => events.push(event),
      verificationBudget: 2000,
    });
    const proposal = events.find((event) => event.type === "proposal");
    expect(proposal).toBeDefined();
    expect(proposal).toMatchObject({ type: "proposal" });
    if (proposal?.type !== "proposal") throw new Error("expected a proposal event");
    expect(proposal.document.nodes).toHaveLength(2);
    expect(proposal.document.edges).toHaveLength(1);
    // The second hop (after the tool results were appended) answered with no tool calls,
    // so no further tool.call events follow it: the turn ends there.
    const toolCallCount = events.filter((event) => event.type === "tool.call").length;
    expect(toolCallCount).toBe(3);
    const lastToolResultIndex = events.findLastIndex((event) => event.type === "tool.result");
    expect(events.slice(lastToolResultIndex + 1).some((event) => event.type === "tool.call")).toBe(
      false,
    );
  });
});
