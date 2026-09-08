import {
  getPaymentPolicyContract,
  parseAuthError,
  parseResponse,
  type PaymentPolicy,
  type PaymentPolicyState,
} from "@automator/contracts";
import { WalletRequestError } from "../builder/wallet-client";

export async function requestPaymentPolicy(
  token: string | null,
  signal: AbortSignal,
  policy?: PaymentPolicy,
): Promise<PaymentPolicyState> {
  if (!token) throw new WalletRequestError("unauthorized");
  const response = await fetch("/api/wallet/payment-policy", {
    method: policy ? "PUT" : "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(policy ? { "Content-Type": "application/json" } : {}),
    },
    ...(policy ? { body: JSON.stringify(policy) } : {}),
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new WalletRequestError(parseAuthError(data).error);
  const result = parseResponse(getPaymentPolicyContract, response.status, data);
  if (result.status !== 200) throw new WalletRequestError(result.data.error);
  return result.data;
}
