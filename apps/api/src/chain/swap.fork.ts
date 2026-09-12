/** Opt-in contract integration check. Run against a disposable Base Sepolia Anvil fork only. */
import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  findFlowDocumentProblem,
  flowDocumentSchema,
  flowNodePorts,
  Value,
  type FlowDocument,
  type FlowNode,
} from "@automator/contracts";
import { runFlow, type ChainProvider, type ChainSigner } from "@automator/flow-engine";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeFunctionResult,
  encodeFunctionData,
  formatEther,
  http,
  parseAbi,
  parseEther,
  parseEventLogs,
} from "viem";
import { baseSepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createChainFactory } from "./provider";

// Official deployments: https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments
const router = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4";
const quoter = "0xC5290058841028F1614F3A6F0F5816cAd0df5E27";
const factory = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const weth = "0x4200000000000000000000000000000000000006";
// A disposable local account, never a user's Privy wallet.
const account = privateKeyToAccount(generatePrivateKey()).address;
const fee = 500;
const amountIn = 1_000_000n; // Exactly one test USDC.
const tokenAbi = parseAbi([
  "function masterMinter() view returns (address)",
  "function configureMinter(address minter, uint256 allowance) returns (bool)",
  "function mint(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);
const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function unwrapWETH9(uint256 amountMinimum) payable",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
]);

