import { WorkspaceShell } from "../../components/workspace-shell";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireUser } from "../../auth/server";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await requireUser();
  const state = (await cookies()).get("workspace_sidebar")?.value;
  return (
    <WorkspaceShell defaultState={state === "collapsed" ? "collapsed" : "open"}>
      {children}
    </WorkspaceShell>
  );
}
