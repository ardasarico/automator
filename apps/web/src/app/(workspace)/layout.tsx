import { WorkspaceShell } from "../../components/workspace-shell";
import type { ReactNode } from "react";
import { SessionProvider } from "../../auth/provider";
import { requireUser } from "../../auth/server";
import { listRuns } from "../../flows/server";
import { SIDEBAR_COOKIE } from "../../lib/preferences";
import { readPreferenceCookie } from "../../lib/preferences.server";

/**
 * The sidebar's one live number: failed runs since midnight. It reads a single page of
 * failed runs and counts today's, so the badge costs one request and never blocks the
 * page — an unreachable API simply leaves the badge off.
 */
async function countFailedToday(): Promise<number | undefined> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  try {
    const { runs } = await listRuns({ status: "failed", limit: 100 });
    return runs.filter((run) => new Date(run.startedAt) >= midnight).length;
  } catch {
    return undefined;
  }
}

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const [user, state, failedRunsToday] = await Promise.all([
    requireUser(),
    readPreferenceCookie(SIDEBAR_COOKIE),
    countFailedToday(),
  ]);
  return (
    <SessionProvider initialUser={user}>
      <WorkspaceShell
        defaultState={state === "collapsed" ? "collapsed" : "open"}
        failedRunsToday={failedRunsToday}
      >
        {children}
      </WorkspaceShell>
    </SessionProvider>
  );
}
