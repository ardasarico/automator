"use client";

import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@automator/ui/menu";
import { Textarea } from "@automator/ui/textarea";
import { RiArrowUpLine, RiMoreLine } from "@remixicon/react";
import { useEffect, useRef } from "react";
import { isFlowNode } from "../document";
import { useBuilderStore } from "../store-provider";
import { useChatStore } from "./chat-store-provider";
import { ContextStrip } from "./context-strip";
import styles from "./panel.module.css";

/* Eight lines of prompt, then the field scrolls rather than eating the conversation. */
const maxRows = 8;

function grow(field: HTMLTextAreaElement) {
  field.style.height = "auto";
  const line = Number.parseFloat(getComputedStyle(field).lineHeight) || 18;
  field.style.height = `${Math.min(field.scrollHeight, line * maxRows + 16)}px`;
}

export function Composer({
  onSend,
  onStartOver,
}: {
  onSend(text: string): void;
  onStartOver(): void;
}) {
  const pending = useChatStore((state) => state.pending);
  /* The draft lives in the store, so a chip or "Something else" can write into this field. */
  const text = useChatStore((state) => state.draftPrompt) ?? "";
  const setDraftPrompt = useChatStore((state) => state.setDraftPrompt);
  const focusRequests = useChatStore((state) => state.focusRequests);
  const hasNodes = useBuilderStore((state) => state.nodes.some(isFlowNode));
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusRequests > 0) field.current?.focus();
  }, [focusRequests]);

  function submit() {
    const message = text.trim();
    if (message === "" || pending) return;
    setDraftPrompt(null);
    if (field.current) field.current.style.height = "auto";
    onSend(message);
  }

  return (
    <div className={styles.composer}>
      {/* What the next message carries, where it is being written. */}
      <div className={styles.composerInner}>
        <ContextStrip onSend={onSend} />
        <form
          className={styles.composerForm}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field>
            <FieldLabel htmlFor="ai-prompt" className="sr-only">
              Message
            </FieldLabel>
            <Textarea
              ref={field}
              id="ai-prompt"
              rows={1}
              className={styles.prompt}
              placeholder={
                hasNodes
                  ? "Add a condition before the Discord message"
                  : "When a webhook fires, post the payload to Discord"
              }
              value={text}
              onChange={(event) => {
                setDraftPrompt(event.target.value);
                grow(event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
                  return;
                event.preventDefault();
                submit();
              }}
            />
          </Field>
          <div className={styles.row}>
            <Menu>
              <MenuTrigger
                render={
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Chat options" />
                }
              >
                <RiMoreLine aria-hidden="true" />
              </MenuTrigger>
              <MenuPopup align="start">
                <MenuItem onClick={onStartOver}>Start over</MenuItem>
              </MenuPopup>
            </Menu>
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Send message"
              className="ml-auto"
              disabled={pending || text.trim() === ""}
            >
              <RiArrowUpLine aria-hidden="true" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
