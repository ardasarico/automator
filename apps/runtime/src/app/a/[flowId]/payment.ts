import { chains, defaultChainId, getChain, type MiniAppPayment } from "@automator/contracts";
import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Chain,
  type Hex,
  type Transport,
} from "viem";

const transferAbi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
const balanceAbi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

const address = (value: string, what: string): Address => {
  if (!isAddress(value)) throw new Error(`This app's ${what} is not a valid address.`);
  return value;
};

/** The ERC-20 transfer a visitor signs: the API's token, recipient and units, nothing derived. */
export function transferRequest(
  payment: MiniAppPayment,
  from: string,
): { from: Address; to: Address; data: Hex } {
  return {
    from: address(from, "wallet"),
    to: address(payment.token, "payment token"),
    data: encodeFunctionData({
      abi: transferAbi,
      functionName: "transfer",
      args: [address(payment.to, "recipient"), BigInt(payment.amountUnits)],
    }),
  };
}

/**
 * The chain a payment happens on, from the shared registry rather than from the screen: the
 * visitor's wallet is asked to switch to a chain this app actually supports, on its public RPC.
 */
export function paymentChain(payment: MiniAppPayment): Chain {
  const known = getChain(payment.chainId);
  if (!known) throw new Error("This app cannot take payments on that network.");
  return defineChain({
    id: known.id,
    name: known.name,
    nativeCurrency: { name: "Ether", symbol: known.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [known.rpcUrl] } },
    blockExplorers: { default: { name: "Explorer", url: known.explorerUrl } },
  });
}

/** Every chain a flow may collect on, so a visitor's wallet can be asked to switch to any of them. */
export const paymentChains = chains.map((chain) =>
  paymentChain({ chainId: chain.id } as MiniAppPayment),
);
export const defaultPaymentChain = paymentChain({ chainId: defaultChainId } as MiniAppPayment);

function errorText(cause: unknown): string {
  if (typeof cause === "object" && cause !== null) {
    const parts: string[] = [];
    for (const key of ["shortMessage", "details", "message"])
      if (typeof (cause as Record<string, unknown>)[key] === "string")
        parts.push((cause as Record<string, string>)[key]!);
    return parts.join(" ");
  }
  return typeof cause === "string" ? cause : "";
}

function rejectedByVisitor(cause: unknown): boolean {
  const code =
    typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
  // 4001 is the EIP-1193 user rejection; wallets also say it in words.
  return code === 4001 || /user rejected|user denied|rejected the request/i.test(errorText(cause));
}

/**
 * What a visitor is told when a payment does not go through. Chain errors name addresses, revert
 * data and gas maths, so nothing from the wallet is passed through: each case is a sentence the
 * visitor can act on, and everything unrecognised falls back to a plain retry.
 */
export function describePaymentError(cause: unknown): string {
  if (rejectedByVisitor(cause)) return "The payment was cancelled. Pay again when you are ready.";
  const text = errorText(cause);
  if (/insufficient funds|exceeds the balance of the account/i.test(text))
    return "This wallet has too little gas to send the payment. Add a little ETH and try again.";
  if (/exceeds balance|transfer amount exceeds|insufficient balance/i.test(text))
    return "This wallet does not hold enough USDC to pay. Top it up and try again.";
  if (/chain|network/i.test(text) && /switch|unsupported|mismatch|unrecognized/i.test(text))
    return "This wallet could not switch to the network this app takes payments on.";
  return "The payment did not go through. Try again.";
}

/**
 * Which of a visitor's wallets pays. This has to agree with `describeVisitor` on the API, which
 * prefers the Privy embedded wallet and otherwise takes the first Ethereum wallet: the API
 * verifies the transfer came from the wallet it resolved, so paying from any other one is refused.
 */
export function payingWallet<T extends { walletClientType?: string }>(
  wallets: readonly T[],
): T | null {
  return wallets.find((wallet) => wallet.walletClientType === "privy") ?? wallets[0] ?? null;
}

/**
 * What the paying wallet holds, for the screen to show. Read over the chain's own public RPC
 * rather than through the visitor's wallet, so it is right whichever network that wallet is on
 * and showing it never asks them to switch. The transport is a seam for tests.
 */
export async function readUsdcBalance(
  payment: MiniAppPayment,
  owner: string,
  transport: Transport = http(),
): Promise<string> {
  const client = createPublicClient({ chain: paymentChain(payment), transport });
  const balance = await client.readContract({
    address: address(payment.token, "payment token"),
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [address(owner, "wallet")],
  });
  return formatUnits(balance, payment.decimals);
}
