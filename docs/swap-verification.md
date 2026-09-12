# USDC to ETH contract flow

Automator's existing `onchain.write-contract` nodes can approve USDC and swap it for native ETH through Uniswap v3 on Base Sepolia. No new executor or deployed contract is required.

The [opt-in verification script](../apps/api/src/chain/swap.fork.ts) builds and validates a four-node flow:

`Manual trigger → Approve 1 USDC → Swap and unwrap → Read remaining USDC`

The swap node calls `SwapRouter02.multicall(uint256,bytes[])` with `exactInputSingle` and `unwrapWETH9`. The router receives WETH and returns native ETH to the caller in the same transaction. Approval is limited to the exact input, the minimum output is 99% of the fresh QuoterV2 quote, and the transaction expires after ten minutes. Amounts use integer base units.

## Reproduce

Install [Foundry](https://getfoundry.sh/introduction/installation/), then start a disposable fork in one terminal. This check needs no database, Privy credentials, Graph key, or Discord webhook.

```sh
anvil --host 127.0.0.1 --port 8547 \
  --fork-url https://sepolia.base.org --fork-block-number 46730341 \
  --chain-id 84532 --no-storage-caching --silent
```

From the repository root in another terminal:

```sh
bun apps/api/src/chain/swap.fork.ts
```

The script refuses non-loopback URLs and non-Anvil nodes. It funds a fresh account and mints test USDC **only on the local fork**, runs the actual API chain reader and flow executors, and restores the initial snapshot in `finally`. Stop Anvil after the check. `SWAP_FORK_RPC_URL` can select a different loopback port; `SWAP_REPORT_DIR` changes the default `/tmp/automator-swap` artifact directory.

Artifacts are `flow.json`, `run.json`, and `report.json`. The generated flow is a short-lived manual proof with a fixed quote and deadline, not a ready-to-publish recurring strategy. Regenerate it before another run.

## Verified on September 12, 2026

- Base Sepolia fork block: `46730341`.
- USDC/WETH pool, fee 500: `0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0`.
- Input: `1` test USDC. Output: `0.000491939972650661` native ETH, confirmed by the mined withdrawal event. Gas is additional.
- Exact approval followed by swap succeeds from zero allowance; USDC input and allowance are fully consumed, and the recipient holds native ETH rather than WETH.
- An output floor above the quote and an expired deadline fail with their expected contract errors.
- The default stateless dry run simulates approval successfully but then fails the unapproved swap; it broadcasts no transaction and leaves allowance unchanged.

## Demo boundaries

This verifies real contract execution in a local fork, using a local signer. It does **not** verify live Privy custody/signing, a published automation, a Chainlink watcher, a Graph request, or Discord delivery. The API's existing Privy adapter signs generic contract writes, but that external service was not called by this check.

For a repeating price-triggered example, calculate a fresh quote, minimum output, and deadline for each run; do not reuse the proof's encoded calldata indefinitely. A Graph liquidity check must describe the same chain and pool as the trade. The existing marketplace pool-watch example reads Ethereum mainnet and cannot establish liquidity for this Base Sepolia pool.

The default canvas **Simulate** uses independent `eth_call`/gas estimates. It does not preserve an approval's state for the next node. This check uses sequential execution on a disposable fork. Do not describe the default simulation as a stateful fork rehearsal.

Account payment limits currently permit direct native/USDC transfers and reject arbitrary contract writes, including approvals and swaps. This proof does not change or bypass that policy. A live swap also requires sufficient test USDC, native ETH for gas, available pool liquidity, and an authorized signer.

Contract references: [official Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments), [V3 swap implementation](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/V3SwapRouter.sol), [deadline multicall](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/base/MulticallExtended.sol), and [native ETH unwrap](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/base/PeripheryPaymentsExtended.sol).
