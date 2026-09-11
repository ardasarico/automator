import type { AiMessage, AiProposalPart, AiStreamEvent } from "@automator/contracts";

export function applyEvent(message: AiMessage, event: AiStreamEvent): AiMessage {
  const parts = message.parts;
  switch (event.type) {
    case "text.delta": {
      const last = parts.at(-1);
      if (last?.type === "text")
        return {
          ...message,
          parts: [...parts.slice(0, -1), { type: "text", text: last.text + event.delta }],
        };
      return { ...message, parts: [...parts, { type: "text", text: event.delta }] };
    }
    case "tool.call":
      return {
        ...message,
        parts: [...parts, { type: "tool", id: event.id, name: event.name, args: event.args }],
      };
    case "tool.result":
      return {
        ...message,
        parts: parts.map((part) =>
          part.type === "tool" && part.id === event.id
            ? { ...part, ok: event.ok, detail: event.detail }
            : part,
        ),
      };
    case "question":
      return {
        ...message,
        parts: [...parts, { type: "question", text: event.text, options: event.options }],
      };
    case "proposal":
      return {
        ...message,
        parts: [
          ...parts,
          {
            type: "proposal",
            document: event.document,
            verification: event.verification,
            replaces: event.replaces,
            state: "pending",
          },
        ],
      };
    case "suggestions":
      return { ...message, parts: [...parts, { type: "suggestions", items: event.items }] };
    case "error":
      return {
        ...message,
        parts: [
          ...parts,
          { type: "error", error: event.error, ...(event.detail ? { detail: event.detail } : {}) },
        ],
      };
    case "message":
    case "status":
    case "done":
      return message;
  }
}

export function proposalOf(message: AiMessage): AiProposalPart | undefined {
  return message.parts.find((part): part is AiProposalPart => part.type === "proposal");
}
