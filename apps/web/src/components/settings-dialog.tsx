"use client";

import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@automator/ui/dialog";
import { ScrollArea } from "@automator/ui/scroll-area";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@automator/ui/tabs";
import { ThemeSelect } from "@automator/ui/theme-select";
import {
  RiApps2Line,
  RiBarChartBoxLine,
  RiEqualizerLine,
  RiUser3Line,
  RiWallet3Line,
} from "@remixicon/react";
import { type RefObject, useSyncExternalStore } from "react";
import styles from "./settings-dialog.module.css";

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

export function SettingsDialog({
  open,
  onOpenChange,
  finalFocus,
  walletAddress,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  walletAddress?: string;
}) {
  const mobile = useSyncExternalStore(subscribeToViewport, mobileSnapshot, serverSnapshot);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className={`max-w-3xl ${styles.popup}`}
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
          className={styles.layout}
        >
          <div className={styles.sidebar}>
            <p className={styles.sidebarTitle} aria-hidden="true">
              Settings
            </p>
            <TabsList aria-label="Settings sections" activateOnFocus className={styles.navigation}>
              {sections.map(({ value, label, icon: Icon }) => (
                <TabsTab key={value} value={value} className={styles.tab}>
                  <Icon aria-hidden="true" />
                  {label}
                </TabsTab>
              ))}
            </TabsList>
          </div>
          <ScrollArea className={styles.content} overscrollContain>
            <TabsPanel value="preferences" className={styles.panel}>
              <header className={styles.header}>
                <h2>Preferences</h2>
                <p>Make Automator feel right for you.</p>
              </header>
              <div className={styles.row}>
                <div>
                  <h3>Theme</h3>
                  <p className={styles.hint}>Choose light, dark, or follow your system.</p>
                </div>
                <ThemeSelect />
              </div>
            </TabsPanel>
            <TabsPanel value="apps" className={styles.panel}>
              <header className={styles.header}>
                <h2>Connected apps</h2>
                <p>Manage the services you use in your flows.</p>
              </header>
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>
                  <RiApps2Line aria-hidden="true" />
                </span>
                <h3>No connected apps</h3>
                <p>App connections are coming soon.</p>
              </div>
            </TabsPanel>
            <TabsPanel value="usage" className={styles.panel}>
              <header className={styles.header}>
                <h2>Usage</h2>
                <p>Keep track of your AI and flow usage.</p>
              </header>
              <p className={styles.notice}>Usage tracking is coming soon.</p>
              {["AI usage", "Flow runs"].map((label) => (
                <section key={label} className={styles.usageMetric} aria-label={label}>
                  <div className={styles.metricHeading}>
                    <h3>{label}</h3>
                    <span className={styles.metricValue} aria-label="Usage and limit not available">
                      — <span>/ —</span>
                    </span>
                  </div>
                  <div className={styles.meterPlaceholder} aria-hidden="true" />
                  <p className={styles.hint}>Used / limit</p>
                </section>
              ))}
              <dl className={styles.resetRow}>
                <dt>Next reset</dt>
                <dd>Not scheduled</dd>
              </dl>
            </TabsPanel>
            <TabsPanel value="account" className={styles.panel}>
              <header className={styles.header}>
                <h2>Account</h2>
                <p>Your account and connected wallet.</p>
              </header>
              <div className={styles.row}>
                <h3>Account status</h3>
                <span className={styles.hint}>
                  {walletAddress ? "Signed in" : "Preview account"}
                </span>
              </div>
              <section className={styles.walletSection} aria-label="Wallet">
                <h3>Wallet</h3>
                {walletAddress ? (
                  <div className={styles.wallet}>
                    <RiWallet3Line aria-hidden="true" />
                    <code dir="ltr">{walletAddress}</code>
                  </div>
                ) : (
                  <p className={styles.hint}>Wallet sign-in is coming soon.</p>
                )}
              </section>
            </TabsPanel>
          </ScrollArea>
        </Tabs>
      </DialogPopup>
    </Dialog>
  );
}
