import { accountUsageContract } from "@automator/contracts";
import type { AccountStore } from "@automator/db";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";

export interface AccountDependencies {
  account: AccountStore;
  identity: IdentityProvider | undefined;
}

export function createAccountRoutes({ account, identity }: AccountDependencies) {
  return new Elysia({ name: "account" })
    .use(createAuthGuard(identity))
    .get(accountUsageContract.path, async ({ claims }) => account.usage(claims.id), {
      response: accountUsageContract.response,
    });
}
