"use client";

import { Button } from "@automator/ui/button";
import { RiArrowUpLine } from "@remixicon/react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createFlowAction } from "../flows/actions";
import { HeroBackdrop } from "./hero-backdrop";
import { storePendingPrompt } from "./pending-prompt";
import styles from "./home.module.css";

function Send() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className={styles.send} loading={pending}>
      Draft the flow
      <RiArrowUpLine aria-hidden="true" />
    </Button>
  );
}

/**
 * The prompt hands its text to the canvas rather than answering here: the flow is created
 * immediately and the builder's AI panel picks the prompt up on mount, so the nodes appear
 * where they will be edited instead of behind a spinner on this page.
 */
export function HomePrompt() {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  async function draft(form: FormData) {
    const prompt = String(form.get("prompt") ?? "").trim();
    if (prompt === "") return;
    storePendingPrompt(prompt);
    await createFlowAction({ ai: true });
  }

  return (
    <div className={styles.hero}>
      <HeroBackdrop />
      <h1 className={styles.title}>What should we automate?</h1>
      <form action={draft} className={styles.box}>
        <textarea
          ref={input}
          name="prompt"
          className={styles.input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          placeholder="Swap 100 USDC for ETH every Monday…"
          maxLength={4000}
          rows={2}
          aria-label="Describe the flow you want"
        />
        {/* The send key sits under the text, so a sentence runs the full width of the box. */}
        <div className={styles.controls}>
          <Send />
        </div>
      </form>
    </div>
  );
}
