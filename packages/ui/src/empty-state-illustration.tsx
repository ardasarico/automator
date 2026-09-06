import type { ReactNode } from "react";
import { cn } from "./utils";

export type EmptyStateIllustrationProps = {
  icon: ReactNode;
  className?: string;
};

export function EmptyStateIllustration({ icon, className }: EmptyStateIllustrationProps) {
  return (
    <span
      aria-hidden="true"
      data-slot="empty-state-illustration"
      className={cn(
        "relative isolate inline-grid h-20 w-24 shrink-0 place-items-center",
        className,
      )}
    >
      <span
        data-slot="empty-state-illustration-back-left"
        className="absolute size-14 -translate-x-3 translate-y-1 -rotate-12 rounded-2xl border border-border bg-muted"
      />
      <span
        data-slot="empty-state-illustration-back-right"
        className="absolute size-14 translate-x-3 translate-y-1 rotate-12 rounded-2xl border border-border bg-muted"
      />
      <span
        data-slot="empty-state-illustration-front"
        className="relative grid size-16 place-items-center rounded-2xl border border-border bg-card text-foreground shadow-xs [&_svg]:size-7"
      >
        {icon}
      </span>
    </span>
  );
}
