import { MiniAppShell } from "./shell";

/* Painted while the API resolves the flow, so a slow answer never leaves a blank document. */
export default function Loading() {
  return (
    <MiniAppShell>
      <div
        className="flex flex-1 items-center justify-center p-8 text-caption text-muted-foreground"
        aria-busy="true"
      >
        Loading this app…
      </div>
    </MiniAppShell>
  );
}
