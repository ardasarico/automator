"use client";

import { Button } from "@automator/ui/button";
import { RiSparklingLine } from "@remixicon/react";
import { useAskAi } from "./use-ask-ai";

/** Opens the AI panel with this node as the context, so the next message is about it. */
export function AskAiButton({ nodeId }: { nodeId: string }) {
  const { askAboutNode } = useAskAi();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Ask AI about this node"
      onClick={() => askAboutNode(nodeId)}
    >
      <RiSparklingLine aria-hidden="true" />
    </Button>
  );
}
