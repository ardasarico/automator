"use client";

import { Button } from "@automator/ui/button";
import { RiCheckLine, RiLinkM } from "@remixicon/react";
import { useEffect, useState } from "react";

export function CopyLinkButton({ path, size }: { path: string; size?: "default" | "sm" }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button variant="outline" size={size} onClick={copy} aria-live="polite">
      {copied ? <RiCheckLine aria-hidden="true" /> : <RiLinkM aria-hidden="true" />}
      {copied ? "Link copied" : "Copy link"}
    </Button>
  );
}
