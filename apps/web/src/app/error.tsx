"use client";

import { Button } from "@automator/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-page text-balance">Something went wrong</h1>
      <p className="text-pretty text-muted-foreground">Please try loading the page again.</p>
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
