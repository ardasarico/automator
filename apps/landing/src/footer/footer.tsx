import { Logo } from "@automator/ui/logo";
import { RiArrowRightUpLine } from "@remixicon/react";
import Link from "next/link";
import { appUrl } from "../app-url";
import { container } from "../container";
import { ThemeToggle } from "./theme-toggle";

const links = [
  { href: "https://github.com/ardasarico/automator", label: "GitHub" },
  { href: "https://ethglobal.com/showcase/automator-z7ono", label: "ETHGlobal" },
] as const;

/**
 * One row and nothing to read: the mark, where the project comes from, the two places it lives
 * outside this page, the way into the app, and the theme. The hairline above is the only edge.
 */
export function Footer() {
  return (
    <footer className="border-border border-t">
      <div
        className={`${container} flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between`}
      >
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Automator" className="flex-none">
            <Logo markColor="var(--brand)" className="h-6 w-auto" />
          </Link>
          <p className="text-caption text-muted-foreground">Built at ETHOnline 2026.</p>
        </div>
        <div className="flex items-center gap-6">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-caption text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
              <RiArrowRightUpLine aria-hidden="true" className="size-3.5" />
            </a>
          ))}
          <a
            href={appUrl}
            className="text-caption text-foreground transition-colors hover:text-muted-foreground"
          >
            Open the app
          </a>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
