"use client";
import { Button } from "@automator/ui/button";
import { Logo, LogoMark } from "@automator/ui/logo";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiFlowChart,
  RiPlayCircleLine,
  RiCompass3Line,
  RiSideBarLine,
  RiWallet3Line,
} from "@remixicon/react";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { SidebarProvider, useSidebar, type SidebarState } from "./sidebar-context";
import styles from "./workspace-shell.module.css";
import { AccountMenu } from "./account-menu";
const pages = [
  { href: "/flows", label: "Flows", icon: RiFlowChart },
  { href: "/runs", label: "Runs", icon: RiPlayCircleLine },
  { href: "/marketplace", label: "Marketplace", icon: RiCompass3Line },
  { href: "/wallet", label: "Wallet", icon: RiWallet3Line },
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
      {/*
        Mark and wordmark share one link, so /flows is a single tab stop. The expand control
        overlays the mark slot when collapsed, where the link is inert and its mark hidden.
      */}
      <Link href="/flows" className={styles.brand} aria-label="Automator flows" inert={!isOpen}>
        <span className={styles.markSlot}>
          <LogoMark markColor="var(--primary)" aria-hidden="true" />
        </span>
        <span className={styles.label}>
          <Logo markColor="transparent" aria-hidden="true" />
        </span>
      </Link>
      {!isOpen && (
        <Button
          ref={expandRef}
          variant="ghost"
          size="icon-xl"
          className={`size-10 sm:size-10 ${styles.expandButton}`}
          aria-label="Expand sidebar"
          aria-expanded={false}
          aria-controls="workspace-sidebar"
          onClick={toggle}
        >
          <span className={styles.iconStack}>
            <span className={styles.mark}>
              <LogoMark
                className="size-7 opacity-100"
                markColor="var(--primary)"
                aria-hidden="true"
              />
            </span>
            <span className={styles.openIcon}>
              <RiSideBarLine className="size-6 opacity-100" aria-hidden="true" />
            </span>
          </span>
        </Button>
      )}
      <Button
        ref={collapseRef}
        variant="ghost"
        size="icon-xl"
        className={`size-10 sm:size-10 ${styles.collapseButton}`}
        aria-label="Collapse sidebar"
        aria-expanded={isOpen}
        aria-controls="workspace-sidebar"
        tabIndex={isOpen ? undefined : -1}
        inert={!isOpen}
        onClick={toggle}
      >
        <RiSideBarLine className="size-6" aria-hidden="true" />
      </Button>
    </header>
  );
}
function SidebarLink({ href, label, icon: Icon }: (typeof pages)[number]) {
  const { state } = useSidebar();
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
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
    </Link>
  );
  if (state === "open") return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipPopup side="right" sideOffset={8}>
        {label}
      </TooltipPopup>
    </Tooltip>
  );
}
function WorkspaceFrame({ children }: { children: ReactNode }) {
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
            animate={{ width: isOpen ? 260 : 64 }}
            className={styles.sidebar}
          >
            <div className={styles.sidebarTop}>
              <SidebarHeader />
              <nav aria-label="Main navigation" className={styles.navigation}>
                {pages.map((page) => (
                  <SidebarLink key={page.href} {...page} />
                ))}
              </nav>
            </div>
            <div className={styles.footer}>
              <AccountMenu />
            </div>
          </motion.aside>
          {/*
            Content inset and corner radius are CSS transitions keyed on the shell's
            data-state, so the sidebar width spring stays the only per-frame JS layout write.
          */}
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
}: {
  children: ReactNode;
  defaultState?: SidebarState;
}) {
  return (
    <SidebarProvider defaultState={defaultState}>
      <WorkspaceFrame>{children}</WorkspaceFrame>
    </SidebarProvider>
  );
}
