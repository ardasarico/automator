import { listFlows, listRuns } from "../flows/server";
import { ActivityBoard } from "./activity-board";
import { buildActivity, runLimit } from "./activity-model";

/**
 * One stream in one order: what is armed sits above what has happened, and each day carries a
 * heading instead of repeating its date on every line. A row is a link, so everything a row
 * leaves out is one click away.
 */
export async function HomeActivity() {
  /* Neither list is worth failing the page over; an unreachable API leaves the tape empty. */
  const [flows, runs] = await Promise.all([
    listFlows().catch(() => []),
    listRuns({ limit: runLimit }).then(
      (page) => page.runs,
      () => [],
    ),
  ]);
  const activity = buildActivity({ flows, runs });
  /* The reader's clock decides which day a run lands on, so "today" is fixed at render time. */
  return <ActivityBoard {...activity} now={new Date().toISOString()} />;
}
