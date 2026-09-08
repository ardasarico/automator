import type { ReactNode } from "react";
import { SessionProvider } from "../../auth/provider";
import { requireUser } from "../../auth/server";

export default async function CanvasLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <SessionProvider initialUser={user}>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">{children}</div>
    </SessionProvider>
  );
}
