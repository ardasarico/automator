"use client";

import type { PreviewTemplate } from "./schema";

const placeholder = /\{\{\s*([^{}]+?)\s*\}\}/g;

function paths(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(placeholder)) {
    const path = match[1]!.trim();
    if (path !== "" && !found.includes(path)) found.push(path);
  }
  return found;
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
    <dl className="flex flex-col gap-0.5 text-caption text-muted-foreground">
      {found.map((path) => {
        const value = preview(path);
        return (
          <div key={path} className="flex min-w-0 items-baseline gap-1.5">
            <dt className="shrink-0 font-mono text-xs">{`{{${path}}}`}</dt>
            <dd className="min-w-0 truncate">
              {value.status === "value"
                ? value.text
                : value.status === "secret"
                  ? "hidden"
                  : "not set in this run"}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
