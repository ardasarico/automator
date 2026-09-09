"use client";

import { totalRuns, type AccountUsage } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@automator/ui/dialog";
import { ScrollArea } from "@automator/ui/scroll-area";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@automator/ui/tabs";
import { ThemeSelect } from "@automator/ui/theme-select";
import {
  RiBarChartBoxLine,
  RiCheckLine,
  RiEqualizerLine,
  RiFileCopyLine,
  RiPlugLine,
  RiUser3Line,
} from "@remixicon/react";
import Link from "next/link";
import { type ReactNode, type RefObject, useEffect, useState, useSyncExternalStore } from "react";
import { AccountRequestError, getAccountUsageRequest } from "../account/client";
import { useAccessToken } from "../auth/access-token";
import { useAuthSession } from "../auth/provider";

const sections = [
  { value: "preferences", label: "Preferences", icon: RiEqualizerLine },
  { value: "usage", label: "Usage", icon: RiBarChartBoxLine },
  { value: "account", label: "Account", icon: RiUser3Line },
];

const mobileQuery = "(max-width: 639px)";
function subscribeToViewport(callback: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const serverSnapshot = () => false;

function PanelHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="border-b border-border pr-4 pb-6">
      <h2 className="text-section">{title}</h2>
      <p className="mt-2 text-caption text-muted-foreground">{description}</p>
    </header>
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
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-5 last:border-b-0">
      <div className="min-w-0">
        <h3 className="text-label">{label}</h3>
        {description && (
          <p className="mt-1 text-caption text-muted-foreground text-pretty">{description}</p>
        )}
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
    <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border py-5 last:border-b-0">
      <div className="min-w-0">
        <dt className="text-label">{term}</dt>
        {detail && <dd className="mt-1 text-caption text-muted-foreground">{detail}</dd>}
      </div>
      <dd className="text-body tabular-nums">{children}</dd>
    </div>
  );
}

function Usage({ open }: { open: boolean }) {
  const getAccessToken = useAccessToken();
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
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
  }, [open, getAccessToken, attempt]);

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 py-5">
        <p role="alert" className="text-caption text-destructive-text">
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
      <p role="status" className="py-5 text-caption text-muted-foreground">
        Loading usage…
      </p>
    );
  }
  const runs = usage.runsLast30Days;
  const since = new Date(usage.since).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <>
      <dl className="pt-2">
        <UsageRow
          term="Flows"
          detail={`${usage.activeFlows} active (webhook, schedule, onchain-event and watch triggers on)`}
        >
          {usage.flows}
        </UsageRow>
        <UsageRow
          term="Runs in the last 30 days"
          detail={`${runs.manual} Simulate · ${runs.webhook} webhook · ${runs.schedule} schedule · ${runs.miniapp} mini-app · ${runs.event} onchain event · ${runs.watch} watch`}
        >
          {totalRuns(usage)}
        </UsageRow>
        <UsageRow term="Secrets">{usage.secrets}</UsageRow>
        <UsageRow term="Published flows">{usage.listings}</UsageRow>
      </dl>
      <p className="pt-4 text-caption text-muted-foreground">
        Runs are counted since {since}. There are no usage limits yet.
      </p>
    </>
  );
}

function CopyWalletButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
            await navigator.clipboard.writeText(address);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <RiCheckLine aria-hidden="true" /> : <RiFileCopyLine aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
        <span className="sr-only"> wallet address</span>
      </Button>
      <p className="sr-only" role="status">
        {copied ? "Wallet address copied" : ""}
      </p>
    </>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
}) {
  const mobile = useSyncExternalStore(subscribeToViewport, mobileSnapshot, serverSnapshot);
  const { user } = useAuthSession();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className="h-auto max-h-[min(560px,calc(100dvh-32px))] min-h-[min(420px,calc(100dvh-32px))] max-w-3xl overflow-hidden"
        bottomStickOnMobile={false}
        finalFocus={finalFocus}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your preferences, usage, and account.
        </DialogDescription>
        <Tabs
          defaultValue="preferences"
          orientation={mobile ? "horizontal" : "vertical"}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="w-49 flex-none border-border border-r bg-muted px-3 py-6 max-sm:w-full max-sm:border-r-0 max-sm:border-b max-sm:px-3 max-sm:pt-5 max-sm:pb-3">
            <p className="px-3 pb-6 text-section max-sm:px-2 max-sm:pb-5" aria-hidden="true">
              Settings
            </p>
            <TabsList
              aria-label="Settings sections"
              activateOnFocus
              className="w-full max-sm:overflow-x-auto"
            >
              {sections.map(({ value, label, icon: Icon }) => (
                <TabsTab key={value} value={value} className="grow-0 max-sm:[&_svg]:hidden">
                  <Icon aria-hidden="true" />
                  {label}
                </TabsTab>
              ))}
            </TabsList>
          </div>
          <ScrollArea className="w-auto min-w-0 flex-1" overscrollContain>
            <TabsPanel value="preferences" className="p-7 max-sm:px-5 max-sm:py-6">
              <PanelHeader title="Preferences" description="Make Automator feel right for you." />
              <div className="flex flex-wrap items-center justify-between gap-4 py-6">
                <div>
                  <h3 className="text-label">Theme</h3>
                  <p className="mt-1 text-caption text-muted-foreground">
                    Choose light, dark, or follow your system.
                  </p>
                </div>
                <ThemeSelect />
              </div>
              <DetailRow
                label="Connections"
                description="Secrets and the apps they reach have their own page, where they can be added and removed."
              >
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/connections" onClick={() => onOpenChange(false)} />}
                >
                  <RiPlugLine aria-hidden="true" />
                  Open connections
                </Button>
              </DetailRow>
            </TabsPanel>
            <TabsPanel value="usage" className="p-7 max-sm:px-5 max-sm:py-6">
              <PanelHeader title="Usage" description="What you have built and run." />
              <Usage open={open} />
            </TabsPanel>
            <TabsPanel value="account" className="p-7 max-sm:px-5 max-sm:py-6">
              <PanelHeader title="Account" description="Your account and connected wallet." />
              <div className="pt-2">
                {user?.name && (
                  <DetailRow label="Name">
                    <span className="min-w-0 text-body wrap-anywhere">{user.name}</span>
                  </DetailRow>
                )}
                {user?.username && (
                  <DetailRow label="Username">
                    <span className="min-w-0 text-body text-muted-foreground wrap-anywhere">
                      @{user.username}
                    </span>
                  </DetailRow>
                )}
                {user?.walletAddress && (
                  <DetailRow label="Wallet">
                    <span className="flex min-w-0 flex-wrap items-center justify-end gap-3">
                      <code dir="ltr" className="min-w-0 text-code wrap-anywhere">
                        {user.walletAddress}
                      </code>
                      <CopyWalletButton address={user.walletAddress} />
                    </span>
                  </DetailRow>
                )}
                {!user?.name && !user?.username && !user?.walletAddress && (
                  <p className="py-5 text-caption text-muted-foreground">
                    Profile details are unavailable.
                  </p>
                )}
              </div>
            </TabsPanel>
          </ScrollArea>
        </Tabs>
      </DialogPopup>
    </Dialog>
  );
}
