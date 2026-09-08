import type { ReactNode } from "react";

export function MiniAppShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col sm:items-center sm:justify-center sm:bg-muted sm:p-6">
      <div className="flex min-h-dvh w-full flex-col sm:h-[min(800px,calc(100dvh-3rem))] sm:min-h-0 sm:max-w-105 sm:overflow-hidden sm:rounded-3xl sm:border sm:shadow-lg">
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
