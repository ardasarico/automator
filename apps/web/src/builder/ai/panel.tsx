"use client";

import "streamdown/styles.css";

import type { AiStatusPhase } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { RiCloseLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { useAccessToken } from "../../auth/access-token";
import { takePendingPrompt } from "../../home/pending-prompt";
import { isFlowNode } from "../document";
import { useBuilderStore } from "../store-provider";
import { useChatStore, useChatStoreApi } from "./chat-store-provider";
import { Composer } from "./composer";
import { Message } from "./message";
import styles from "./panel.module.css";
import { describeAiFailure, formatElapsed, listAiMessages } from "./transport";
import { useSendMessage } from "./use-send-message";

/* Openers that show the range of what the agent handles, so the panel is not a blank column. */
const startSuggestions = [
  "Every hour, check my USDC balance and post it to Discord",
  "A mini-app that collects an email and saves it to a table",
  "When a webhook arrives, classify it with AI and route each kind",
];

const editSuggestions = [
  "Add a condition before the last step",
  "Send a Discord message when this fails",
  "What does this flow do?",
];

const phaseLabels: Record<AiStatusPhase, string> = {
  thinking: "Drafting",
  checking: "Checking the flow",
  repairing: "Repairing the flow",
};

/** Mounted only while a turn is in flight, so each wait starts its own count at zero. */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    // Measured against the clock, not counted in ticks: a throttled tab must not undercount.
    const started = Date.now();
    const timer = setInterval(() => setSeconds((Date.now() - started) / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className={styles.elapsed}>{formatElapsed(seconds)}</span>;
}

function EmptyState({ onPick }: { onPick(text: string): void }) {
  const hasNodes = useBuilderStore((state) => state.nodes.some(isFlowNode));
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>
        {hasNodes ? "Ask for a change to this flow" : "Describe the flow you want"}
      </p>
      <p>
        {hasNodes
          ? "Or ask a question about it. Nothing lands on the canvas until you apply the draft."
          : "The canvas is empty, so the first answer becomes a new flow. Nothing lands on it until you apply the draft."}
      </p>
      {/* The panel is a blank column until someone knows what to type into it. */}
      <ul className={styles.suggestions} aria-label="Suggestions">
        {(hasNodes ? editSuggestions : startSuggestions).map((suggestion) => (
          <li key={suggestion}>
            <button type="button" className={styles.suggestion} onClick={() => onPick(suggestion)}>
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AiPanel() {
  const getAccessToken = useAccessToken();
  const flowId = useBuilderStore((state) => state.meta.id);
  const previewing = useBuilderStore((state) => state.preview !== null);
  const messages = useChatStore((state) => state.messages);
  const streamingId = useChatStore((state) => state.streamingId);
  const pending = useChatStore((state) => state.pending);
  const phase = useChatStore((state) => state.phase);
  const focusRequests = useChatStore((state) => state.focusRequests);
  const load = useChatStore((state) => state.load);
  const loaded = useChatStore((state) => state.loaded);
  const chatApi = useChatStoreApi();
  const { send, stop, apply, discard, startOver } = useSendMessage();
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  /*
   * The stored conversation, once per flow. The guard is the request's own key rather than this
   * effect's lifetime: Strict Mode mounts, unmounts and mounts again, and an answer that arrives
   * after that must still land. Another flow, or the retry button, moves the key and wins.
   */
  const loadedKey = useRef<string | null>(null);
  useEffect(() => {
    const key = `${flowId}:${attempt}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    void (async () => {
      try {
        const stored = await listAiMessages(await getAccessToken(), flowId);
        if (loadedKey.current !== key) return;
        // A turn that started while the list was in flight owns the thread; it is the newer one.
        if (chatApi.getState().messages.length === 0) load(stored);
        setLoadError(null);
      } catch (error) {
        if (loadedKey.current !== key) return;
        setLoadError(describeAiFailure(error));
      }
    })();
  }, [attempt, chatApi, flowId, getAccessToken, load]);

  useEffect(() => {
    const element = thread.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, pending]);

  /*
   * Home creates the flow and puts the prompt in session storage; the first turn is sent from
   * here, so the stream is visible from the first second. Read once: a reload does not re-ask.
   */
  const latestSend = useRef(send);
  useEffect(() => {
    latestSend.current = send;
  });
  const handedOver = useRef(false);
  const settled = loaded || loadError !== null;
  useEffect(() => {
    /* The stored conversation is asked for first, so the handed-over turn is not overwritten. */
    if (handedOver.current || focusRequests === 0 || !settled) return;
    handedOver.current = true;
    const text = takePendingPrompt();
    if (text !== null) void latestSend.current(text);
  }, [focusRequests, settled]);

  /* Streaming text is not announced; the end of the turn is, once, in a stable region. */
  const [announcement, setAnnouncement] = useState("");
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending) {
      const failed = messages.at(-1)?.parts.some((part) => part.type === "error") ?? false;
      setAnnouncement(failed ? "The turn ended with an error." : "The answer is ready.");
    }
    wasPending.current = pending;
  }, [messages, pending]);

  return (
    <div className={styles.panel}>
      {previewing && (
        <p className={styles.note}>
          Previewing the draft on the canvas. Apply or discard it to edit.
        </p>
      )}
      <div
        ref={thread}
        className={styles.thread}
        role="log"
        aria-live="off"
        aria-label="AI conversation"
      >
        {/* A wide panel must not widen the text with it: the turns keep a readable measure. */}
        <div className={styles.threadInner}>
          {loadError !== null && messages.length === 0 ? (
            <div className={styles.empty}>
              <p>{loadError}</p>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAttempt(attempt + 1)}
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : (
            <>
              {messages.length === 0 && !pending && (
                <EmptyState onPick={(text) => void send(text)} />
              )}
              {messages.map((message, index) => (
                <Message
                  key={message.id}
                  message={message}
                  streaming={message.id === streamingId}
                  last={index === messages.length - 1}
                  onSend={(text) => void send(text)}
                  onApply={(messageId) => void apply(messageId)}
                  onDiscard={(messageId) => void discard(messageId)}
                />
              ))}
              {pending && (
                <div className={styles.waiting}>
                  <span>{phaseLabels[phase ?? "thinking"]}</span>
                  <Elapsed />
                  <Button type="button" variant="ghost" size="sm" onClick={stop}>
                    <RiCloseLine aria-hidden="true" />
                    Stop
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <Composer onSend={(text) => void send(text)} onStartOver={() => void startOver()} />
    </div>
  );
}
