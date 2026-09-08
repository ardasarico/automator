import {
  defaultChainId,
  getWalletContract,
  getWalletTransactionsContract,
  isChainId,
  type Wallet,
} from "@automator/contracts";
import type { RunStore } from "@automator/db";
import { erc20Abi } from "@automator/flow-engine";
import { Elysia } from "elysia";
import { formatEther, formatUnits, type Address } from "viem";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import type { ChainFactory } from "../chain/provider";
import { collectWalletTransactions, transactionScanLimit } from "./transactions";

export interface WalletDependencies {
  identity: IdentityProvider | undefined;
  chainFactory?: ChainFactory;
  runs?: RunStore;
}

export function createWalletRoutes({ identity, chainFactory, runs }: WalletDependencies) {
  return new Elysia({ name: "wallet" })
    .use(createAuthGuard(identity))
    .get(
      getWalletTransactionsContract.path,
      async ({ claims, status }) => {
        if (!runs) return status(503, { error: "unavailable" });
        const records = await runs.listRecords(claims.id, transactionScanLimit);
        return { transactions: collectWalletTransactions(records) };
      },
      { response: getWalletTransactionsContract.response },
    )
    .get(
      getWalletContract.path,
      async ({ claims, query, status }) => {
        const chainId = query.chainId === undefined ? defaultChainId : Number(query.chainId);
        if (!isChainId(chainId)) return status(400, { error: "invalid_request" });
        const chain = chainFactory?.chain(chainId);
        if (!chainFactory || !chain) return status(503, { error: "unavailable" });
        const wallet = await chainFactory.wallet(claims.id).catch(() => undefined);
        if (wallet === undefined) return status(503, { error: "unavailable" });
        if (!wallet) return status(404, { error: "not_found" });
        const address = wallet.address as Address;
        let native: bigint;
        let usdc: bigint | undefined;
        try {
          [native, usdc] = await Promise.all([
            chain.reader.getBalance(address),
            chain.usdcAddress
              ? (chain.reader.readContract({
                  address: chain.usdcAddress,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [address],
                }) as Promise<bigint>)
              : Promise.resolve(undefined),
          ]);
        } catch {
          return status(503, { error: "unavailable" });
        }
        const result: Wallet = {
          address: wallet.address,
          chainId: chain.chainId,
          chainName: chain.chainName,
          nativeBalance: formatEther(native),
          nativeSymbol: chain.nativeSymbol,
          ...(usdc === undefined ? {} : { usdcBalance: formatUnits(usdc, 6) }),
          ...(chainFactory.canSign ? { signing: wallet.signing === true } : {}),
        };
        return result;
      },
      { query: getWalletContract.query, response: getWalletContract.response },
    );
}
