"use client";

import {
  chains,
  chainName,
  normalizePaymentPolicy,
  paymentPolicyProblem,
  type PaymentLimit,
  type PaymentPolicy,
  type PaymentPolicyState,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Input } from "@automator/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import { Switch } from "@automator/ui/switch";
import { Textarea } from "@automator/ui/textarea";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAccessToken } from "../../../auth/access-token";
import { useAuthSession } from "../../../auth/provider";
import { requestPaymentPolicy } from "../../../wallet/payment-policy-client";
import styles from "./wallet.module.css";

export function PaymentLimits() {
  const { user } = useAuthSession();
  return user ? <AccountPaymentLimits key={`${user.id}:${user.walletAddress}`} /> : null;
}

function AccountPaymentLimits() {
  const getAccessToken = useAccessToken();
  const loadToken = useEffectEvent(() => getAccessToken());
  const lifetime = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const savingRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PaymentPolicyState | null>(null);
  const [draft, setDraft] = useState<PaymentPolicy | null>(null);
  const [recipients, setRecipients] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void (async () => {
      try {
        const token = await loadToken();
        if (controller.signal.aborted) return;
        const result = await requestPaymentPolicy(token, controller.signal);
        if (controller.signal.aborted) return;
        setState(result);
        setDraft(result.policy);
        setRecipients(result.policy.recipients.join("\n"));
      } catch {
        if (!controller.signal.aborted) setError("Payment limits could not be loaded. Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  function edit(next: PaymentPolicy) {
    revision.current += 1;
    setDraft(next);
    setNotice("");
    setError(null);
  }
  const policy = draft
    ? {
        ...draft,
        recipients: recipients
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      }
    : null;
  const problem = policy ? paymentPolicyProblem(policy) : null;
  const dirty = policy && state ? JSON.stringify(policy) !== JSON.stringify(state.policy) : false;

  async function save() {
    if (!policy || problem || savingRef.current || !lifetime.current) return;
    const controller = lifetime.current;
    const submittedRevision = revision.current;
    const submitted = normalizePaymentPolicy(policy);
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const token = await getAccessToken();
      if (controller.signal.aborted) return;
      const result = await requestPaymentPolicy(token, controller.signal, submitted);
      if (controller.signal.aborted) return;
      setState(result);
      if (revision.current === submittedRevision) {
        setDraft(result.policy);
        setRecipients(result.policy.recipients.join("\n"));
        setNotice("Payment limits saved.");
      } else {
        setNotice("Earlier changes saved. Your latest edits are still unsaved.");
      }
    } catch {
      if (!controller.signal.aborted)
        setError("Could not confirm the save. Your edits are kept; try saving again.");
    } finally {
      if (!controller.signal.aborted) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  function updateLimit(index: number, patch: Partial<PaymentLimit>) {
    if (draft)
      edit({
        ...draft,
        limits: draft.limits.map((limit, row) => (row === index ? { ...limit, ...patch } : limit)),
      });
  }
  const available = chains
    .flatMap((chain) =>
      (["native", "usdc"] as const).map((asset) => ({ chainId: chain.id, asset })),
    )
    .find(
      (candidate) =>
        !draft?.limits.some(
          (limit) => limit.chainId === candidate.chainId && limit.asset === candidate.asset,
        ),
    );

  return (
    <section aria-labelledby="payment-limits-title" className="mt-6">
      <div className={styles.card}>
        <div>
          <h2 id="payment-limits-title" className="text-label">
            Payment limits
          </h2>
          <p className="mt-1 text-caption text-muted-foreground">
            Set limits for direct ETH and USDC sends through Automator. When enabled, other contract
            writes and signatures are unavailable. Gas fees and actions outside Automator are
            excluded.
          </p>
        </div>
        {loading ? (
          <p role="status" className="text-caption text-muted-foreground">
            Loading payment limits…
          </p>
        ) : !draft ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-caption text-destructive-foreground">
              {error}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry
            </Button>
          </div>
        ) : (
          <form
            className="flex min-w-0 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            aria-describedby="payment-limits-problem"
          >
            <div className="flex items-center gap-3">
              <Switch
                id="payment-limits-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) => edit({ ...draft, enabled })}
              />
              <label htmlFor="payment-limits-enabled" className="text-body">
                Enable payment limits
              </label>
            </div>
            <p className="text-caption text-muted-foreground">
              Save applies changes immediately. While enabled, only the chain and asset pairs listed
              below can be sent.
            </p>
            {draft.limits.map((limit, index) => (
              <fieldset
                key={index}
                className="grid min-w-0 gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                <legend className="px-1 text-caption">Limit {index + 1}</legend>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor={`payment-chain-${index}`} className="text-caption">
                    Chain
                  </label>
                  <Select
                    items={chains.map((chain) => ({ value: chain.id, label: chain.name }))}
                    value={limit.chainId}
                    onValueChange={(value) => {
                      if (value !== null) updateLimit(index, { chainId: value });
                    }}
                  >
                    <SelectTrigger id={`payment-chain-${index}`} className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {chains.map((chain) => (
                        <SelectItem key={chain.id} value={chain.id}>
                          {chain.name}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor={`payment-asset-${index}`} className="text-caption">
                    Asset
                  </label>
                  <Select
                    items={[
                      { value: "native", label: "ETH" },
                      { value: "usdc", label: "USDC" },
                    ]}
                    value={limit.asset}
                    onValueChange={(value) => {
                      if (value === "native" || value === "usdc")
                        updateLimit(index, { asset: value });
                    }}
                  >
                    <SelectTrigger id={`payment-asset-${index}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="native">ETH</SelectItem>
                      <SelectItem value="usdc">USDC</SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
                {(["perTransfer", "perDay"] as const).map((field) => (
                  <div key={field} className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={`payment-${field}-${index}`} className="text-caption">
                      {field === "perTransfer" ? "Per transfer" : "Per UTC day"} (
                      {limit.asset === "native" ? "ETH" : "USDC"})
                    </label>
                    <Input
                      id={`payment-${field}-${index}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={limit[field]}
                      onChange={(event) => updateLimit(index, { [field]: event.target.value })}
                      aria-describedby="payment-limits-problem"
                    />
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() =>
                    edit({ ...draft, limits: draft.limits.filter((_, row) => row !== index) })
                  }
                  aria-label={`Remove limit ${index + 1}`}
                >
                  Remove limit
                </Button>
              </fieldset>
            ))}
            <Button
              variant="outline"
              className="self-start"
              disabled={!available}
              onClick={() => {
                if (available)
                  edit({
                    ...draft,
                    limits: [...draft.limits, { ...available, perTransfer: "", perDay: "" }],
                  });
              }}
            >
              Add asset limit
            </Button>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="payment-recipients" className="text-caption">
                Allowed recipients
              </label>
              <Textarea
                id="payment-recipients"
                value={recipients}
                onChange={(event) => {
                  edit(draft);
                  setRecipients(event.target.value);
                }}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="payment-recipients-help payment-limits-problem"
              />
              <p id="payment-recipients-help" className="text-caption text-muted-foreground">
                One wallet address per line. Leave blank to allow any direct recipient.
              </p>
            </div>
            <p
              id="payment-limits-problem"
              role="status"
              className="text-caption text-destructive-foreground"
            >
              {problem}
            </p>
            {error && (
              <p role="alert" className="text-caption text-destructive-foreground">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!dirty || !!problem || saving} loading={saving}>
                Save limits
              </Button>
              <p role="status" className="text-caption text-muted-foreground">
                {notice || (dirty ? "Unsaved changes" : "")}
              </p>
            </div>
          </form>
        )}
        {state && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 className="text-caption">Reserved today · {state.day} UTC</h3>
            <p className="text-caption text-muted-foreground">
              Payment attempts reserve the daily budget, including uncertain failures. Editing or
              disabling limits keeps these reservations. Usage is a snapshot from the last load or
              save.
            </p>
            {state.usage.length ? (
              <ul className="flex flex-col gap-1 text-caption">
                {state.usage.map((usage) => (
                  <li key={`${usage.chainId}:${usage.asset}`} className="wrap-anywhere">
                    {chainName(usage.chainId)} · {usage.reserved}{" "}
                    {usage.asset === "native" ? "ETH" : "USDC"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-muted-foreground">
                No reserved payments for this UTC day.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
