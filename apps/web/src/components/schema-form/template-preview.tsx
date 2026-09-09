"use client";

import { useState } from "react";
import type { PreviewTemplate, TemplatePreview } from "./schema";

const placeholder = /\{\{\s*([^{}]+?)\s*\}\}/g;

function paths(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(placeholder)) {
    const path = match[1]!.trim();
    if (path !== "" && !found.includes(path)) found.push(path);
  }
  return found;
}

/** Past this a value is a block of its own rather than a word beside the template that named it. */
const longValue = 48;

/**
 * A resolved value, kept inside the panel. Anything an object or a long string resolves to used to
 * run off the right edge with nothing to open it, so a long one truncates and unfolds on click.
 */
function ResolvedValue({ value }: { value: TemplatePreview }) {
  const [expanded, setExpanded] = useState(false);
  if (value.status !== "value")
    return <span>{value.status === "secret" ? "hidden" : "not set in this run"}</span>;
  if (value.text.length <= longValue) return <span className="break-words">{value.text}</span>;
  return (
    <button
      type="button"
      title={value.text}
      aria-expanded={expanded}
      onClick={() => setExpanded((open) => !open)}
      className={`block w-full cursor-pointer text-left ${
        expanded ? "whitespace-pre-wrap break-words" : "truncate"
      }`}
    >
      {value.text}
    </button>
  );
}

/**
 * Shows what each template in a field resolved to in the run the caller offers, so a variable's
 * value sits beside the setting that uses it.
 */
export function TemplatePreviews({ text, preview }: { text: string; preview?: PreviewTemplate }) {
  if (!preview) return null;
  const found = paths(text);
  if (found.length === 0) return null;
  return (
    <dl className="flex w-full min-w-0 flex-col gap-0.5 text-caption text-muted-foreground">
      {found.map((path) => (
        <div key={path} className="flex min-w-0 items-baseline gap-1.5">
          <dt className="max-w-1/2 truncate font-mono text-xs" title={`{{${path}}}`}>
            {`{{${path}}}`}
          </dt>
          <dd className="min-w-0 flex-1">
            <ResolvedValue value={preview(path)} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
