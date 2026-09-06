import { ThemeSelect } from "@automator/ui/theme-select";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Theme Select" };

export default function ThemeSelectPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Theme Select</h1>
      <div className="grid max-w-2xl gap-6">
        <p className="max-w-prose text-caption text-muted-foreground">
          Bound to next-themes through the shared theme provider. It stays disabled until the client
          knows the resolved theme, so the server render never guesses.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <ThemeSelect />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { label: "Canvas", background: "bg-background" },
            { label: "Panel", background: "bg-card" },
            { label: "Elevated", background: "bg-popover" },
          ].map(({ label, background }) => (
            <div key={label} className={`grid gap-3 p-3.5 ${background}`}>
              <span className="text-caption text-muted-foreground">{label}</span>
              <ThemeSelect />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
