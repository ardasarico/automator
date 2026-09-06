import { Logo, LogoMark } from "@automator/ui/logo";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Logo" };

const surfaces = [
  { label: "Canvas", background: "bg-background" },
  { label: "Panel", background: "bg-card" },
  { label: "Elevated", background: "bg-popover" },
];

export default function LogoPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Logo</h1>
      <div className="grid max-w-3xl gap-10">
        <section aria-labelledby="logo-default">
          <h2 id="logo-default" className="mb-4 text-label">
            Default
          </h2>
          <div className="flex flex-wrap items-center gap-8 text-foreground">
            <Logo />
            <LogoMark />
          </div>
        </section>

        <section aria-labelledby="logo-colors">
          <h2 id="logo-colors" className="mb-4 text-label">
            Mark and label colors
          </h2>
          <p className="mb-4 max-w-prose text-caption text-muted-foreground">
            Both parts default to <code>currentColor</code>. Pass a token to split them.
          </p>
          <div className="flex flex-wrap items-center gap-8">
            <Logo markColor="var(--primary)" />
            <Logo labelColor="var(--muted-foreground)" markColor="var(--primary)" />
            <LogoMark markColor="var(--primary)" />
          </div>
        </section>

        <section aria-labelledby="logo-sizes">
          <h2 id="logo-sizes" className="mb-4 text-label">
            Sizes
          </h2>
          <div className="flex flex-wrap items-end gap-8 text-foreground">
            <LogoMark className="size-5" />
            <LogoMark className="size-7" />
            <LogoMark className="size-10" />
          </div>
        </section>

        <section aria-labelledby="logo-surfaces">
          <h2 id="logo-surfaces" className="mb-4 text-label">
            Surfaces
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {surfaces.map(({ label, background }) => (
              <div key={label} className={`grid gap-3 p-3.5 ${background}`}>
                <span className="text-caption text-muted-foreground">{label}</span>
                <Logo className="w-full max-w-36" markColor="var(--primary)" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
