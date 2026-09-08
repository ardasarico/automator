"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "./utils";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium text-base outline-none touch-manipulation transition-[background-color,color,scale] duration-150 ease-press [-webkit-tap-highlight-color:transparent] [--button-press-scale:0.98] active:scale-[var(--button-press-scale)] motion-reduce:active:scale-100 pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:not-data-loading:opacity-64 data-loading:cursor-default data-loading:select-none data-loading:active:scale-100 sm:text-sm [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
  {
    compoundVariants: [
      {
        size: ["icon", "icon-xs", "icon-sm", "icon-lg", "icon-xl"],
        class: "[--button-press-scale:0.95]",
      },
    ],
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 px-[calc(--spacing(3)-1px)] sm:h-8",
        icon: "size-9 sm:size-8",
        "icon-lg": "size-10 sm:size-9",
        "icon-sm": "size-8 sm:size-7",
        "icon-xl":
          "size-11 sm:size-10 [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        "icon-xs":
          "size-7 rounded-md sm:size-6 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-4 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-[calc(--spacing(3.5)-1px)] sm:h-9",
        sm: "h-8 gap-1.5 px-[calc(--spacing(2.5)-1px)] sm:h-7",
        xl: "h-11 px-[calc(--spacing(4)-1px)] text-lg sm:h-10 sm:text-base [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        xs: "h-7 gap-1 rounded-md px-[calc(--spacing(2)-1px)] text-sm sm:h-6 sm:text-xs [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90 data-pressed:bg-primary/90",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 data-pressed:bg-destructive/90",
        "destructive-outline":
          "border-input bg-popover not-dark:bg-clip-padding text-destructive-text hover:border-destructive/32 hover:bg-destructive/4 data-pressed:border-destructive/32 data-pressed:bg-destructive/4 dark:bg-input/32",
        ghost: "border-transparent text-foreground hover:bg-accent data-pressed:bg-accent",
        link: "border-transparent text-foreground underline-offset-4 hover:underline data-pressed:underline",
        outline:
          "border-input bg-popover not-dark:bg-clip-padding text-foreground hover:bg-accent/50 data-pressed:bg-accent/50 dark:bg-input/32 dark:data-pressed:bg-input/64 dark:hover:bg-input/64",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90 data-pressed:bg-secondary/90 [:active,[data-pressed]]:bg-secondary/80",
      },
    },
  },
);

type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;
type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

type IconButtonSize = Extract<ButtonSize, `icon${string}`>;
type TextButtonSize = Exclude<ButtonSize, IconButtonSize>;

export interface ButtonOwnProps extends useRender.ComponentProps<"button"> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
}

type IconButtonProps = ButtonOwnProps & { size: IconButtonSize } & (
    | { "aria-label": string }
    | { "aria-labelledby": string }
  );

export type ButtonProps = (ButtonOwnProps & { size?: TextButtonSize }) | IconButtonProps;

type ResolvedButtonProps = ButtonOwnProps & { size?: ButtonSize };

export function Button(props: ButtonProps): React.ReactElement {
  const {
    className,
    variant,
    size,
    render,
    children,
    loading = false,
    loadingText,
    disabled: disabledProp,
    onClick,
    ...rest
  } = props as ResolvedButtonProps;

  const isIcon = size?.startsWith("icon") ?? false;
  const hasLoadingText = Boolean(loadingText) && !isIcon;
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] = render
    ? undefined
    : "button";

  // Loading keeps the button focusable, so it stays in the tab order and the
  // ring does not jump elsewhere mid-action. Enter and Space both dispatch a
  // click, so guarding the click handler covers keyboard activation too.
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const defaultProps = {
    children: (
      <span
        data-slot="button-content"
        className="inline-grid min-w-0 items-center justify-items-center gap-[inherit]"
      >
        <span
          data-slot="button-label"
          aria-hidden={loading && hasLoadingText ? true : undefined}
          className="col-start-1 row-start-1 inline-flex items-center justify-center gap-[inherit]"
        >
          {children}
        </span>
        <span
          data-slot="button-loading-indicator"
          aria-hidden={!loading || !hasLoadingText}
          className="pointer-events-none col-start-1 row-start-1 inline-flex items-center justify-center gap-[inherit]"
        >
          <span data-slot="button-spinner" className="inline-flex">
            <Spinner className="motion-reduce:animate-none" />
          </span>
          {hasLoadingText ? <span>{loadingText}</span> : null}
        </span>
      </span>
    ),
    className: cn(buttonVariants({ className, size, variant })),
    "aria-disabled": loading || undefined,
    "aria-busy": loading || undefined,
    "data-loading": loading ? "" : undefined,
    "data-slot": "button",
    disabled: disabledProp,
    onClick: handleClick,
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, rest),
    render,
  });
}
