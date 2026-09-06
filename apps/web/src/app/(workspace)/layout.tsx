import { WorkspaceShell } from "../../components/workspace-shell";
import type { ReactNode } from "react";
import { SessionProvider } from "../../auth/provider";
import { requireUser } from "../../auth/server";
import { SIDEBAR_COOKIE } from "../../lib/preferences";
import { readPreferenceCookie } from "../../lib/preferences.server";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const state = await readPreferenceCookie(SIDEBAR_COOKIE);
  return (
    <SessionProvider initialUser={user}>
      <WorkspaceShell defaultState={state === "collapsed" ? "collapsed" : "open"}>
        {children}
      </WorkspaceShell>
    </SessionProvider>
  );
}
