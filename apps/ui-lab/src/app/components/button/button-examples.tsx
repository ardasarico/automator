"use client";

import { useEffect, useRef, useState } from "react";
import { RiAddLine, RiPlayLine, RiSaveLine } from "@remixicon/react";
import { Button, type ButtonProps } from "@automator/ui/button";

const variants = [
  { variant: "default", label: "Primary" },
  { variant: "secondary", label: "Secondary" },
  { variant: "outline", label: "Outline" },
  { variant: "ghost", label: "Ghost" },
  { variant: "link", label: "Link" },
  { variant: "destructive", label: "Destructive" },
  { variant: "destructive-outline", label: "Destructive outline" },
] satisfies { variant: ButtonProps["variant"]; label: string }[];

const textSizes = [
  { size: "xs", label: "XS" },
  { size: "sm", label: "SM" },
  { size: "default", label: "Default" },
  { size: "lg", label: "LG" },
  { size: "xl", label: "XL" },
] satisfies { size: ButtonProps["size"]; label: string }[];

const iconSizes = ["icon-xs", "icon-sm", "icon", "icon-lg", "icon-xl"] as const;

function LoadingExample(props: ButtonProps) {
  const [loading, setLoading] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current !== null) clearTimeout(timeout.current);
    },
    [],
  );

  return (
    <Button
      {...props}
      loading={loading}
      onClick={() => {
        if (timeout.current !== null) clearTimeout(timeout.current);
        setLoading(true);
        timeout.current = setTimeout(() => setLoading(false), 2400);
      }}
    />
  );
}

export function ButtonExamples() {
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        {variants.map(({ variant, label }) => (
          <Button key={variant} variant={variant}>
            {label}
          </Button>
        ))}
      </div>

      <section aria-labelledby="button-sizes" className="grid gap-3">
        <h2 id="button-sizes" className="text-label">
          Sizes
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {textSizes.map(({ size, label }) => (
            <Button key={label} size={size} variant="secondary">
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {iconSizes.map((size) => (
            <Button key={size} aria-label={`Add step (${size})`} size={size} variant="secondary">
              <RiAddLine aria-hidden="true" />
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="font-medium text-sm">Loading transitions</h2>
          <p className="text-muted-foreground text-sm">
            Click to preview. Each action resets after a moment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LoadingExample loadingText="Simulating…">
            <RiPlayLine aria-hidden="true" />
            Simulate flow
          </LoadingExample>
          <LoadingExample loadingText="Saving changes…" variant="secondary">
            <RiSaveLine aria-hidden="true" />
            Save
          </LoadingExample>
          <LoadingExample variant="outline">Spinner only</LoadingExample>
          <LoadingExample aria-label="Add step" size="icon" variant="secondary">
            <RiAddLine aria-hidden="true" />
          </LoadingExample>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {variants.map(({ variant, label }) => (
            <LoadingExample key={variant} loadingText="Working…" variant={variant}>
              {label}
            </LoadingExample>
          ))}
        </div>
      </section>

      <section aria-labelledby="button-loading-focus" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="button-loading-focus" className="font-medium text-sm">
            Loading keeps focus
          </h2>
          <p className="max-w-prose text-muted-foreground text-sm">
            Tab to the middle button and press Enter. A loading button is marked
            <code> aria-disabled</code> rather than disabled, so it keeps the focus ring and stays
            in the tab order while it ignores the repeat activation. Tab past it to confirm the
            neighbours are still reachable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline">Before</Button>
          <LoadingExample loadingText="Running…">Run flow</LoadingExample>
          <Button variant="outline">After</Button>
        </div>
      </section>

      <div className="grid gap-2">
        {[
          { label: "Canvas", background: "bg-background" },
          { label: "Panel", background: "bg-card" },
          { label: "Elevated", background: "bg-popover" },
        ].map(({ label, background }) => (
          <div key={label} className={`flex flex-wrap items-center gap-3 p-3.5 ${background}`}>
            <span className="w-16 text-caption text-muted-foreground">{label}</span>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
