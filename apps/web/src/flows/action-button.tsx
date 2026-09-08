"use client";

import { Button, type ButtonProps } from "@automator/ui/button";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Action = () => Promise<void>;
type SubmitProps = Pick<ButtonProps, "children" | "className" | "variant" | "aria-label"> & {
  size?: "default" | "sm";
};

function SubmitButton(props: SubmitProps) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" loading={pending} />;
}

export function FlowActionButton({ action, ...props }: SubmitProps & { action: Action }) {
  return (
    <form action={action} className="contents">
      <SubmitButton {...props} />
    </form>
  );
}

function SubmitCard({ children, className }: { children: ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {children}
    </button>
  );
}

export function FlowActionCard({
  action,
  ...props
}: {
  action: Action;
  children: ReactNode;
  className: string;
}) {
  return (
    <form action={action} className="contents">
      <SubmitCard {...props} />
    </form>
  );
}
