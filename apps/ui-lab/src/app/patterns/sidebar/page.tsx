import { Button } from "@automator/ui/button";
import { Logo, LogoMark } from "@automator/ui/logo";
import {
  RiAddLine,
  RiAppsLine,
  RiCompass3Line,
  RiExpandUpDownLine,
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
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sidebar" };

/**
 * Throwaway comparison for the workspace redesign: the measured sidebar without its
 * search row, aligned to the content title bar, open and collapsed.
 *
 * The rule that keeps the two states still: every mark, icon and avatar is centred on
 * x = 26 px, the centre of the 52 px rail. Collapsing only takes width away from labels.
 * Delete once the shell lands.
 */

type Item = { label: string; icon: RemixiconComponentType; count?: string; active?: boolean };
type Band = { label: string; items: Item[] };

const bands: Band[] = [
  {
    label: "Workspace",
    items: [
      { label: "Home", icon: RiHome5Line },
      { label: "Flows", icon: RiFlowChart, active: true },
      { label: "Runs", icon: RiPlayCircleLine, count: "3" },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Data", icon: RiTableLine },
      { label: "Connections", icon: RiPlugLine },
      { label: "Wallet", icon: RiWallet3Line },
    ],
  },
  {
    label: "Share",
    items: [
      { label: "Mini-apps", icon: RiAppsLine },
      { label: "Marketplace", icon: RiCompass3Line },
    ],
  },
];

/**
 * Rows are 8 px from the nav edge and 10 px from their own, so a 16 px icon spans
 * 18–34 px: centred on 26. The 20 px brand mark sits at 16–36. Same centre, both states.
 */
function NavRow({ item, open }: { item: Item; open: boolean }) {
  return (
    <span
      className={`flex h-7.5 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-sm px-2.5 text-[13px] ${item.active ? "bg-accent font-medium text-foreground" : "text-muted-foreground"}`}
    >
      <item.icon aria-hidden="true" className="size-4 shrink-0" />
      <span className={`transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>
        {item.label}
      </span>
      {item.count && (
        <span
          className={`ml-auto text-[11px] text-destructive-text tabular-nums transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        >
          {item.count}
        </span>
      )}
    </span>
  );
}

function Sidebar({ open }: { open: boolean }) {
  return (
    <div
      className={`flex h-full flex-col overflow-hidden bg-sidebar ${open ? "w-52" : "w-13"}`}
      style={{ transition: "width 200ms" }}
    >
      {/* 48 px, the same height as the content title bar, so the wordmark and the h1 share a line. */}
      <div className="flex h-12 shrink-0 items-center pr-2.5 pl-4">
        <LogoMark className="size-5 shrink-0" markColor="var(--primary)" aria-hidden="true" />
        {/* The wordmark is the full logo pulled left by its own mark, so nothing is drawn twice. */}
        <span
          className={`h-5 w-[88px] overflow-hidden transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        >
          <Logo
            className="-ml-5 h-5 w-[107px] max-w-none"
            markColor="transparent"
            aria-hidden="true"
          />
        </span>
        <span
          className={`ml-auto flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <RiSideBarLine aria-hidden="true" className="size-4" />
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-4 px-2 pt-2">
        {bands.map((band) => (
          <div key={band.label} className="flex flex-col gap-0.5">
            <p
              className={`h-4 overflow-hidden whitespace-nowrap px-2.5 text-[11px] uppercase tracking-[0.04em] text-muted-foreground transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
            >
              {band.label}
            </p>
            {band.items.map((item) => (
              <NavRow key={item.label} item={item} open={open} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 border-border border-t px-2 py-2">
        <span className="flex h-7.5 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-sm px-2.5 text-[13px] text-muted-foreground">
          <RiSettings3Line aria-hidden="true" className="size-4 shrink-0" />
          <span className={`transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>
            Settings
          </span>
        </span>
        <span className="flex h-9 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-sm px-2.5">
          <span className="size-4 shrink-0 rounded-full bg-muted" />
          <span
            className={`flex flex-1 items-center transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
          >
            <span className="text-[13px]">arda</span>
            <RiExpandUpDownLine
              aria-hidden="true"
              className="ml-auto size-3.5 text-muted-foreground"
            />
          </span>
        </span>
      </div>
    </div>
  );
}

/** Enough of a page to show that the title bar and the wordmark share a line. */
function Content() {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-3 px-6">
        <h3 className="text-panel">Flows</h3>
        <Button size="xs" className="ml-auto">
          <RiAddLine aria-hidden="true" />
          New flow
        </Button>
      </div>
      <div className="flex h-11 shrink-0 items-center gap-2 px-6">
        <span className="rounded-sm bg-accent px-2 py-1 text-[12px]">All</span>
        <span className="px-2 py-1 text-[12px] text-muted-foreground">Active</span>
        <span className="px-2 py-1 text-[12px] text-muted-foreground">Drafts</span>
      </div>
      <div className="grid flex-1 grid-cols-2 content-start gap-3 px-6 pt-1">
        {["Weekly treasury rebalance", "Applicant intake", "Event check-in", "Support triage"].map(
          (name) => (
            <div key={name} className="rounded-md border border-border bg-card p-3">
              <p className="text-[13px]">{name}</p>
              <p className="mt-1 text-caption text-muted-foreground">6 nodes · webhook</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function Shell({ open, label }: { open: boolean; label: string }) {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-2">
      <p className="text-label">{label}</p>
      <div className="relative h-[520px] overflow-hidden rounded-md border border-border">
        <div className="flex h-full">
          <Sidebar open={open} />
          <Content />
        </div>
        {/* Guides: the icon centre line, and the line the wordmark shares with the h1. */}
        <span className="pointer-events-none absolute inset-y-0 left-[26px] w-px bg-primary/32" />
        <span className="pointer-events-none absolute inset-x-0 top-6 h-px bg-primary/32" />
      </div>
    </div>
  );
}

export default function SidebarPage() {
  return (
    <>
      <h1 className="mb-2 text-section">Sidebar</h1>
      <p className="mb-8 max-w-2xl text-body text-muted-foreground">
        The measured sidebar with the search row removed, its head aligned to the content title bar,
        shown open and collapsed. The two guides mark what must not move: the vertical line is the
        icon centre at 26 px, the horizontal one is the line the wordmark shares with the page
        heading. Throwaway — deleted once the shell lands.
      </p>
      <div className="flex flex-col gap-10">
        <Shell open label="Open — 208 px" />
        <Shell open={false} label="Collapsed — 52 px rail" />
      </div>
    </>
  );
}
