import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@automator/ui/progress";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Progress</h1>
      <div className="grid max-w-lg gap-8">
        {[
          { label: "Not started", value: 0 },
          { label: "Simulating", value: 45 },
          { label: "Complete", value: 100 },
        ].map(({ label, value }) => (
          <Progress key={label} value={value}>
            <div className="flex items-center justify-between gap-4">
              <ProgressLabel>{label}</ProgressLabel>
              <ProgressValue />
            </div>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
        ))}
        <Progress value={null}>
          <ProgressLabel>Waiting for confirmation</ProgressLabel>
          <ProgressTrack>
            <ProgressIndicator className="h-full bg-primary/50 motion-safe:animate-pulse" />
          </ProgressTrack>
        </Progress>
      </div>
    </>
  );
}
