"use client";

import { Button } from "@automator/ui/button";
import { RiArrowUpLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createFlowAction } from "../flows/actions";
import { HeroBackdrop } from "./hero-backdrop";
import {
  captureHandoffPrompt,
  clearPendingPrompt,
  storePendingPrompt,
  takeHandoffPrompt,
} from "./pending-prompt";
import styles from "./home.module.css";

/** What the box accepts, and so what a prompt handed over from the landing page is cut to. */
const promptMaxLength = 4000;

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
 *
 * A prompt from the landing page goes the same way: it is put in the box and the form submitted,
 * so the visitor sees the sentence they typed leave for the canvas exactly as if they had sent it
 * from here.
 */
export function HomePrompt() {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  /* The landing page's sentence, between being taken from storage and being sent as the form. */
  const handed = useRef<string | null>(null);

  useEffect(() => {
    /* Arriving from the landing page, straight in or by way of the login page. */
    captureHandoffPrompt();
    handed.current = takeHandoffPrompt()?.slice(0, promptMaxLength) ?? null;
    if (handed.current !== null) form.current?.requestSubmit();
    /* Arriving from "Describe it to AI" on Flows: the box is what that card promised. */
    if (new URLSearchParams(window.location.search).has("draft")) input.current?.focus();
  }, []);

  async function draft(fields: FormData) {
    let prompt = String(fields.get("prompt") ?? "").trim();
    if (handed.current !== null) {
      /* Shown in the box like a typed sentence, so a create that fails leaves it there to resend. */
      prompt = handed.current.trim();
      setText(handed.current);
      handed.current = null;
    }
    if (prompt === "") return;
    storePendingPrompt(prompt);
    /* A create that failed never redirects, so the prompt would be waiting for whichever flow
     * the reader opened next and be sent there instead. */
    if ((await createFlowAction({ ai: true }))?.error) clearPendingPrompt();
  }

  return (
    <div className={styles.hero}>
      <HeroBackdrop />
      <h1 className={styles.title}>What should we automate?</h1>
      <form ref={form} action={draft} className={styles.box}>
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
          placeholder="Post to Discord when our treasury drops below 500 USDC…"
          maxLength={promptMaxLength}
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
