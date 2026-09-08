import { chainName, type Wallet } from "@automator/contracts";

export function hasNoFunds(wallet: Wallet): boolean {
  return Number(wallet.nativeBalance) === 0 && Number(wallet.usdcBalance ?? "0") === 0;
}

export function noFundsMessage(chainId: number): string {
  return `This wallet has no funds on ${chainName(chainId)}.`;
}
