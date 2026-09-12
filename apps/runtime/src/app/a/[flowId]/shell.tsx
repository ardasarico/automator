import type { ReactNode } from "react";

/*
 * On a phone the app fills the viewport and owns the whole scroll: `overscroll-contain` keeps a
 * screen's own scroll from rubber-banding the page behind it. From `sm:` up it becomes a device-
 * proportioned card on a muted ground, which is the only place the mini-app is ever framed.
 */
export function MiniAppShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col overscroll-contain sm:items-center sm:justify-center sm:bg-muted sm:p-6">
      <div className="flex min-h-dvh w-full flex-col sm:h-[min(800px,calc(100dvh-3rem))] sm:min-h-0 sm:max-w-96 sm:overflow-hidden sm:rounded-3xl sm:ring-1 sm:ring-border sm:shadow-[0_1px_2px_var(--shadow-color),0_16px_40px_-12px_var(--shadow-color)]">
        {children}
      </div>
    </main>
  );
}

export function NotFoundNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-page text-balance">App not found</h1>
      <p className="text-pretty text-muted-foreground">
        Check the link or ask the person who shared it with you.
      </p>
    </main>
  );
}
