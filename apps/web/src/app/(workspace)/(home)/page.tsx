import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeActivity } from "../../../home/activity";
import { ActivitySkeleton } from "../../../home/activity-skeleton";
import { HomeExamples } from "../../../home/examples";
import { HomePrompt } from "../../../home/prompt";

export const metadata: Metadata = { title: "Home · Automator" };

/**
 * The prompt-first entry page. It carries no title bar: the prompt owns the first screen, and
 * the activity tape starts where the viewport ends. Only the tape needs the API, so it is the
 * only part that waits — the prompt is usable while the runs are still in flight.
 */
export default function HomePage() {
  return (
    <>
      <HomePrompt />
      <HomeExamples />
      <Suspense fallback={<ActivitySkeleton />}>
        <HomeActivity />
      </Suspense>
    </>
  );
}
