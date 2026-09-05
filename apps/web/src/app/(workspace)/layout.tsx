import { WorkspaceShell } from "../../components/workspace-shell";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const state = (await cookies()).get("workspace_sidebar")?.value;
  return (
    <WorkspaceShell defaultState={state === "collapsed" ? "collapsed" : "open"}>
      {children}
    </WorkspaceShell>
  );
}
