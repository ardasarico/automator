import { Button } from "@automator/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "./empty-state";

export function UnavailablePanel({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      variant="fill"
      icon={icon}
      title={title}
      text={description}
      action={
        action ?? (
          <Button variant="outline" render={<Link href="/flows" />}>
            Back to flows
          </Button>
        )
      }
    />
  );
}
