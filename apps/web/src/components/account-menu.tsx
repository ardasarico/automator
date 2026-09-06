"use client";

import { DitherAvatar } from "@automator/ui/dither-avatar";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "@automator/ui/menu";
import { RiExpandUpDownLine, RiSettings3Line, RiLogoutBoxRLine } from "@remixicon/react";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import { useSidebar } from "./sidebar-context";
import { SettingsDialog } from "./settings-dialog";
import styles from "./account-menu.module.css";
import { useAuthSession } from "../auth/provider";

export function AccountMenu() {
  const { user, logout, pending, error, refresh } = useAuthSession();
  const walletAddress = user?.walletAddress ?? undefined;
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
            <DitherAvatar name={user?.id ?? "Automator"} hue={192} size={24} animate={false} />
          </span>
          <motion.span
            initial={false}
            animate={{ opacity: isOpen ? 1 : 0 }}
            className={styles.details}
            aria-hidden="true"
          >
            <span className={styles.identity}>
              <span>{user?.name ?? "Account"}</span>
              <span className={styles.wallet} title={walletAddress}>
                {walletAddress
                  ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
                  : user?.username
                    ? `@${user.username}`
                    : "Loading account…"}
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
          {error && (
            <MenuItem
              disabled={pending}
              onClick={() => {
                void refresh().catch(() => {});
              }}
            >
              Retry connection
            </MenuItem>
          )}
          <MenuItem
            variant="destructive"
            disabled={pending}
            onClick={() => {
              void logout().catch(() => {});
            }}
          >
            <RiLogoutBoxRLine aria-hidden="true" />
            Log out
          </MenuItem>
        </MenuPopup>
      </Menu>
      {error && (
        <p className="px-3 text-caption text-destructive-foreground" role="alert">
          {error}
        </p>
      )}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        finalFocus={triggerRef}
        walletAddress={walletAddress}
      />
    </>
  );
}
