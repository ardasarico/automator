"use client";

import { Button } from "@automator/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@automator/ui/dialog";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { ScrollArea } from "@automator/ui/scroll-area";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@automator/ui/tabs";
import { ThemeSelect } from "@automator/ui/theme-select";
import {
  RiApps2Line,
  RiBarChartBoxLine,
  RiCheckLine,
  RiEqualizerLine,
  RiFileCopyLine,
  RiUser3Line,
} from "@remixicon/react";
import { type ReactNode, type RefObject, useEffect, useState, useSyncExternalStore } from "react";
import { useAuthSession } from "../auth/provider";

const sections = [
  { value: "preferences", label: "Preferences", icon: RiEqualizerLine },
  { value: "apps", label: "Connected apps", icon: RiApps2Line },
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

function ComingSoon({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center px-2 py-14 text-center">
      <EmptyStateIllustration icon={icon} />
      <h3 className="mt-6 text-label">{title}</h3>
      <p className="mt-2 text-caption text-muted-foreground">{description}</p>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-5 last:border-b-0">
      <h3 className="text-label">{label}</h3>
      {children}
    </div>
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
          Manage your preferences, connected apps, usage, and account.
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
            </TabsPanel>
            <TabsPanel value="apps" className="p-7 max-sm:px-5 max-sm:py-6">
              <PanelHeader
                title="Connected apps"
                description="Manage the services you use in your flows."
              />
              <ComingSoon
                icon={<RiApps2Line />}
                title="No connected apps"
                description="App connections are coming soon."
              />
            </TabsPanel>
            <TabsPanel value="usage" className="p-7 max-sm:px-5 max-sm:py-6">
              <PanelHeader title="Usage" description="Keep track of your AI and flow usage." />
              <ComingSoon
                icon={<RiBarChartBoxLine />}
                title="No usage to show"
                description="Usage tracking is coming soon."
              />
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
