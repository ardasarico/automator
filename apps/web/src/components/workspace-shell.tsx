"use client";
import { Button } from "@automator/ui/button";
import { Logo, LogoMark } from "@automator/ui/logo";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiCompass3Line,
  RiFlowChart,
  RiHome5Line,
  RiPlayCircleLine,
  RiPlugLine,
  RiSettings3Line,
  RiSideBarLine,
  RiTableLine,
  RiWallet3Line,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { SidebarProvider, useSidebar, type SidebarState } from "./sidebar-context";
import styles from "./workspace-shell.module.css";
import { AccountMenu } from "./account-menu";

/**
 * Open and collapsed widths. Every mark, icon and avatar is centred on 26px — the
 * centre of the collapsed rail — so collapsing takes width away from labels without
 * moving anything else.
 */
const openWidth = 240;
const railWidth = 52;

type NavItem = { href: string; label: string; icon: RemixiconComponentType };
type NavBand = { label: string; items: NavItem[] };

const bands: NavBand[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Home", icon: RiHome5Line },
      { href: "/flows", label: "Flows", icon: RiFlowChart },
      { href: "/runs", label: "Runs", icon: RiPlayCircleLine },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/data", label: "Data", icon: RiTableLine },
      { href: "/connections", label: "Connections", icon: RiPlugLine },
      { href: "/wallet", label: "Wallet", icon: RiWallet3Line },
    ],
  },
  {
    label: "Share",
    items: [{ href: "/marketplace", label: "Marketplace", icon: RiCompass3Line }],
  },
];

function SidebarHeader() {
  const { state, setState } = useSidebar();
  const isOpen = state === "open";
  const expandRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  function toggle() {
    setState(isOpen ? "collapsed" : "open");
    requestAnimationFrame(() =>
      (isOpen ? expandRef : collapseRef).current?.focus({ preventScroll: true }),
    );
  }
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="Automator home" inert={!isOpen}>
        <span className={styles.markSlot}>
          <LogoMark className={styles.mark} markColor="var(--brand)" aria-hidden="true" />
        </span>
        {/* The wordmark is the whole logo pulled left past its own mark, so nothing is drawn twice. */}
        <span className={styles.label}>
          <Logo markColor="transparent" aria-hidden="true" />
        </span>
      </Link>
      {!isOpen && (
        <Button
          ref={expandRef}
          variant="ghost"
          size="icon-sm"
          className={styles.expandButton}
          aria-label="Expand sidebar"
          aria-expanded={false}
          aria-controls="workspace-sidebar"
          onClick={toggle}
        >
          <span className={styles.iconStack}>
            <span className={styles.markIcon}>
              <LogoMark className={styles.mark} markColor="var(--brand)" aria-hidden="true" />
            </span>
            <span className={styles.openIcon}>
              <RiSideBarLine className={styles.toggleIcon} aria-hidden="true" />
            </span>
          </span>
        </Button>
      )}
      <Button
        ref={collapseRef}
        variant="ghost"
        size="icon-sm"
        className={styles.collapseButton}
        aria-label="Collapse sidebar"
        aria-expanded={isOpen}
        aria-controls="workspace-sidebar"
        tabIndex={isOpen ? undefined : -1}
        inert={!isOpen}
        onClick={toggle}
      >
        <RiSideBarLine className={styles.toggleIcon} aria-hidden="true" />
      </Button>
    </header>
  );
}

function useActive(href: string) {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  badge,
}: NavItem & { badge?: { value: string; title: string } }) {
  const { state } = useSidebar();
  const active = useActive(href);
  const link = (
    <Link
      href={href}
      className={styles.navLink}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      <Icon className={styles.navIcon} aria-hidden="true" />
      <span className={styles.navLabel} aria-hidden="true">
        {label}
      </span>
      {badge && (
        <span className={styles.navBadge} title={badge.title}>
          {badge.value}
        </span>
      )}
    </Link>
  );
  if (state === "open") return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipPopup side="right" sideOffset={8}>
        {badge ? `${label} — ${badge.title}` : label}
      </TooltipPopup>
    </Tooltip>
  );
}

function WorkspaceFrame({
  children,
  failedRunsToday,
}: {
  children: ReactNode;
  failedRunsToday?: number;
}) {
  const { state } = useSidebar();
  const isOpen = state === "open";
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, bounce: 0.1, duration: 0.5 };
  return (
    <MotionConfig reducedMotion="user" transition={transition}>
      <TooltipProvider delay={400}>
        <div className={styles.shell} data-state={state}>
          <a href="#workspace-content" className={styles.skipLink}>
            Skip to content
          </a>
          <motion.aside
            id="workspace-sidebar"
            aria-label="Sidebar"
            initial={false}
            animate={{ width: isOpen ? openWidth : railWidth }}
            className={styles.sidebar}
          >
            <div className={styles.sidebarTop}>
              <SidebarHeader />
            </div>
            <nav aria-label="Main navigation" className={styles.navigation}>
              {bands.map((band) => (
                <div key={band.label} className={styles.band}>
                  <p className={styles.bandLabel} aria-hidden="true">
                    {band.label}
                  </p>
                  {band.items.map((item) => (
                    <SidebarLink
                      key={item.href}
                      {...item}
                      badge={
                        item.href === "/runs" && failedRunsToday
                          ? {
                              value: failedRunsToday > 99 ? "99+" : String(failedRunsToday),
                              title: `${failedRunsToday} failed today`,
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              ))}
            </nav>
            <div className={styles.footer}>
              <SidebarLink href="/settings" label="Settings" icon={RiSettings3Line} />
              <AccountMenu />
            </div>
          </motion.aside>
          <div className={styles.contentArea}>
            <main id="workspace-content" tabIndex={-1} className={styles.content}>
              {children}
            </main>
          </div>
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}

export function WorkspaceShell({
  children,
  defaultState = "open",
  failedRunsToday,
}: {
  children: ReactNode;
  defaultState?: SidebarState;
  failedRunsToday?: number;
}) {
  return (
    <SidebarProvider defaultState={defaultState}>
      <WorkspaceFrame failedRunsToday={failedRunsToday}>{children}</WorkspaceFrame>
    </SidebarProvider>
  );
}
