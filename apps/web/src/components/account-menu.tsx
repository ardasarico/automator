"use client";

import { DitherAvatar } from "@automator/ui/dither-avatar";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
} from "@automator/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiExpandUpDownLine, RiSettings3Line, RiLogoutBoxRLine } from "@remixicon/react";
import { useSidebar } from "./sidebar-context";
import styles from "./account-menu.module.css";
import { useAuthSession } from "../auth/provider";

export function AccountMenu() {
  const { user, logout, pending, error, refresh } = useAuthSession();
  const walletAddress = user?.walletAddress ?? undefined;
  const { state } = useSidebar();
  const isOpen = state === "open";

  const trigger = (
    <MenuTrigger
      className={styles.trigger}
      data-state={state}
      aria-label={walletAddress ? `Account menu, ${walletAddress}` : "Account menu"}
    >
      <span className={styles.avatar} aria-hidden="true">
        <DitherAvatar name={user?.id ?? "Automator"} hue={192} size={20} animate={false} />
      </span>
      <span className={styles.details} aria-hidden="true">
        <span className={styles.identity}>
          <span>{user?.name ?? "Account"}</span>
          <span className={styles.wallet}>
            {walletAddress
              ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
              : user?.username
                ? `@${user.username}`
                : "Loading account…"}
          </span>
        </span>
        <RiExpandUpDownLine size={14} />
      </span>
    </MenuTrigger>
  );

  return (
    <>
      <Menu>
        {isOpen ? (
          trigger
        ) : (
          <Tooltip>
            <TooltipTrigger render={trigger} />
            <TooltipPopup side="right" sideOffset={8}>
              Account
            </TooltipPopup>
          </Tooltip>
        )}
        <MenuPopup
          side="top"
          align="start"
          sideOffset={8}
          className="w-max"
          style={{ minWidth: "max(14rem, var(--anchor-width))" }}
        >
          <MenuLinkItem href="/settings">
            <RiSettings3Line aria-hidden="true" />
            Settings
          </MenuLinkItem>
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
        <p className="px-3 text-caption text-destructive-text" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
