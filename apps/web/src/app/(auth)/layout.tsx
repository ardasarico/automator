import type { ReactNode } from "react";
import { AuthFrame } from "../../auth/auth-frame";
import { SessionProvider } from "../../auth/provider";
import { getCurrentUser } from "../../auth/server";

/*
 * The session cookie already names the account, so a person who arrives with one (typically
 * sent to /onboarding straight after signing in) meets their form at once instead of a spinner
 * while the SDK restores its session. The SDK still has the final say: the provider drops the
 * user again if it turns out to be signed out. An unreachable API is not this page's error to
 * show, so it only leaves the user out.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <SessionProvider initialUser={user ?? undefined}>
      <AuthFrame>{children}</AuthFrame>
    </SessionProvider>
  );
}