function swapFlow(minimum: bigint, deadline: bigint): FlowDocument {
  // Send WETH to the router; unwrap sends native ETH to msg.sender.
  // Both execute in one transaction, so there is no publicly claimable WETH between nodes.
  const swap = encodeFunctionData({
    abi: routerAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: usdc,
        tokenOut: weth,
        fee,
        recipient: router,
        amountIn,
        amountOutMinimum: minimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const unwrap = encodeFunctionData({
    abi: routerAbi,
    functionName: "unwrapWETH9",
    args: [minimum],
  });
  const node = (
    id: string,
    type: FlowNode["type"],
    label: string,
    column: number,
    config: FlowNode["config"] = {},
  ): FlowNode => ({
    id,
    type,
    label,
    position: { x: column * 320, y: 100 },
    config,
  });
  return {
    version: 1,
    id: "base-sepolia-swap-proof",
    name: "Swap 1 USDC to ETH",
    description:
      "Manual contract proof; quote and deadline are fixed when generated. Regenerate before running.",
    chainId: baseSepolia.id,
    nodes: [
      node("start", "trigger.manual", "Start", 0),
      node("approve", "onchain.write-contract", "Approve 1 USDC", 1, {
        address: usdc,
        abi: "function approve(address spender,uint256 amount) returns (bool)",
        functionName: "approve",
        args: JSON.stringify([router, amountIn.toString()]),
        value: "0",
      }),
      node("swap", "onchain.write-contract", "Swap USDC to ETH", 2, {
        address: router,
        abi: "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])",
        functionName: "multicall",
        args: JSON.stringify([deadline.toString(), [swap, unwrap]]),
        value: "0",
      }),
      node("balance", "usdc.balance", "Read remaining USDC", 3, { address: "" }),
    ],
    edges: [
      {
        id: "start-approve",
        source: "start",
        sourceHandle: "run",
        target: "approve",
        targetHandle: "args",
      },
      {
        id: "approve-swap",
        source: "approve",
        sourceHandle: "receipt",
        target: "swap",
        targetHandle: "args",
      },
      {
        id: "swap-balance",
        source: "swap",
        sourceHandle: "receipt",
        target: "balance",
        targetHandle: "wallet",
      },
    ],
  };
}

async function verifySwap() {
  const rpcUrl = process.env.SWAP_FORK_RPC_URL ?? "http://127.0.0.1:8547";
  const url = new URL(rpcUrl);
  assert.equal(url.protocol, "http:", "Use a local HTTP Anvil fork");
  assert.ok(["127.0.0.1", "[::1]"].includes(url.hostname), "Refusing a non-loopback RPC");
  const transport = http(rpcUrl, { timeout: 30_000, retryCount: 0 });
  const client = createPublicClient({ chain: baseSepolia, transport });
  assert.match(
    await client.request({ method: "web3_clientVersion" }),
    /anvil/i,
    "Refusing a non-Anvil node",
  );
  assert.equal(await client.getChainId(), baseSepolia.id, "Fork Base Sepolia");
  const local = createTestClient({ chain: baseSepolia, mode: "anvil", transport });
  const initial = await local.snapshot();
  const forkBlock = await client.getBlockNumber();
  const reportDirectory = process.env.SWAP_REPORT_DIR ?? "/tmp/automator-swap";
  let minter: `0x${string}` | undefined;
  try {
    const pool = await client.readContract({
      address: factory,
      abi: parseAbi(["function getPool(address,address,uint24) view returns(address)"]),
      functionName: "getPool",
      args: [usdc, weth, fee],
    });
    assert.notEqual(pool, "0x0000000000000000000000000000000000000000");
    const liquidity = await client.readContract({
      address: pool,
      abi: parseAbi(["function liquidity() view returns(uint128)"]),
      functionName: "liquidity",
    });
    assert.ok(liquidity > 0n, "The real testnet pool needs active liquidity");
    minter = await client.readContract({
      address: usdc,
      abi: tokenAbi,
      functionName: "masterMinter",
    });
    // Mint only on this disposable fork. Pool balances and liquidity are left intact.
    await local.setBalance({ address: minter, value: parseEther("10") });
    await local.setBalance({ address: account, value: parseEther("10") });
    await local.impersonateAccount({ address: minter });
    await local.impersonateAccount({ address: account });
    const minterWallet = createWalletClient({ account: minter, chain: baseSepolia, transport });
    const wallet = createWalletClient({ account, chain: baseSepolia, transport });
    const configure = await minterWallet.writeContract({
      address: usdc,
      abi: tokenAbi,
      functionName: "configureMinter",
      args: [account, amountIn],
    });
    assert.equal((await client.waitForTransactionReceipt({ hash: configure })).status, "success");
    const mint = await wallet.writeContract({
      address: usdc,
      abi: tokenAbi,
      functionName: "mint",
      args: [account, amountIn],
    });
    assert.equal((await client.waitForTransactionReceipt({ hash: mint })).status, "success");

    const quote = await client.simulateContract({
      address: quoter,
      account,
      abi: parseAbi([
        "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
      ]),
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: usdc, tokenOut: weth, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    const expectedOut = quote.result[0];
    const minimum = (expectedOut * 99n) / 100n;
    assert.ok(minimum > 0n, "Require a positive output floor");
    const deadline = (await client.getBlock()).timestamp + 600n;
    const document = swapFlow(minimum, deadline);
    assert.ok(Value.Check(flowDocumentSchema, document));
    assert.equal(findFlowDocumentProblem(document), null);
    for (const edge of document.edges) {
      const source = document.nodes.find((n) => n.id === edge.source)!;
      const target = document.nodes.find((n) => n.id === edge.target)!;
      assert.ok(flowNodePorts[source.type].outputs.some((p) => p === edge.sourceHandle));
      assert.ok(flowNodePorts[target.type].inputs.some((p) => p === edge.targetHandle));
    }
    // Use the actual API reader and flow executors. Only custody is replaced by an Anvil signer.
    const reader = createChainFactory(
      [{ chainId: baseSepolia.id, rpcUrl, usdcAddress: usdc }],
      undefined,
      undefined,
    ).chain(baseSepolia.id)!.reader;
    const signer: ChainSigner = {
      address: account,
      writeContract: (call) => wallet.writeContract(call as never),
      sendTransaction: (request) => wallet.sendTransaction(request),
      signMessage: async () => {
        throw new Error("Not used in this proof");
      },
      signTransaction: async () => {
        throw new Error("Not used in this proof");
      },
    };
    const chain: ChainProvider = {
      chainId: baseSepolia.id,
      chainName: baseSepolia.name,
      account,
      reader,
      signer,
      mode: "live",
      usdcAddress: usdc,
    };
    await mkdir(reportDirectory, { recursive: true });
    await Bun.write(join(reportDirectory, "flow.json"), JSON.stringify(document, null, 2));

    // Default eth_call simulation cannot carry approve into the next call. Prove the boundary.
    const beforeDry = await client.getTransactionCount({ address: account });
    const dry = await runFlow(document, { chain: { ...chain, mode: "dry-run" } });
    assert.equal(dry.nodes.find((n) => n.nodeId === "approve")?.status, "succeeded");
    assert.equal(dry.nodes.find((n) => n.nodeId === "swap")?.status, "failed");
    assert.equal(await client.getTransactionCount({ address: account }), beforeDry);
    const allowance = () =>
      client.readContract({
        address: usdc,
        abi: tokenAbi,
        functionName: "allowance",
        args: [account, router],
      });
    assert.equal(await allowance(), 0n);

    // A strict minimum must revert the complete swap and unwrap without spending tokens.
    const beforeRejected = await local.snapshot();
    const bad = swapFlow(expectedOut * 2n, deadline);
    const rejected = await runFlow(bad, { chain });
    assert.equal(rejected.nodes.find((n) => n.nodeId === "swap")?.status, "failed");
    assert.match(rejected.nodes.find((n) => n.nodeId === "swap")!.error!, /Too little received/);
    assert.equal(
      await client.readContract({
        address: usdc,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [account],
      }),
      amountIn,
    );
    await local.revert({ id: beforeRejected });
    const beforeExpired = await local.snapshot();
    const expired = swapFlow(minimum, (await client.getBlock()).timestamp - 1n);
    const stale = await runFlow(expired, { chain });
    assert.equal(stale.nodes.find((n) => n.nodeId === "swap")?.status, "failed");
    assert.match(stale.nodes.find((n) => n.nodeId === "swap")!.error!, /Transaction too old/);
    await local.revert({ id: beforeExpired });
    assert.equal(await allowance(), 0n, "The successful flow must start without an approval");

    const beforeEth = await client.getBalance({ address: account });
    const run = await runFlow(document, { chain });
    await Bun.write(join(reportDirectory, "run.json"), JSON.stringify(run, null, 2));
    assert.equal(
      run.status,
      "succeeded",
      JSON.stringify(run.nodes.filter((n) => n.status === "failed")),
    );
    const swapReceipt = run.nodes.find((n) => n.nodeId === "swap")!.outputs!.receipt as {
      hash: `0x${string}`;
      result: [`0x${string}`, `0x${string}`];
    };
    const simulatedOut = decodeFunctionResult({
      abi: routerAbi,
      functionName: "exactInputSingle",
      data: swapReceipt.result[0],
    });
    const afterEth = await client.getBalance({ address: account });
    const afterUsdc = await client.readContract({
      address: usdc,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [account],
    });
    const afterWeth = await client.readContract({
      address: weth,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [account],
    });
    assert.equal(afterUsdc, 0n);
    assert.equal(afterWeth, 0n, "The wallet should receive native ETH, not WETH");
    assert.ok(afterEth > beforeEth, "Native ETH must increase after paying gas");
    assert.equal(await allowance(), 0n, "Exact approval must be consumed");
    const receipt = await client.getTransactionReceipt({ hash: swapReceipt.hash });
    assert.equal(receipt.status, "success");
    const withdrawals = parseEventLogs({
      abi: parseAbi(["event Withdrawal(address indexed src,uint256 wad)"]),
      logs: receipt.logs.filter((log) => log.address.toLowerCase() === weth.toLowerCase()),
    });
    assert.equal(withdrawals.length, 1);
    assert.equal(withdrawals[0]!.args.src.toLowerCase(), router.toLowerCase());
    const received = withdrawals[0]!.args.wad;
    assert.ok(received >= minimum, "The mined swap must meet the minimum output");
    const report = {
      environment: "Local Anvil fork; no public-chain writes or real funds",
      forkBlock: forkBlock.toString(),
      chainId: baseSepolia.id,
      pool,
      router,
      liquidity: liquidity.toString(),
      amountInUsdc: "1",
      quotedEth: formatEther(expectedOut),
      minimumEth: formatEther(minimum),
      simulatedEthOut: formatEther(simulatedOut),
      receivedEth: formatEther(received),
      nativeEthIncreaseAfterGas: formatEther(afterEth - beforeEth),
      remainingUsdc: afterUsdc.toString(),
      remainingWeth: afterWeth.toString(),
      remainingAllowance: "0",
      transactionHash: swapReceipt.hash,
      checks: [
        "real router and pool",
        "invalid minimum rejected",
        "expired deadline rejected",
        "stateless dry-run does not apply approval",
        "flow approval then atomic swap and unwrap succeeded",
      ],
      limitations: [
        "Local signer replaces Privy custody",
        "No Chainlink watcher, Graph query or Discord delivery in this swap proof",
        "Generated flow has a fixed quote and ten-minute deadline; regenerate before use",
        "Account payment limits block arbitrary contract writes when enabled",
      ],
    };
    await Bun.write(join(reportDirectory, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`Artifacts: ${reportDirectory}`);
  } finally {
    if (minter) await local.stopImpersonatingAccount({ address: minter });
    await local.stopImpersonatingAccount({ address: account });
    await local.revert({ id: initial });
  }
}

if (import.meta.main) await verifySwap();
