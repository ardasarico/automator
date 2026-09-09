import { RunsSkeleton } from "./runs-skeleton";

/**
 * Runs' own loading state. The workspace's spinner described the frame this page had before
 * it was rebuilt; the band and the table are what it has now, so those are what the wait shows.
 */
export default function RunsLoading() {
  return <RunsSkeleton />;
}
