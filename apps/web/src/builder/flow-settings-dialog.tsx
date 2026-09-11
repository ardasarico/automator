"use client";

import { chains, defaultChainId, isChainId, isSignerNodeType } from "@automator/contracts";
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
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import { Switch } from "@automator/ui/switch";
import { Textarea } from "@automator/ui/textarea";
import { useState, type FormEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { CopyButton } from "../components/copy-button";
import { EnableSigningButton } from "./enable-signing-button";
import { useFlowActivation } from "./flow-activation";
import { selectFlowNodes } from "./store";
import { useBuilderStore } from "./store-provider";
import { getCatalogEntry } from "./catalog";
import { useFlowEnabled } from "./use-flow-enabled";
import { needsSigning, useWalletSigning } from "./use-wallet-signing";
import { TriggerIssues } from "./trigger-issues";
import { WalletFunds } from "./wallet-funds";

const nameLimit = 120;
const chainItems = chains.map((chain) => ({ value: String(chain.id), label: chain.name }));
const descriptionLimit = 1000;

export function FlowSettingsDialog({ onClose }: { onClose: () => void }) {
  const meta = useBuilderStore((state) => state.meta);
  const setMeta = useBuilderStore((state) => state.setMeta);
  const hasWebhook = useBuilderStore((state) =>
    selectFlowNodes(state).some((node) => node.data.type === "trigger.webhook"),
  );
  const hasSchedule = useBuilderStore((state) =>
    selectFlowNodes(state).some((node) => node.data.type === "trigger.schedule"),
  );
  const hasEvent = useBuilderStore((state) =>
    selectFlowNodes(state).some((node) => node.data.type === "trigger.onchain-event"),
  );
  const hasWatch = useBuilderStore((state) =>
    selectFlowNodes(state).some(
      (node) => node.data.type === "trigger.price" || node.data.type === "trigger.balance",
    ),
  );
  const hasUnattended = hasWebhook || hasSchedule || hasEvent || hasWatch;
  const signerLabels = useBuilderStore(
    useShallow((state) =>
      selectFlowNodes(state)
        .filter((node) => isSignerNodeType(node.data.type))
        .map((node) => node.data.label || getCatalogEntry(node.data.type).label),
    ),
  );
  const dirty = useBuilderStore((state) => state.dirty);
  const activation = useFlowActivation();
  const [name, setName] = useState(meta.name);
  const [description, setDescription] = useState(meta.description);
  const [chainId, setChainId] = useState(meta.chainId ?? defaultChainId);
  // A live paying flow fails every run at its first signer node until the owner's wallet lets
  // the server sign; the switch waits for that, and the API refuses it too.
  const signing = useWalletSigning(signerLabels.length > 0 && !activation.enabled, chainId);
  const signingOff = signerLabels.length > 0 && signing.status === "disabled";
  const { toggling, error: activationError, blockers, toggle } = useFlowEnabled();
  const trimmedName = name.trim();
  const webhookUrl =
    activation.webhookToken && typeof window !== "undefined"
      ? `${window.location.origin}/api/hooks/${encodeURIComponent(meta.id)}/${activation.webhookToken}`
      : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmedName) return;
    const chainChanged = chainId !== (meta.chainId ?? defaultChainId);
    if (trimmedName !== meta.name || description !== meta.description || chainChanged)
      setMeta({ name: trimmedName, description, ...(chainChanged ? { chainId } : {}) });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-md">
        <form className="flex min-h-0 flex-col" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Flow settings</DialogTitle>
            <DialogDescription>
              The name appears in your flows list and run history. Save the flow to keep name and
              description changes. Activation and transaction mode changes take effect immediately.
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
            <Field>
              <FieldLabel htmlFor="flow-chain">Chain</FieldLabel>
              <Select
                items={chainItems}
                value={String(chainId)}
                onValueChange={(next) => {
                  const id = Number(next);
                  if (isChainId(id)) setChainId(id);
                }}
              >
                <SelectTrigger id="flow-chain" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {chainItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <FieldDescription>
                Where the onchain nodes read, write and listen. Save the flow to keep the change.
              </FieldDescription>
            </Field>
            <Field className="flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="flow-active">Active</FieldLabel>
                <FieldDescription>
                  {hasUnattended
                    ? "Lets webhook, scheduled, onchain-event, price and balance triggers in the saved flow start runs."
                    : "Add a Webhook, Schedule, Onchain event, Price or Balance trigger, then turn this on so it runs on its own."}
                </FieldDescription>
              </div>
              <Switch
                id="flow-active"
                checked={activation.enabled}
                disabled={toggling || (!activation.enabled && signingOff)}
                onCheckedChange={(checked) => void toggle(checked)}
              />
            </Field>
            {!activation.enabled && signingOff && (
              <p role="status" data-signing="off" className="text-caption text-warning-foreground">
                {needsSigning(signerLabels)} server signing, which is off for your wallet. Enable it
                under Server signing below, then turn the flow on.
              </p>
            )}
            {activationError && (
              <p role="alert" className="text-caption text-destructive-text">
                {activationError}
              </p>
            )}
            {blockers && blockers.length > 0 && (
              <div role="alert" className="flex flex-col gap-1">
                <p className="text-caption text-destructive-text">
                  This flow still has problems, so it was not turned on. Fix them, save, and try
                  again.
                </p>
                <ul className="text-caption text-muted-foreground list-disc pl-4">
                  {blockers.map((problem, index) => (
                    <li key={`${problem.nodeId ?? "flow"}-${index}`}>{problem.message}</li>
                  ))}
                </ul>
                {dirty && (
                  <p className="text-caption text-muted-foreground">
                    The check reads the saved flow, not your unsaved edits.
                  </p>
                )}
              </div>
            )}
            {/* The canvas found nothing, yet the saved flow was refused: the two disagree, which a
             * flow saved before a check existed can do. Never show a refusal over an empty list. */}
            {blockers && blockers.length === 0 && (
              <div role="alert" className="flex flex-col gap-1">
                <p className="text-caption text-destructive-text">
                  The saved flow has problems this editor cannot see, so it was not turned on.
                </p>
                <p className="text-caption text-muted-foreground">
                  {dirty
                    ? "Save your changes and try again."
                    : "Reload the page to fetch the saved flow, then check its problems list."}
                </p>
              </div>
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
                  <CopyButton iconOnly text={webhookUrl} what="webhook URL" />
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
                  Changes Simulate to Run live so onchain nodes send real transactions. Webhook,
                  scheduled, onchain-event, price and balance runs are always live.
                </FieldDescription>
              </div>
              <Switch
                id="flow-live-mode"
                checked={activation.liveMode}
                onCheckedChange={activation.setLiveMode}
              />
            </Field>
            {(hasSchedule || hasEvent || hasWatch) && <TriggerIssues flowId={meta.id} />}
            <WalletFunds chainId={chainId} />
            <Field>
              <FieldLabel>Server signing</FieldLabel>
              <EnableSigningButton onVerified={signing.refresh} />
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
