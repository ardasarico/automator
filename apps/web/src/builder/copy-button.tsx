"use client";

import { Button } from "@automator/ui/button";
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useState } from "react";

/** Copies `text` and shows a check for a moment. The label doubles as the accessible name. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={copied ? "Copied" : label}
      onClick={() => {
        if (!navigator.clipboard) {
          setCopied(false);
          return;
        }
        navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? <RiCheckLine /> : <RiFileCopyLine />}
    </Button>
  );
}
