import { chainName, type Wallet } from "@automator/contracts";

/**
 * Pure checks shared by the client balance widgets and the server-rendered wallet page;
 * kept out of the client module so a server component can call them.
 */

/** True when the wallet holds nothing the flow could spend on that chain. */
export function hasNoFunds(wallet: Wallet): boolean {
  return Number(wallet.nativeBalance) === 0 && Number(wallet.usdcBalance ?? "0") === 0;
}

/** The warning the settings dialog, the run panel and the wallet page share. */
export function noFundsMessage(chainId: number): string {
  return `This wallet has no funds on ${chainName(chainId)}.`;
}
