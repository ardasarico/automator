import { MiniAppShell } from "./shell";

/*
 * Painted while the API resolves the flow, so a slow answer never leaves a blank document. The
 * app bar's shape is drawn without its name, which only the resolved flow can supply.
 */
export default function Loading() {
  return (
    <MiniAppShell>
      <div className="flex h-full min-h-0 flex-col bg-background" aria-busy="true">
        <div className="flex-none border-b pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-2.5 px-4">
            <span aria-hidden="true" className="size-7 flex-none rounded-2xl bg-muted" />
            <span aria-hidden="true" className="h-3.5 w-28 rounded-2xl bg-muted" />
          </div>
          <div className="h-0.5" />
        </div>
        <p className="flex flex-1 items-center justify-center p-8 text-caption text-muted-foreground">
          Loading this app…
        </p>
      </div>
    </MiniAppShell>
  );
}
