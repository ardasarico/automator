"use client";

import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@automator/ui/menu";
import { Textarea } from "@automator/ui/textarea";
import { RiArrowUpLine, RiMoreLine } from "@remixicon/react";
import { useEffect, useRef } from "react";
import { isFlowNode } from "../document";
import { useBuilderStore } from "../store-provider";
import { useChatStore } from "./chat-store-provider";
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
  const mode = useChatStore((state) => state.mode);
  const setMode = useChatStore((state) => state.setMode);
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
    <form
      className={styles.composer}
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
            hasNodes && mode === "edit"
              ? "Add a condition before the Discord message"
              : "When a webhook fires, post the payload to Discord"
          }
          value={text}
          onChange={(event) => {
            setDraftPrompt(event.target.value);
            grow(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
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
            {hasNodes && (
              <>
                <MenuRadioGroup
                  value={mode}
                  onValueChange={(value) => setMode(value === "new" ? "new" : "edit")}
                >
                  <MenuRadioItem value="edit">Edit this flow</MenuRadioItem>
                  <MenuRadioItem value="new">Start a new flow</MenuRadioItem>
                </MenuRadioGroup>
                <MenuSeparator />
              </>
            )}
            <MenuItem onClick={onStartOver}>Start over</MenuItem>
          </MenuPopup>
        </Menu>
        <span className={styles.mode}>
          {hasNodes && mode === "edit" ? "Editing this flow" : "New flow"}
        </span>
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
  );
}
