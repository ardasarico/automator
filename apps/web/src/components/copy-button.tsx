"use client";

import { Button } from "@automator/ui/button";
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";

type CopyState = "idle" | "pending" | "copied" | "failed";
type ButtonSize = NonNullable<ComponentProps<typeof Button>["size"]>;
type IconSize = Extract<ButtonSize, `icon${string}`>;
type TextSize = Exclude<ButtonSize, IconSize>;

/**
 * Puts text on the clipboard and says whether it got there. The property access itself throws
 * on an insecure origin, so the guard has to sit inside the try rather than in front of it.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type CommonProps = {
  /** The text to copy, or a function that produces it at click time (a URL needs the origin). */
  text: string | (() => string);
  /** What is being copied, as it reads in a sentence: "wallet address", "webhook URL". */
  what: string;
  /** The button's own wording; defaults to "Copy" and "Copied". */
  copyLabel?: string;
  copiedLabel?: string;
  icon?: ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
  onCopied?: () => void;
};

type CopyButtonProps =
  | (CommonProps & { iconOnly: true; size?: IconSize })
  | (CommonProps & { iconOnly?: false; size?: TextSize });

/**
 * The one copy control: a button that flips to a check for two seconds, announces the result to
 * screen readers, and says so in words when the clipboard refused rather than failing quietly.
 * With a visible label the icon sits before it; `iconOnly` puts the wording in the accessible name.
 */
export function CopyButton(props: CopyButtonProps) {
  const {
    text,
    what,
    copyLabel = "Copy",
    copiedLabel = "Copied",
    icon,
    variant = "outline",
    className,
    onCopied,
  } = props;
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state !== "copied" && state !== "failed") return;
    const timer = setTimeout(() => setState("idle"), state === "copied" ? 2000 : 6000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    setState("pending");
    const ok = await copyToClipboard(typeof text === "function" ? text() : text);
    setState(ok ? "copied" : "failed");
    if (ok) onCopied?.();
  }

  const copied = state === "copied";
  const glyph = copied ? (
    <RiCheckLine aria-hidden="true" />
  ) : (
    (icon ?? <RiFileCopyLine aria-hidden="true" />)
  );
  const shared = { type: "button" as const, variant, className, disabled: state === "pending" };

  return (
    <>
      {props.iconOnly ? (
        <Button
          {...shared}
          size={props.size ?? "icon-sm"}
          aria-label={`${copied ? copiedLabel : copyLabel} ${what}`}
          onClick={copy}
        >
          {glyph}
        </Button>
      ) : (
        <Button {...shared} size={props.size ?? "sm"} onClick={copy}>
          {glyph}
          {copied ? copiedLabel : copyLabel}
          <span className="sr-only"> {what}</span>
        </Button>
      )}
      <span
        className={state === "failed" ? "text-caption text-destructive-text" : "sr-only"}
        role="status"
      >
        {state === "failed"
          ? `Could not copy. Select and copy the ${what} instead.`
          : copied
            ? `${capitalize(what)} copied`
            : ""}
      </span>
    </>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
