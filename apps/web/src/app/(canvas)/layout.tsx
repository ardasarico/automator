import type { ReactNode } from "react";
import { SessionProvider } from "../../auth/provider";
import { requireUser } from "../../auth/server";

/**
 * Canvas routes render outside the workspace shell: no sidebar, no header, the page owns the
 * whole viewport. The session is still verified on the server and mirrored to the client.
 */
export default async function CanvasLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <SessionProvider initialUser={user}>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">{children}</div>
    </SessionProvider>
  );
}
