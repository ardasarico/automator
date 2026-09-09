"use client";

import { RiMoonLine, RiSunLine } from "@remixicon/react";
import Link from "next/link";
import { useTheme } from "@automator/ui/theme-provider";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const widths = [
  { label: "sm", value: "640px" },
  { label: "md", value: "768px" },
  { label: "lg", value: "1024px" },
  { label: "full", value: "100%" },
];

const pages = [
  { href: "/tokens", label: "Tokens" },
  { href: "/patterns/sidebar", label: "Sidebar (redesign)" },
  { href: "/components/button", label: "Button" },
  { href: "/components/input", label: "Input" },
  { href: "/components/textarea", label: "Textarea" },
  { href: "/components/select", label: "Select" },
  { href: "/components/checkbox", label: "Checkbox" },
  { href: "/components/switch", label: "Switch" },
  { href: "/components/field", label: "Field" },
  { href: "/components/tabs", label: "Tabs" },
  { href: "/components/badge", label: "Badge" },
  { href: "/components/tooltip", label: "Tooltip" },
  { href: "/components/menu", label: "Menu" },
  { href: "/components/dialog", label: "Dialog" },
  { href: "/components/progress", label: "Progress" },
  { href: "/components/separator", label: "Separator" },
  { href: "/components/scroll-area", label: "Scroll Area" },
  { href: "/components/spinner", label: "Spinner" },
  { href: "/components/empty-state-illustration", label: "Empty State Illustration" },
  { href: "/components/logo", label: "Logo" },
  { href: "/components/theme-select", label: "Theme Select" },
  { href: "/components/dither-avatar", label: "Dither Avatar" },
];

export function LabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentPage = pages.find((page) => page.href === pathname);
  const [width, setWidth] = useState("100%");
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="grid h-dvh grid-rows-[auto_48px_minmax(0,1fr)] sm:grid-cols-[250px_minmax(0,1fr)] sm:grid-rows-[48px_minmax(0,1fr)]">
      <aside className="flex min-h-0 min-w-0 flex-col border-b border-border bg-card sm:row-span-2 sm:overflow-y-auto sm:border-r sm:border-b-0">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border pr-2.5 pl-6">
          <span className="text-label text-muted-foreground">Lab</span>
          <button
            type="button"
            aria-label="Toggle color theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="flex size-7 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <RiMoonLine aria-hidden="true" className="size-4 dark:hidden" />
            <RiSunLine aria-hidden="true" className="hidden size-4 dark:block" />
          </button>
        </div>
        <nav
          aria-label="Components"
          className="flex gap-0.5 overflow-x-auto px-2 py-2 sm:flex-col sm:overflow-x-visible sm:py-4"
        >
          {pages.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              aria-current={pathname === page.href ? "page" : undefined}
              className={`block shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-label ${pathname === page.href ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {page.label}
            </Link>
          ))}
        </nav>
      </aside>
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-card pr-2.5 pl-6">
        <span className="text-caption text-muted-foreground">
          Lab{currentPage ? ` / ${currentPage.label}` : ""}
        </span>
        <div role="group" aria-label="Preview width" className="flex gap-0.5">
          {widths.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={width === option.value}
              onClick={() => setWidth(option.value)}
              className={`cursor-pointer rounded-md px-2 py-1 text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${width === option.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>
      <main className="min-w-0 overflow-y-auto bg-background px-6 py-10">
        <div className="mx-auto w-full" style={{ maxWidth: width }}>
          {children}
        </div>
      </main>
    </div>
  );
}
