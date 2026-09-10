import type { ReactNode } from "react";

/*
 * The runtime's copy of the web app's `src/auth/test-privy.ts`, kept in step with it on purpose.
 *
 * Bun module mocks are process-wide, and a whole-repo `bun test` runs both apps' test files in one
 * registry, so the last factory registered for `@privy-io/react-auth` defines it for every
 * importer — this app's and the web app's alike. A factory that leaves a name out breaks whichever
 * file imports it, whichever app that file lives in, so this shape carries every name either app's
 * product code imports from the SDK. Neither app can import the other's helper, so a name added to
 * one belongs in the other too.
 */

function unstubbed(name: string) {
  return () => {
    throw new Error(`${name} is not stubbed in this test`);
  };
}

/** The SDK as the tests see it: `overrides` supply whatever the test under it actually uses. */
export function privyModule(overrides: Record<string, unknown> = {}) {
  return {
    PrivyProvider: ({ children }: { children: ReactNode }) => children,
    Captcha: () => null,
    usePrivy: unstubbed("usePrivy"),
    useUser: unstubbed("useUser"),
    useLogin: unstubbed("useLogin"),
    useCreateWallet: unstubbed("useCreateWallet"),
    useConnectWallet: unstubbed("useConnectWallet"),
    useLoginWithEmail: unstubbed("useLoginWithEmail"),
    useLoginWithOAuth: unstubbed("useLoginWithOAuth"),
    useLoginWithSiwe: unstubbed("useLoginWithSiwe"),
    useModalStatus: unstubbed("useModalStatus"),
    useSigners: unstubbed("useSigners"),
    ...overrides,
  };
}
