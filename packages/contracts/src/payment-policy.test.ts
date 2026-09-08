import { describe, expect, test } from "bun:test";
import {
  normalizePaymentPolicy,
  paymentAmountToUnits,
  paymentPolicyProblem,
  paymentUnitsToAmount,
  type PaymentPolicy,
} from "./payment-policy";

const policy: PaymentPolicy = {
  enabled: true,
  recipients: [],
  limits: [{ chainId: 84532, asset: "usdc", perTransfer: "10", perDay: "50" }],
};

describe("payment policy boundary", () => {
  test("preserves large exact decimal amounts and rejects rounded or unsafe formats", () => {
    expect(paymentAmountToUnits("9007199254740993.000001", "usdc")).toBe(9007199254740993000001n);
    expect(paymentAmountToUnits("0.000000000000000001", "native")).toBe(1n);
    expect(paymentAmountToUnits("1.0000000", "usdc")).toBe(1000000n);
    for (const invalid of ["1.0000001", "1e2", "-1", "01", "NaN", " 1", "1."])
      expect(paymentAmountToUnits(invalid, "usdc")).toBeNull();
    const max = (1n << 256n) - 1n;
    for (const asset of ["native", "usdc"] as const) {
      for (const units of [0n, 1n, 1000000n, 9007199254740993n, max])
        expect(paymentAmountToUnits(paymentUnitsToAmount(units, asset), asset)).toBe(units);
      expect(paymentAmountToUnits(paymentUnitsToAmount(max + 1n, asset), asset)).toBeNull();
    }
  });

  test("requires configured positive limits and rejects duplicate chain/asset rules", () => {
    expect(paymentPolicyProblem(policy)).toBeNull();
    expect(paymentPolicyProblem({ enabled: false, recipients: [], limits: [] })).toBeNull();
    expect(paymentPolicyProblem({ ...policy, limits: [] })).toContain("at least one");
    expect(
      paymentPolicyProblem({ ...policy, limits: [...policy.limits, ...policy.limits] }),
    ).toContain("only one");
    for (const perTransfer of ["0", "-1", "1.0000001", "1e3"])
      expect(
        paymentPolicyProblem({ ...policy, limits: [{ ...policy.limits[0], perTransfer }] }),
      ).not.toBeNull();
  });

  test("rejects unsupported assets/chains, invalid recipients and extra input fields", () => {
    for (const invalid of [
      { ...policy, enabled: "false" },
      { ...policy, ownerId: "another-owner" },
      { ...policy, recipients: ["0xshort"] },
      { ...policy, limits: [{ ...policy.limits[0], chainId: 1 }] },
      { ...policy, limits: [{ ...policy.limits[0], asset: "btc" }] },
    ])
      expect(paymentPolicyProblem(invalid)).not.toBeNull();
  });

  test("normalizes addresses and units without mutating the submitted snapshot", () => {
    const upper = `0x${"A".repeat(40)}`;
    const input: PaymentPolicy = {
      ...policy,
      recipients: [upper, upper.toLowerCase()],
      limits: [{ chainId: 84532, asset: "usdc", perTransfer: "10.000000", perDay: "50.0000000" }],
    };
    expect(normalizePaymentPolicy(input)).toEqual({ ...policy, recipients: [upper.toLowerCase()] });
    expect(input.limits[0]?.perDay).toBe("50.0000000");
    expect(input.recipients).toHaveLength(2);
  });
});
