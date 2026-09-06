import type { ReactNode } from "react";
import { AuthFrame } from "../../auth/auth-frame";
import { SessionProvider } from "../../auth/provider";
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthFrame>{children}</AuthFrame>
    </SessionProvider>
  );
}
