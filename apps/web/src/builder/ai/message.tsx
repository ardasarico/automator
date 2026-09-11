"use client";

import type { AiMessage, AiPart, AiToolPart } from "@automator/contracts";
import type { ReactNode } from "react";
import { Button } from "@automator/ui/button";
import { Markdown } from "./markdown";
import styles from "./panel.module.css";
import { ProposalCard } from "./proposal-card";
import { isListedStep, Steps } from "./steps";
import { AiRequestError, describeAiFailure } from "./transport";
import { stoppedByUser } from "./use-send-message";
import { useChatStore } from "./chat-store-provider";

type QuestionPart = Extract<AiPart, { type: "question" }>;
type SuggestionsPart = Extract<AiPart, { type: "suggestions" }>;
type ErrorPart = Extract<AiPart, { type: "error" }>;

/** One run of consecutive tool calls, or a single part of any other kind. */
type Block =
  | { key: string; index: number; steps: AiToolPart[] }
  | { key: string; index: number; part: Exclude<AiPart, AiToolPart> };

function blocksOf(message: AiMessage): Block[] {
  const blocks: Block[] = [];
  for (const [index, part] of message.parts.entries()) {
    if (part.type === "tool") {
      if (!isListedStep(part)) continue;
      const last = blocks.at(-1);
      if (last && "steps" in last) last.steps.push(part);
      else blocks.push({ key: `${message.id}:${index}`, index, steps: [part] });
      continue;
    }
    blocks.push({ key: `${message.id}:${index}`, index, part });
  }
  /* Suggestions are an offer to continue, so they belong under everything the turn produced —
   * wherever the agent happened to call the tool. */
  const isSuggestion = (block: Block) => "part" in block && block.part.type === "suggestions";
  return [...blocks.filter((block) => !isSuggestion(block)), ...blocks.filter(isSuggestion)];
}

/** Where the text the model is still writing sits, so the earlier paragraphs stop animating. */
function lastTextIndex(message: AiMessage): number {
  return message.parts.reduce((last, part, index) => (part.type === "text" ? index : last), -1);
}

/**
 * The code carries the recovery step and the detail says what actually failed, so both are shown:
 * the wording first, the detail under it. A turn the reader stopped is not a failure to explain
 * and gets only its own sentence.
 */
function errorText(part: ErrorPart): string {
  if (part.detail === stoppedByUser) return stoppedByUser;
  const wording = describeAiFailure(new AiRequestError(part.error));
  return part.detail ? `${wording}\n${part.detail}` : wording;
}

function Chips({ children }: { children: ReactNode }) {
  return <div className={styles.chipRow}>{children}</div>;
}

function Question({ part, onSend }: { part: QuestionPart; onSend(text: string): void }) {
  const setDraftPrompt = useChatStore((state) => state.setDraftPrompt);
  const requestFocus = useChatStore((state) => state.requestFocus);
  return (
    <div className="space-y-2">
      <p className="text-caption">{part.text}</p>
      <Chips>
        {part.options.map((option) => (
          <Button
            key={option}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSend(option)}
          >
            {option}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraftPrompt("");
            requestFocus();
          }}
        >
          Something else
        </Button>
      </Chips>
    </div>
  );
}

function Suggestions({ part, onSend }: { part: SuggestionsPart; onSend(text: string): void }) {
  return (
    <Chips>
      {part.items.map((item) => (
        <Button key={item} type="button" variant="outline" size="sm" onClick={() => onSend(item)}>
          {item}
        </Button>
      ))}
    </Chips>
  );
}

export function Message({
  message,
  streaming,
  last,
  onSend,
  onApply,
  onDiscard,
}: {
  message: AiMessage;
  streaming: boolean;
  /** Suggestions are an offer to continue; a later message has already answered them. */
  last: boolean;
  onSend(text: string): void;
  onApply(messageId: string): void;
  onDiscard(messageId: string): void;
}) {
  if (message.role === "user")
    return (
      <div className={styles.userTurn}>
        {message.parts.map((part) => (part.type === "text" ? part.text : "")).join("")}
      </div>
    );

  const animating = lastTextIndex(message);
  return (
    <div className={styles.assistantTurn}>
      {blocksOf(message).map((block) => {
        if ("steps" in block)
          return <Steps key={block.key} id={block.key} steps={block.steps} streaming={streaming} />;
        const { part } = block;
        switch (part.type) {
          case "text":
            return (
              <Markdown
                key={block.key}
                text={part.text}
                isAnimating={streaming && block.index === animating}
              />
            );
          case "question":
            return <Question key={block.key} part={part} onSend={onSend} />;
          case "proposal":
            return (
              <ProposalCard
                key={block.key}
                messageId={message.id}
                proposal={part}
                onApply={() => onApply(message.id)}
                onDiscard={() => onDiscard(message.id)}
              />
            );
          case "suggestions":
            return last ? <Suggestions key={block.key} part={part} onSend={onSend} /> : null;
          case "error":
            return (
              <p key={block.key} role="alert" className={styles.error}>
                {errorText(part)}
              </p>
            );
        }
      })}
    </div>
  );
}
