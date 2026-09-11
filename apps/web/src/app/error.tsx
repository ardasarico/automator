"use client";

import { Button } from "@automator/ui/button";
import { useEffect } from "react";

/** The last catch: nothing above it renders, so the error is at least written to the console. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
