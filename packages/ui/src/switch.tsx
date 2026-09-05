"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type React from "react";
import { cn } from "./utils";

export type SwitchProps = SwitchPrimitive.Root.Props & {
  size?: "default" | "lg";
};

export function Switch({ className, size = "default", ...props }: SwitchProps): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-[calc(var(--thumb-size)+var(--switch-inset)*2)] w-(--switch-width) [--switch-width:calc((var(--thumb-size)+var(--switch-inset)*2)*13/6)] [--switch-thumb-width:calc(var(--thumb-size)*7/5)] [--switch-travel:calc(var(--switch-width)-var(--switch-inset)*2-var(--switch-thumb-width))] shrink-0 items-center rounded-full p-(--switch-inset) outline-none transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-disabled:cursor-not-allowed data-checked:bg-primary data-unchecked:bg-input data-disabled:opacity-64",
        size === "lg"
          ? "[--thumb-size:25px] [--switch-inset:2.5px]"
          : "[--thumb-size:20px] [--switch-inset:2px]",
        className,
      )}
      data-size={size}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block aspect-[7/5] h-full origin-left in-[[role=switch]:active,[data-slot=label]:active,[data-slot=field-label]:active]:not-data-disabled:scale-x-110 in-[[role=switch]:active,[data-slot=label]:active,[data-slot=field-label]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.1)] rounded-(--thumb-size) bg-background shadow-sm/5 will-change-transform [transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s] data-checked:origin-[var(--switch-thumb-width)_50%] data-checked:translate-x-(--switch-travel) motion-reduce:transition-none",
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}

export { SwitchPrimitive };
