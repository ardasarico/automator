"use client";

import { Button, type ButtonProps } from "@automator/ui/button";
import type { ReactNode } from "react";
import { useActionState } from "react";
import type { FlowActionState } from "./action-state";

/**
 * A server action submitted by a form, so a click landing before React has hydrated still posts
 * natively. The action answers with a failure rather than throwing, which is what lets the button
 * report one: a server action that throws reaches the browser as nothing the form can render, so
 * a create against an unreachable API used to fail with no sign of it anywhere.
 */
export type FlowAction = (state: FlowActionState, formData: FormData) => Promise<FlowActionState>;

type SubmitProps = Pick<ButtonProps, "children" | "className" | "variant" | "aria-label"> & {
  size?: "default" | "sm";
};

/** The reason, beside the control that failed, announced as soon as it lands. */
function ActionError({ message }: { message: string }) {
  return (
    <span role="alert" className="text-caption text-destructive-text">
      {message}
    </span>
  );
}

export function FlowActionButton({ action, ...props }: SubmitProps & { action: FlowAction }) {
  const [state, submit, pending] = useActionState(action, null);
  return (
    <form action={submit} className="contents">
      <Button {...props} type="submit" loading={pending} />
      {state?.error !== undefined && <ActionError message={state.error} />}
    </form>
  );
}

export function FlowActionCard({
  action,
  children,
  className,
}: {
  action: FlowAction;
  children: ReactNode;
  className: string;
}) {
  const [state, submit, pending] = useActionState(action, null);
  return (
    <form action={submit} className="contents">
      <button type="submit" className={className} disabled={pending} aria-busy={pending}>
        {children}
        {state?.error !== undefined && <ActionError message={state.error} />}
      </button>
    </form>
  );
}
