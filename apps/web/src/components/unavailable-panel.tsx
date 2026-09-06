import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The shared body for routes whose feature is not implemented yet, and for the workspace
 * error and not-found boundaries. It states what is unavailable and offers one way back.
 */
export function UnavailablePanel({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  /** Replaces the default "Back to flows" link, for example with a retry control. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <EmptyStateIllustration icon={icon} />
      <h2 className="mt-6 text-panel text-balance">{title}</h2>
      <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {action ?? (
          <Button variant="outline" render={<Link href="/flows" />}>
            Back to flows
          </Button>
        )}
      </div>
    </div>
  );
}
