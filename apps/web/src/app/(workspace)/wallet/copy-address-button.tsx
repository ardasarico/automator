"use client";

import { Button } from "@automator/ui/button";
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useState } from "react";

/** Copies the address; the icon turns into a check for two seconds and a live region says so. */
export function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? "Address copied" : "Copy address"}
        onClick={copy}
      >
        {copied ? <RiCheckLine aria-hidden="true" /> : <RiFileCopyLine aria-hidden="true" />}
      </Button>
      <span className="sr-only" role="status">
        {copied ? "Wallet address copied" : ""}
      </span>
    </>
  );
}
