import type { ReactNode } from "react";

/*
 * Bun module mocks are process-wide, and a whole-repo `bun test` runs every app's test files in
 * one registry, so the last factory registered for a module defines it for every importer —
 * including files that already linked against an earlier one. A factory that leaves a name out
 * therefore breaks an unrelated test that imports it, which is how a Privy mock here came to
 * break the runtime's identity host: it imports `useLogin`, and none of the web factories had it.
 *
 * So every mock of `@privy-io/react-auth` builds on this one shape, which must carry every name
 * any app's product code imports from the SDK — the runtime's included. `apps/runtime` keeps its
 * own copy of the same union for the same reason; a name added here belongs there too.
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
