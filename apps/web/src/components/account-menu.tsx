"use client";

import { DitherAvatar } from "@automator/ui/dither-avatar";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "@automator/ui/menu";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "@automator/ui/dialog";
import { ThemeSelect } from "@automator/ui/theme-select";
import { RiExpandUpDownLine, RiSettings3Line, RiLogoutBoxRLine } from "@remixicon/react";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import { useSidebar } from "./sidebar-context";
import styles from "./account-menu.module.css";

// Preview identity until wallet authentication is connected.
const previewWalletAddress = "0x25e40000000000000000000000000000000066c8";

export function AccountMenu({
  walletAddress = previewWalletAddress,
  onLogout,
}: {
  walletAddress?: string;
  onLogout?: () => void;
}) {
  const { state } = useSidebar();
  const isOpen = state === "open";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Menu>
        <MenuTrigger
          ref={triggerRef}
          className={styles.trigger}
          aria-label={walletAddress ? `Account menu, ${walletAddress}` : "Account menu"}
          title={isOpen ? undefined : "Account"}
        >
          <span className={styles.avatar} aria-hidden="true">
            <DitherAvatar name={walletAddress ?? "Automator"} hue={192} size={24} animate={false} />
          </span>
          <motion.span
            initial={false}
            animate={{ opacity: isOpen ? 1 : 0 }}
            className={styles.details}
            aria-hidden="true"
          >
            <span className={styles.identity}>
              <span>Account</span>
              <span className={styles.wallet} title={walletAddress}>
                {walletAddress
                  ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
                  : "No wallet connected"}
              </span>
            </span>
            <RiExpandUpDownLine size={18} />
          </motion.span>
        </MenuTrigger>
        <MenuPopup
          side="top"
          align="start"
          sideOffset={8}
          className="w-max"
          style={{ minWidth: "max(14rem, var(--anchor-width))" }}
        >
          <MenuItem onClick={() => setSettingsOpen(true)}>
            <RiSettings3Line aria-hidden="true" />
            Settings
          </MenuItem>
          <MenuSeparator />
          <MenuItem variant="destructive" onClick={onLogout}>
            <RiLogoutBoxRLine aria-hidden="true" />
            Log out
          </MenuItem>
        </MenuPopup>
      </Menu>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogPopup className="max-w-3xl" bottomStickOnMobile={false} finalFocus={triggerRef}>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Make Automator feel right for you.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <section className={styles.settingsSection} aria-labelledby="appearance-heading">
              <h2 id="appearance-heading" className={styles.sectionTitle}>
                Appearance
              </h2>
              <div className={styles.settingRow}>
                <div>
                  <p>Theme</p>
                  <p className={styles.hint}>Choose light, dark, or follow your system.</p>
                </div>
                <ThemeSelect />
              </div>
            </section>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
