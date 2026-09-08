import { RiArrowRightSLine } from "@remixicon/react";
import Link from "next/link";
import type { ReactNode } from "react";

type BreadcrumbItem = {
  label: string;
  href: string;
};

export function WorkspaceBreadcrumbs({
  parents = [],
  current,
  children,
}: {
  parents?: readonly BreadcrumbItem[];
  current: string;
  /** Replaces the default heading; the caller must render the page's `h1` inside. */
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-2 text-section">
      {parents.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2">
            {parents.map(({ label, href }) => (
              <li key={href} className="flex min-w-0 items-center gap-2">
                <Link
                  href={href}
                  className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  {label}
                </Link>
                <RiArrowRightSLine
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
                />
              </li>
            ))}
          </ol>
        </nav>
      )}
      {children ?? <h1 className="min-w-0 text-section wrap-anywhere">{current}</h1>}
    </div>
  );
}
