import type { LanguageModel } from "@automator/flow-engine";

/** A model for end-to-end tests: every conversation gets the same two-node flow. */
export function createScriptedCanvasModel(): LanguageModel {
  return async (request) => {
    const built = request.messages.some((message) => message.role === "tool");
    if (built)
      return { content: "Done. Fill in the Discord webhook URL before running it.", toolCalls: [] };
    return {
      content: "Adding a manual trigger and a Discord message.",
      toolCalls: [
        {
          id: "s1",
          name: "add_node",
          arguments: { id: "t", type: "trigger.manual", label: "Run", config: {} },
        },
        {
          id: "s2",
          name: "add_node",
          arguments: {
            id: "d",
            type: "notify.discord",
            label: "Post to Discord",
            config: { content: "Hello from Automator" },
          },
        },
        {
          id: "s3",
          name: "connect",
          arguments: { source: "t", sourceHandle: "run", target: "d", targetHandle: "message" },
        },
      ],
    };
  };
}
