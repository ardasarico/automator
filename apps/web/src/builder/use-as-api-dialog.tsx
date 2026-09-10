"use client";

import { flowApiSchema } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@automator/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { Switch } from "@automator/ui/switch";
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiCurlSnippet, apiInvokeUrl } from "./api-snippets";
import { useBuilderStore } from "./store-provider";
import { useFlowEnabled } from "./use-flow-enabled";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="outline"
      size="sm"
      aria-live="polite"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? <RiCheckLine aria-hidden="true" /> : <RiFileCopyLine aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * How to call this one flow over HTTP: where it lives, what it takes, and whether it is on. The
 * example is built from the trigger's own declaration, so it cannot describe a call the endpoint
 * would refuse.
 */
export function ApiHttpSection({ unsaved }: { unsaved: boolean }) {
  const meta = useBuilderStore((state) => state.meta);
  /* Select the stored array itself: mapping inside the selector would build fresh objects on
   * every render, and a shallow compare over those never settles. */
  const nodes = useBuilderStore((state) => state.nodes);
  const schema = useMemo(
    () =>
      flowApiSchema({
        name: meta.name,
        nodes: nodes.map((node) => ({ type: node.data.type, config: node.data.config })),
      }),
    [meta.name, nodes],
  );
  const { enabled, toggling, error, blockers, toggle } = useFlowEnabled();
  const url = apiInvokeUrl(meta.id);

  if (!schema)
    return (
      <p role="status" className="text-caption text-warning-foreground">
        This flow has no API call trigger, so it has no endpoint. Add one from the Triggers group
        and declare the values a caller sends.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {unsaved && (
        <p role="status" className="text-caption text-warning-foreground">
          Unsaved changes are not published. Save the flow so callers get this version.
        </p>
      )}
      <Field>
        <FieldLabel htmlFor="api-endpoint">Endpoint</FieldLabel>
        <Input
          id="api-endpoint"
          readOnly
          value={url}
          className="font-mono text-xs"
          onFocus={(event) => event.target.select()}
        />
        <FieldDescription>
          Takes a POST of{" "}
          {schema.inputs.length === 0
            ? "an empty JSON object — this flow declares no inputs yet"
            : `${schema.inputs.map((input) => input.name).join(", ")} as JSON`}
          {schema.outputs.length > 0 && ` and answers with ${schema.outputs.join(", ")}`}.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Example call</FieldLabel>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs">
          {apiCurlSnippet(url, schema.inputs)}
        </pre>
        <FieldDescription>
          Machines call the API host directly, so no key of yours goes through the browser. Create
          one under <Link href="/connections">Connections</Link>; it is shown once.
        </FieldDescription>
      </Field>
      <Field className="flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="api-active">Active</FieldLabel>
          <FieldDescription>
            The endpoint answers only while the saved flow is on, exactly as a webhook does.
          </FieldDescription>
        </div>
        <Switch
          id="api-active"
          checked={enabled}
          disabled={toggling}
          onCheckedChange={(checked) => void toggle(checked)}
        />
      </Field>
      {error && (
        <p role="alert" className="text-caption text-destructive-text">
          {error}
        </p>
      )}
      {blockers && blockers.length > 0 && (
        <div role="alert" className="flex flex-col gap-1">
          <p className="text-caption text-destructive-text">
            This flow still has problems, so it was not turned on. Fix them, save, and try again.
          </p>
          <ul className="list-disc pl-4 text-caption text-muted-foreground">
            {blockers.map((problem, index) => (
              <li key={`${problem.nodeId ?? "flow"}-${index}`}>{problem.message}</li>
            ))}
          </ul>
        </div>
      )}
      {blockers && blockers.length === 0 && (
        <p role="alert" className="text-caption text-destructive-text">
          The saved flow has problems this editor cannot see, so it was not turned on. Reload the
          page to fetch the saved flow, then check its problems list.
        </p>
      )}
      <CopyButton text={apiCurlSnippet(url, schema.inputs)} label="Copy example" />
    </div>
  );
}

export function UseAsApiDialog({ onClose, unsaved }: { onClose: () => void; unsaved: boolean }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Use as API</DialogTitle>
          <DialogDescription>
            An active flow that starts at an API call trigger answers over HTTP, and through the MCP
            server, with the inputs it declares.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-6">
          <ApiHttpSection unsaved={unsaved} />
          {/* The MCP server section (automator-74's <McpSection />) mounts here on merge. */}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
