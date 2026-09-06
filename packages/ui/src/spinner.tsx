import { RiLoader4Line } from "@remixicon/react";
import type React from "react";
import { cn } from "./utils";

export type SpinnerProps = React.ComponentProps<typeof RiLoader4Line> & {
  /** Announce the spinner under this name. Omit to keep it decorative. */
  label?: string;
};

export function Spinner({ className, label, ...props }: SpinnerProps): React.ReactElement {
  const announced = label !== undefined;

  return (
    <RiLoader4Line
      aria-hidden={announced ? undefined : true}
      aria-label={label}
      className={cn("animate-spin", className)}
      role={announced ? "status" : undefined}
      {...props}
    />
  );
}
