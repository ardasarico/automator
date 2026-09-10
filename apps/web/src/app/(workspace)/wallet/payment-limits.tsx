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
import { RiCloseLine } from "@remixicon/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAccessToken } from "../../../auth/access-token";
import { useAuthSession } from "../../../auth/provider";
import { requestPaymentPolicy } from "../../../wallet/payment-policy-client";
import styles from "./wallet.module.css";

export function PaymentLimits() {
  const { user } = useAuthSession();
  return user ? <AccountPaymentLimits key={`${user.id}:${user.walletAddress}`} /> : null;
}

const assetLabel = (asset: PaymentLimit["asset"]) => (asset === "native" ? "ETH" : "USDC");

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
  /* What a pair has reserved today sits on that pair's row; a reservation whose rule is gone
   * is still owed, so it is listed under the rows rather than dropped. */
  const reservedFor = (limit: PaymentLimit) =>
    state?.usage.find((usage) => usage.chainId === limit.chainId && usage.asset === limit.asset);
  const orphaned =
    state?.usage.filter(
      (usage) =>
        !draft?.limits.some(
          (limit) => limit.chainId === usage.chainId && limit.asset === usage.asset,
        ),
    ) ?? [];

  return (
    <section aria-labelledby="payment-limits-title" className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2 id="payment-limits-title" className={styles.sectionTitle}>
            Payment limits
          </h2>
          <p className={styles.sectionText}>
            Caps on direct ETH and USDC sends through Automator. While enabled, only the pairs below
            can be sent and other contract writes and signatures are blocked; gas and activity
            outside Automator are not counted. Saving applies immediately.
          </p>
        </div>
        {draft && (
          <div className={styles.enable}>
            <Switch
              id="payment-limits-enabled"
              checked={draft.enabled}
              onCheckedChange={(enabled) => edit({ ...draft, enabled })}
              aria-label="Enable payment limits"
            />
            <label htmlFor="payment-limits-enabled">Enable payment limits</label>
          </div>
        )}
      </div>
      {loading ? (
        <p role="status" className={styles.line}>
          Loading payment limits…
        </p>
      ) : !draft ? (
        <div className={styles.status}>
          <p role="alert" className={styles.problem}>
            {error}
          </p>
          <Button
            variant="outline"
            size="sm"
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
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          aria-describedby="payment-limits-problem"
        >
          <div className={styles.limitsWrap}>
            <div className={styles.limits} role="table" aria-label="Limits per chain and asset">
              <div className={styles.limitsHead} role="row">
                <span role="columnheader">Chain</span>
                <span role="columnheader">Asset</span>
                <span role="columnheader">Per transfer</span>
                <span role="columnheader">Per UTC day</span>
                <span role="columnheader">Reserved today</span>
                <span role="columnheader">
                  <span className="sr-only">Remove</span>
                </span>
              </div>
              {draft.limits.length === 0 && (
                <p className={styles.noLimits} role="row">
                  <span role="cell">
                    No limits yet. Add one per chain and asset you want to cap.
                  </span>
                </p>
              )}
              {draft.limits.map((limit, index) => {
                const unit = assetLabel(limit.asset);
                const reserved = reservedFor(limit);
                return (
                  <div key={index} className={styles.limitRow} role="row">
                    <div role="cell">
                      <Select
                        items={chains.map((chain) => ({ value: chain.id, label: chain.name }))}
                        value={limit.chainId}
                        onValueChange={(value) => {
                          if (value !== null) updateLimit(index, { chainId: value });
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-full min-w-0"
                          aria-label={`Chain, limit ${index + 1}`}
                        >
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
                    <div role="cell">
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
                        <SelectTrigger
                          size="sm"
                          className="w-full min-w-0"
                          aria-label={`Asset, limit ${index + 1}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectItem value="native">ETH</SelectItem>
                          <SelectItem value="usdc">USDC</SelectItem>
                        </SelectPopup>
                      </Select>
                    </div>
                    {(["perTransfer", "perDay"] as const).map((field) => (
                      <div key={field} role="cell">
                        <Input
                          size="sm"
                          inputMode="decimal"
                          autoComplete="off"
                          value={limit[field]}
                          onChange={(event) => updateLimit(index, { [field]: event.target.value })}
                          aria-label={`${field === "perTransfer" ? "Per transfer" : "Per UTC day"} (${unit})`}
                          aria-describedby="payment-limits-problem"
                        />
                      </div>
                    ))}
                    <p role="cell" className={styles.reserved}>
                      {reserved?.reserved ?? "0"} <span>{unit}</span>
                    </p>
                    <div role="cell">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          edit({
                            ...draft,
                            limits: draft.limits.filter((_, row) => row !== index),
                          })
                        }
                        aria-label={`Remove limit ${index + 1}`}
                      >
                        <RiCloseLine aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.limitsFoot}>
            <Button
              variant="outline"
              size="sm"
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
            {state && (
              <p className={styles.also}>
                Reserved today counts {state.day} UTC and includes uncertain attempts; editing or
                disabling limits keeps it.
              </p>
            )}
          </div>
          {orphaned.length > 0 && (
            <div className={styles.also}>
              Also reserved today, with no limit set:
              <ul>
                {orphaned.map((usage) => (
                  <li key={`${usage.chainId}:${usage.asset}`}>
                    {chainName(usage.chainId)} · {usage.reserved} {assetLabel(usage.asset)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={styles.field}>
            <label htmlFor="payment-recipients">Allowed recipients</label>
            <Textarea
              id="payment-recipients"
              rows={2}
              value={recipients}
              onChange={(event) => {
                edit(draft);
                setRecipients(event.target.value);
              }}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="payment-recipients-help payment-limits-problem"
            />
            <p id="payment-recipients-help" className={styles.help}>
              One wallet address per line. Leave blank to allow any direct recipient.
            </p>
          </div>
          <p id="payment-limits-problem" role="status" className={styles.problem}>
            {problem}
          </p>
          {error && (
            <p role="alert" className={styles.problem}>
              {error}
            </p>
          )}
          <div className={styles.submit}>
            <Button
              type="submit"
              size="sm"
              disabled={!dirty || !!problem || saving}
              loading={saving}
            >
              Save limits
            </Button>
            <p role="status" className={styles.line}>
              {notice || (dirty ? "Unsaved changes" : "")}
            </p>
          </div>
        </form>
      )}
    </section>
  );
}
