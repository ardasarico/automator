import { Button } from "@automator/ui/button";
import { Logo } from "@automator/ui/logo";
import Link from "next/link";
import { appUrl } from "./app-url";

/** Where the project lives outside this page. The X link opens the follow dialog directly. */
const links = [
  { href: "https://github.com/ardasarico/automator", label: "GitHub" },
  { href: "https://x.com/intent/follow?screen_name=ardasarico", label: "X" },
  { href: "https://ethglobal.com/showcase/automator-z7ono", label: "ETHGlobal" },
] as const;

/**
 * An island rather than a bar: it floats over the hero's field instead of cutting a line across
 * it, and keeps the page's own container width so nothing in it drifts to the screen's edges.
 */
export function Nav() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center px-4 pt-4">
      <header className="pointer-events-auto flex w-full max-w-5xl items-center gap-4 rounded-full border border-border bg-[color-mix(in_srgb,var(--background)_72%,transparent)] py-2 pr-2 pl-5 backdrop-blur-lg">
        <Link href="/" aria-label="Automator" className="flex-none">
          <Logo markColor="var(--brand)" className="h-6 w-auto" />
        </Link>
        <nav aria-label="Links" className="mx-auto hidden gap-6 sm:flex">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-caption text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <Button
          className="ml-auto flex-none rounded-full sm:ml-0"
          render={<a href={appUrl}>Open the app</a>}
        />
      </header>
    </div>
  );
}
