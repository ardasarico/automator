import { defaultChainId, getWalletContract, isChainId, type Wallet } from "@automator/contracts";
import { erc20Abi } from "@automator/flow-engine";
import { Elysia } from "elysia";
import { formatEther, formatUnits, type Address } from "viem";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import type { ChainFactory } from "../chain/provider";

export interface WalletDependencies {
  identity: IdentityProvider | undefined;
  /** Absent when the API has no chain provider; the route then answers 503. */
  chainFactory?: ChainFactory;
}

/**
 * `GET /wallet`: the caller's embedded wallet on one chain (`?chainId=`, the default chain
 * otherwise) with its native and USDC balances, so the builder can warn about an unfunded
 * wallet before a live run. Reads only; nothing here needs a signer.
 */
export function createWalletRoutes({ identity, chainFactory }: WalletDependencies) {
  return new Elysia({ name: "wallet" }).use(createAuthGuard(identity)).get(
    getWalletContract.path,
    async ({ claims, query, status }) => {
      const chainId = query.chainId === undefined ? defaultChainId : Number(query.chainId);
      if (!isChainId(chainId)) return status(400, { error: "invalid_request" });
      const chain = chainFactory?.chain(chainId);
      if (!chainFactory || !chain) return status(503, { error: "unavailable" });
      const wallet = await chainFactory.wallet(claims.id);
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
        ...(chainFactory.canSign ? { signing: wallet.delegated } : {}),
      };
      return result;
    },
    { query: getWalletContract.query, response: getWalletContract.response },
  );
}
