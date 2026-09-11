import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { chainIdSchema, chains } from "./chains";
import { apiErrorResponses } from "./contract";
import { addressPattern } from "./hex";

export const paymentAssetSchema = Type.Union([Type.Literal("native"), Type.Literal("usdc")]);
export type PaymentAsset = Static<typeof paymentAssetSchema>;
const amountSchema = Type.String({ maxLength: 100, pattern: "^(0|[1-9][0-9]*)(\\.[0-9]+)?$" });
const addressSchema = Type.String({ pattern: addressPattern });

export const paymentLimitSchema = Type.Object(
  {
    chainId: chainIdSchema,
    asset: paymentAssetSchema,
    perTransfer: amountSchema,
    perDay: amountSchema,
  },
  { additionalProperties: false },
);
export type PaymentLimit = Static<typeof paymentLimitSchema>;

export const paymentPolicySchema = Type.Object(
  {
    enabled: Type.Boolean(),
    /** An empty list permits any direct recipient. */
    recipients: Type.Array(addressSchema, { maxItems: 100 }),
    limits: Type.Array(paymentLimitSchema, { maxItems: chains.length * 2 }),
  },
  { additionalProperties: false },
);
export type PaymentPolicy = Static<typeof paymentPolicySchema>;

export const paymentPolicyStateSchema = Type.Object({
  policy: paymentPolicySchema,
  day: Type.String({ pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }),
  usage: Type.Array(
    Type.Object({
      chainId: chainIdSchema,
      asset: paymentAssetSchema,
      reserved: amountSchema,
    }),
    { maxItems: chains.length * 2 },
  ),
});
export type PaymentPolicyState = Static<typeof paymentPolicyStateSchema>;

export const getPaymentPolicyContract = {
  method: "GET",
  path: "/wallet/payment-policy",
  response: { 200: paymentPolicyStateSchema, ...apiErrorResponses },
} as const;
export const updatePaymentPolicyContract = {
  method: "PUT",
  path: "/wallet/payment-policy",
  body: paymentPolicySchema,
  response: { 200: paymentPolicyStateSchema, ...apiErrorResponses },
} as const;

const UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);
export function paymentAssetDecimals(asset: PaymentAsset): number {
  return asset === "native" ? 18 : 6;
}

export function paymentAmountToUnits(text: string, asset: PaymentAsset): bigint | null {
  if (text.length > 100 || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text)) return null;
  const decimals = paymentAssetDecimals(asset);
  const [whole, fraction = ""] = text.split(".");
  if (/[^0]/.test(fraction.slice(decimals))) return null;
  const units = BigInt(whole! + fraction.slice(0, decimals).padEnd(decimals, "0"));
  return units <= UINT256_MAX ? units : null;
}

export function paymentUnitsToAmount(units: bigint, asset: PaymentAsset): string {
  const decimals = paymentAssetDecimals(asset);
  const digits = units.toString().padStart(decimals + 1, "0");
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return digits.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}

export function paymentPolicyProblem(value: unknown): string | null {
  if (!Value.Check(paymentPolicySchema, value))
    return "Check the payment limit fields and recipient addresses.";
  if (value.enabled && value.limits.length === 0)
    return "Add at least one asset limit before enabling payment limits.";
  const seen = new Set<string>();
  for (const limit of value.limits) {
    const key = `${limit.chainId}:${limit.asset}`;
    if (seen.has(key)) return "Each chain and asset can have only one limit.";
    seen.add(key);
    for (const amount of [limit.perTransfer, limit.perDay]) {
      const units = paymentAmountToUnits(amount, limit.asset);
      if (units === null || units <= BigInt(0))
        return `Enter positive limits with at most ${paymentAssetDecimals(limit.asset)} decimal places.`;
    }
  }
  return null;
}

export function normalizePaymentPolicy(policy: PaymentPolicy): PaymentPolicy {
  return {
    enabled: policy.enabled,
    recipients: [...new Set(policy.recipients.map((address) => address.toLowerCase()))],
    limits: policy.limits.map((limit) => ({
      ...limit,
      perTransfer: paymentUnitsToAmount(
        paymentAmountToUnits(limit.perTransfer, limit.asset)!,
        limit.asset,
      ),
      perDay: paymentUnitsToAmount(paymentAmountToUnits(limit.perDay, limit.asset)!, limit.asset),
    })),
  };
}
