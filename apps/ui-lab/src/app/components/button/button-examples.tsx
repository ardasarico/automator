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

function LoadingExample({ children, ...props }: ButtonProps) {
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
    >
      {children}
    </Button>
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
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary">
          Small
        </Button>
        <Button variant="secondary">Default</Button>
        <Button size="lg" variant="secondary">
          Large
        </Button>
        <Button size="icon" variant="secondary" aria-label="Add">
          <RiAddLine aria-hidden="true" />
        </Button>
        <Button disabled>Disabled</Button>
        <Button loading>Loading</Button>
      </div>
      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="text-sm font-medium">Loading transitions</h2>
          <p className="text-sm text-muted-foreground">
            Click to preview. Each action resets after a moment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LoadingExample loadingText="Simulating…">
            <RiPlayLine aria-hidden="true" />
            Simulate flow
          </LoadingExample>
          <LoadingExample variant="secondary" loadingText="Saving changes…">
            <RiSaveLine aria-hidden="true" />
            Save
          </LoadingExample>
          <LoadingExample variant="outline">Spinner only</LoadingExample>
          <LoadingExample size="icon" variant="secondary" aria-label="Add step">
            <RiAddLine aria-hidden="true" />
          </LoadingExample>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {variants.map(({ variant, label }) => (
            <LoadingExample key={variant} variant={variant} loadingText="Working…">
              {label}
            </LoadingExample>
          ))}
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
