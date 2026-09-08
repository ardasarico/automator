"use client";

import { Button } from "@automator/ui/button";
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useState } from "react";

export function CopyAddressButton({ address }: { address: string }) {
  const [state, setState] = useState<"idle" | "pending" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    setState("pending");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
      await navigator.clipboard.writeText(address);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={state === "copied" ? "Address copied" : "Copy address"}
        disabled={state === "pending"}
        onClick={copy}
      >
        {state === "copied" ? (
          <RiCheckLine aria-hidden="true" />
        ) : (
          <RiFileCopyLine aria-hidden="true" />
        )}
      </Button>
      <span
        className={state === "failed" ? "text-caption text-destructive-text" : "sr-only"}
        role="status"
      >
        {state === "failed"
          ? "Could not copy. Select and copy the wallet address."
          : state === "copied"
            ? "Wallet address copied"
            : state === "pending"
              ? "Copying wallet address"
              : ""}
      </span>
    </>
  );
}
