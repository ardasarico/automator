"use client";

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
import { Textarea } from "@automator/ui/textarea";
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useState, type FormEvent } from "react";
import { FlowRequestError, setFlowEnabledRequest } from "../flows/client";
import { EnableSigningButton } from "./enable-signing-button";
import { useFlowActivation } from "./flow-activation";
import { useBuilderStore } from "./store-provider";
import { useAccessToken } from "../auth/access-token";

const nameLimit = 120;
const descriptionLimit = 1000;

const activationFailures: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This flow no longer exists.",
};

/** Copies text to the clipboard; the icon confirms for two seconds. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={copied ? "Copied" : label}
      aria-live="polite"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <RiCheckLine aria-hidden="true" /> : <RiFileCopyLine aria-hidden="true" />}
    </Button>
  );
}

/**
 * Name and description are document state (Apply, then Save persists them). Activation and
 * the run mode are not: the Active switch saves through its own request straight away, and
 * "Send real transactions" only changes how Simulate runs on this canvas.
 * Mount it to open it: each mount starts from the store's current meta.
 */
export function FlowSettingsDialog({ onClose }: { onClose: () => void }) {
  const getAccessToken = useAccessToken();
  const meta = useBuilderStore((state) => state.meta);
  const setMeta = useBuilderStore((state) => state.setMeta);
  const hasWebhook = useBuilderStore((state) =>
    state.nodes.some((node) => node.data.type === "trigger.webhook"),
  );
  const hasSchedule = useBuilderStore((state) =>
    state.nodes.some((node) => node.data.type === "trigger.schedule"),
  );
  const activation = useFlowActivation();
  const [name, setName] = useState(meta.name);
  const [description, setDescription] = useState(meta.description);
  const [toggling, setToggling] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const trimmedName = name.trim();
  const webhookUrl =
    activation.webhookToken && typeof window !== "undefined"
      ? `${window.location.origin}/api/hooks/${encodeURIComponent(meta.id)}/${activation.webhookToken}`
      : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmedName) return;
    if (trimmedName !== meta.name || description !== meta.description)
      setMeta({ name: trimmedName, description });
    onClose();
  }

  async function toggle(enabled: boolean) {
    setToggling(true);
    setActivationError(null);
    try {
      const record = await setFlowEnabledRequest(meta.id, await getAccessToken(), enabled);
      activation.setEnabled(record.enabled ?? enabled);
    } catch (caught) {
      const code = caught instanceof FlowRequestError ? caught.code : "unavailable";
      setActivationError(
        activationFailures[code] ?? "The change could not be saved. Please try again.",
      );
    } finally {
      setToggling(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Flow settings</DialogTitle>
            <DialogDescription>
              The name appears in your flows list and run history. Save the flow to keep name and
              description changes.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                name="name"
                value={name}
                maxLength={nameLimit}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea
                name="description"
                value={description}
                maxLength={descriptionLimit}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field className="flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="flow-active">Active</FieldLabel>
                <FieldDescription>
                  {hasWebhook || hasSchedule
                    ? "Lets the webhook and schedule triggers of the saved flow start runs."
                    : "Add a Webhook or Schedule trigger, then turn this on so it runs on its own."}
                </FieldDescription>
              </div>
              <Switch
                id="flow-active"
                checked={activation.enabled}
                disabled={toggling}
                onCheckedChange={(checked) => void toggle(checked)}
              />
            </Field>
            {activationError && (
              <p role="alert" className="text-caption text-destructive-text">
                {activationError}
              </p>
            )}
            {hasWebhook && webhookUrl && (
              <Field>
                <FieldLabel htmlFor="flow-webhook-url">Webhook URL</FieldLabel>
                <div className="flex w-full items-center gap-2">
                  <Input
                    id="flow-webhook-url"
                    readOnly
                    value={webhookUrl}
                    className="min-w-0 flex-1 font-mono text-xs"
                    onFocus={(event) => event.target.select()}
                  />
                  <CopyButton text={webhookUrl} label="Copy webhook URL" />
                </div>
                <FieldDescription>
                  POST anything here while the flow is active; the request becomes the
                  trigger&apos;s payload. Anyone with this URL can start the flow.
                </FieldDescription>
              </Field>
            )}
            <Field className="flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="flow-live-mode">Send real transactions</FieldLabel>
                <FieldDescription>
                  Simulate runs onchain nodes for real instead of as a dry run. Webhook and
                  scheduled runs are always live.
                </FieldDescription>
              </div>
              <Switch
                id="flow-live-mode"
                checked={activation.liveMode}
                onCheckedChange={activation.setLiveMode}
              />
            </Field>
            <Field>
              <FieldLabel>Server signing</FieldLabel>
              <EnableSigningButton />
            </Field>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmedName}>
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
