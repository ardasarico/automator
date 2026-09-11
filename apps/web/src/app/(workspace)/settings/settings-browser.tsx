"use client";

import { totalRuns, type AccountUsage } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { ThemeSelect } from "@automator/ui/theme-select";
import { RiPlugLine } from "@remixicon/react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { AccountRequestError, getAccountUsageRequest } from "../../../account/client";
import { useAccessToken } from "../../../auth/access-token";
import { useAuthSession } from "../../../auth/provider";
import { CopyButton } from "../../../components/copy-button";
import { LocalDate } from "../../../components/local-date";
import { runSourceLabels } from "../runs/run-labels";
import styles from "./settings.module.css";

function Section({
  id,
  title,
  text,
  children,
}: {
  id: string;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id={`${id}-title`} className={styles.sectionTitle}>
          {title}
        </h2>
        <p className={styles.sectionText}>{text}</p>
      </div>
      {children}
    </section>
  );
}

function DetailRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <h3 className={styles.rowLabel}>{label}</h3>
        {description && <p className={styles.rowHint}>{description}</p>}
      </div>
      {children}
    </div>
  );
}

const usageFailures: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
};

function UsageRow({
  term,
  detail,
  children,
}: {
  term: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <dt className={styles.rowLabel}>{term}</dt>
        {detail && <dd className={styles.rowHint}>{detail}</dd>}
      </div>
      <dd className={`${styles.value} ${styles.number}`}>{children}</dd>
    </div>
  );
}

/** Reads `GET /account/usage` once per mount and again on Retry. */
function Usage() {
  const getAccessToken = useAccessToken();
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await getAccountUsageRequest(await getAccessToken());
        if (cancelled) return;
        setUsage(next);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        const code = caught instanceof AccountRequestError ? caught.code : "unavailable";
        setError(usageFailures[code] ?? "Usage is unavailable right now. Try again shortly.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, attempt]);

  if (error) {
    return (
      <div className={styles.status}>
        <p role="alert" className={styles.error}>
          {error}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setUsage(null);
            setError(null);
            setAttempt((value) => value + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!usage) {
    return (
      <p role="status" className={`${styles.status} ${styles.statusText}`}>
        Loading usage…
      </p>
    );
  }
  const runs = usage.runsLast30Days;
  return (
    <>
      <dl className={styles.rows}>
        <UsageRow
          term="Flows"
          detail={`${usage.activeFlows} active (webhook, schedule, onchain-event and watch triggers on)`}
        >
          {usage.flows}
        </UsageRow>
        <UsageRow
          term="Runs in the last 30 days"
          /* Each trigger is named the way the Runs page names it. */
          detail={(["manual", "webhook", "schedule", "miniapp", "event", "watch", "api"] as const)
            .map((source) => `${runs[source]} ${runSourceLabels[source]}`)
            .join(" · ")}
        >
          {totalRuns(usage)}
        </UsageRow>
        <UsageRow term="Secrets">{usage.secrets}</UsageRow>
        <UsageRow term="Published flows">{usage.listings}</UsageRow>
      </dl>
      <p className={styles.note}>
        Runs are counted since <LocalDate value={usage.since} />. There are no usage limits yet.
      </p>
    </>
  );
}

/**
 * Preferences, Usage and Account as three stacked sections. Secrets and the apps they reach
 * are a page of their own; Preferences only points at it.
 */
export function SettingsBrowser() {
  const { user } = useAuthSession();
  return (
    <>
      <Section id="preferences" title="Preferences" text="Make Automator feel right for you.">
        <div className={styles.rows}>
          <DetailRow label="Theme" description="Choose light, dark, or follow your system.">
            <ThemeSelect />
          </DetailRow>
          <DetailRow
            label="Connections"
            description="Secrets and the apps they reach have their own page, where they can be added and removed."
          >
            <Button variant="outline" size="sm" render={<Link href="/connections" />}>
              <RiPlugLine aria-hidden="true" />
              Open connections
            </Button>
          </DetailRow>
        </div>
      </Section>
      <Section id="usage" title="Usage" text="What you have built and run.">
        <Usage />
      </Section>
      <Section id="account" title="Account" text="Your account and connected wallet.">
        <div className={styles.rows}>
          {user?.name && (
            <DetailRow label="Name">
              <span className={styles.value}>{user.name}</span>
            </DetailRow>
          )}
          {user?.username && (
            <DetailRow label="Username">
              <span className={`${styles.value} ${styles.valueMuted}`}>@{user.username}</span>
            </DetailRow>
          )}
          {user?.walletAddress && (
            <DetailRow label="Wallet">
              <span className={styles.wallet}>
                <code dir="ltr" className={styles.address}>
                  {user.walletAddress}
                </code>
                <CopyButton text={user.walletAddress} what="wallet address" />
              </span>
            </DetailRow>
          )}
          {!user?.name && !user?.username && !user?.walletAddress && (
            <p className={`${styles.status} ${styles.statusText}`}>
              Profile details are unavailable.
            </p>
          )}
        </div>
      </Section>
    </>
  );
}
