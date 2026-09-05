import { RiLoader4Line } from "@remixicon/react";
import type React from "react";
import { cn } from "./utils";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof RiLoader4Line>): React.ReactElement {
  return (
    <RiLoader4Line
      aria-label="Loading"
      className={cn("animate-spin", className)}
      role="status"
      {...props}
    />
  );
}
