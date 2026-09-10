"use client";

import { Button } from "@automator/ui/button";
import { RiArrowUpLine } from "@remixicon/react";
import { useState } from "react";
import { appUrl } from "../app-url";

/**
 * The landing has no API and no session, so the sentence is not drafted here — it travels to the
 * workspace in the query string, which is the only channel two origins share, and the app picks
 * it up after sign-in.
 */
export function HeroPrompt() {
  const [text, setText] = useState("");
  return (
    <form
      action={appUrl}
      method="get"
      className="mt-6 flex w-full max-w-[720px] flex-col rounded-lg border border-input bg-[color-mix(in_srgb,var(--background)_82%,transparent)] p-1.5 shadow-[0_8px_32px_color-mix(in_srgb,var(--foreground)_10%,transparent)] backdrop-blur-md transition-colors focus-within:border-ring"
    >
      <textarea
        name="prompt"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        placeholder="Swap 100 USDC for ETH every Monday…"
        maxLength={1000}
        rows={2}
        aria-label="Describe the flow you want"
        className="field-sizing-content block max-h-[11lh] min-h-[3lh] w-full resize-none border-0 bg-transparent px-3 pt-3 pb-1 text-body text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex items-center justify-end px-1.5 pt-1 pb-1.5">
        <Button
          type="submit"
          size="icon-xl"
          aria-label="Draft the flow"
          className="flex-none rounded-full"
        >
          <RiArrowUpLine aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
