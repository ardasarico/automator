"use client";

import { Button } from "@automator/ui/button";
import { RiArrowUpLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createFlowAction } from "../flows/actions";
import { HeroBackdrop } from "./hero-backdrop";
import { storePendingPrompt } from "./pending-prompt";
import styles from "./home.module.css";

function Send() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className={styles.send} loading={pending}>
      Open on the canvas
      <RiArrowUpLine aria-hidden="true" />
    </Button>
  );
}

/**
 * Home creates the flow and hands the prompt to the builder, which sends it as the first message
 * so the draft streams where it will be edited.
 */
export function HomePrompt() {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    /* Arriving from "Describe it to AI" on Flows: the box is what that card promised. */
    if (new URLSearchParams(window.location.search).has("draft")) input.current?.focus();
  }, []);

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
