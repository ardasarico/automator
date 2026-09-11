"use client";

import { Button } from "@automator/ui/button";
import { RiArrowUpLine, RiCloseLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  describeAiFailure,
  formatElapsed,
  generateFlowRequest,
  storeAiAnswer,
} from "../builder/ai-client";
import { useAccessToken } from "../auth/access-token";
import { createFlowAction } from "../flows/actions";
import { HeroBackdrop } from "./hero-backdrop";
import { captureHandoffPrompt, storePendingPrompt, takeHandoffPrompt } from "./pending-prompt";
import styles from "./home.module.css";

/** What the box accepts, and so what a prompt handed over from the landing page is cut to. */
const promptMaxLength = 4000;

/** Mounted only while a draft is in flight, so each wait starts its own count at zero. */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    // Measured against the clock, not counted in ticks: a throttled tab must not undercount.
    const started = Date.now();
    const timer = setInterval(() => setSeconds((Date.now() - started) / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="tabular-nums">{formatElapsed(seconds)}</span>;
}

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
 * The model answers before anything is saved, so the wait happens here and has to be legible:
 * how long it has taken, what it covers, and a way out of it. The seconds are measured, so
 * nothing here claims progress the page cannot see.
 */
function Drafting({ onStop }: { onStop(): void }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 px-3 pb-2 text-caption">
      <span>
        Drafting the flow… <Elapsed />
      </span>
      <span className="text-muted-foreground">
        It drafts, checks the result, and repairs it once if the checks fail.
      </span>
      <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onStop}>
        <RiCloseLine aria-hidden="true" />
        Stop
      </Button>
    </p>
  );
}

/**
 * The prompt asks the model from here and hands the answer to the canvas: the flow is created
 * only once there is something to put in it, so a draft that fails or is stopped leaves no empty
 * "Untitled flow" behind. The builder's AI panel replays the question and the answer on mount,
 * so the nodes are still reviewed where they will be edited.
 *
 * A prompt from the landing page is drafted the same way: it is put in the box and the form
 * submitted, so the visitor sees the sentence they typed, the wait and any failure exactly as if
 * they had sent it from here.
 */
export function HomePrompt() {
  const getAccessToken = useAccessToken();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
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
      /* Shown in the box like a typed sentence: the wait, and any failure, then read the same. */
      prompt = handed.current.trim();
      setText(handed.current);
      handed.current = null;
    }
    if (prompt === "") return;
    setError(null);
    const controller = new AbortController();
    request.current = controller;
    let answer;
    try {
      answer = await generateFlowRequest(await getAccessToken(), { prompt }, controller.signal);
    } catch (caught) {
      if (!controller.signal.aborted) setError(describeAiFailure(caught));
      return;
    } finally {
      if (request.current === controller) request.current = null;
    }
    storePendingPrompt(prompt);
    storeAiAnswer(answer);
    /* Creating redirects, so anything it answers with is a failure worth showing: the draft is
     * already in hand and the sentence is still in the box to send again. */
    const created = await createFlowAction({ ai: true });
    if (created?.error) setError(created.error);
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
          placeholder="Swap 100 USDC for ETH every Monday…"
          maxLength={promptMaxLength}
          rows={2}
          aria-label="Describe the flow you want"
        />
        <Drafting onStop={() => request.current?.abort()} />
        {/* The reason the model gives, not a shrug: the prompt stays in the box to be rephrased. */}
        {error !== null && (
          <p
            role="alert"
            className="whitespace-pre-line px-3 pb-2 text-caption text-destructive-text"
          >
            {error}
          </p>
        )}
        {/* The send key sits under the text, so a sentence runs the full width of the box. */}
        <div className={styles.controls}>
          <Send />
        </div>
      </form>
    </div>
  );
}
