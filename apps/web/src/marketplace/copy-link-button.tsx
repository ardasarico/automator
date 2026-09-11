"use client";

import { RiLinkM } from "@remixicon/react";
import { CopyButton } from "../components/copy-button";

/** Copies a page of this site by its path; the origin is only known in the browser. */
export function CopyLinkButton({ path, size }: { path: string; size?: "default" | "sm" }) {
  return (
    <CopyButton
      text={() => new URL(path, window.location.origin).toString()}
      what="link"
      copyLabel="Copy link"
      copiedLabel="Link copied"
      icon={<RiLinkM aria-hidden="true" />}
      size={size ?? "default"}
    />
  );
}
