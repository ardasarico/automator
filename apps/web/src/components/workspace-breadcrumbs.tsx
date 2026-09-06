import { RiArrowRightSLine } from "@remixicon/react";
import Link from "next/link";

type BreadcrumbItem = {
  label: string;
  href: string;
};

export function WorkspaceBreadcrumbs({
  parents = [],
  current,
}: {
  parents?: readonly BreadcrumbItem[];
  current: string;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-section">
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
        <li aria-current="page" className="min-w-0">
          <h1 className="text-section wrap-anywhere">{current}</h1>
        </li>
      </ol>
    </nav>
  );
}
