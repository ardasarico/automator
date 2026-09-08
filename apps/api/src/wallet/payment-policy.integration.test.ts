import { expect, test } from "bun:test";
import { SQL } from "bun";
import { createDatabase } from "@automator/db";
import { chains, type PaymentPolicy, type PaymentPolicyState } from "@automator/contracts";
import type { ChainSigner } from "@automator/flow-engine";
import { encodeFunctionData, erc20Abi } from "viem";
import { createApp } from "../app";
import { createPaymentPolicySigner } from "../chain/payment-policy";

const url = process.env.TEST_DATABASE_URL;

test.skipIf(!url)(
  "saved API limits govern concurrent signers and retain uncertain payment usage",
  async () => {
    const owner = `did:privy:payment-api-${crypto.randomUUID()}`;
    const first = createDatabase(url);
    const second = createDatabase(url);
    const cleanup = new SQL(url!);
    const recipient = "0x1111111111111111111111111111111111111111" as const;
    const hash = `0x${"a".repeat(64)}` as const;
    let calls = 0;
    let fail = false;
    try {
      await first.migrate();
      await first.users.sync(owner, recipient);
      const app = createApp({
        database: first,
        paymentPolicies: first.paymentPolicies,
        identity: {
          verify: async (token) => (token === owner ? { id: owner, expiresAt: 2e9 } : null),
          walletAddress: async () => null,
        },
      });
      const request = (policy?: PaymentPolicy) =>
        app.handle(
          new Request("http://localhost/wallet/payment-policy", {
            method: policy ? "PUT" : "GET",
            headers: { authorization: `Bearer ${owner}`, "content-type": "application/json" },
            ...(policy ? { body: JSON.stringify(policy) } : {}),
          }),
        );
      expect(
        (
          await request({
            enabled: true,
            recipients: [recipient],
            limits: [{ chainId: 84532, asset: "usdc", perTransfer: "6", perDay: "10" }],
          })
        ).status,
      ).toBe(200);
      const raw: ChainSigner = {
        address: recipient,
        async sendTransaction() {
          calls++;
          if (fail) throw new Error("Submission result unknown");
          return hash;
        },
        async writeContract() {
          throw new Error("Unexpected write path");
        },
        async signMessage() {
          throw new Error("Unexpected signature");
        },
        async signTransaction() {
          throw new Error("Unexpected offline transaction");
        },
      };
      const signers = [first, second].map((db) =>
        createPaymentPolicySigner(raw, owner, 84532, chains[0].usdcAddress, db.paymentPolicies),
      );
      const transfer = (amount: bigint) => ({
        to: chains[0].usdcAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [recipient, amount],
        }),
      });
      const attempts = await Promise.allSettled(
        signers.map((signer) => signer.sendTransaction(transfer(6_000_000n))),
      );
      expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(calls).toBe(1);
      expect(((await (await request()).json()) as PaymentPolicyState).usage).toEqual([
        { chainId: 84532, asset: "usdc", reserved: "6" },
      ]);
      fail = true;
      await expect(signers[0]!.sendTransaction(transfer(4_000_000n))).rejects.toThrow(
        "Submission result unknown",
      );
      await expect(signers[1]!.sendTransaction(transfer(1n))).rejects.toThrow("daily limit");
      expect(calls).toBe(2);
      expect(((await (await request()).json()) as PaymentPolicyState).usage).toEqual([
        { chainId: 84532, asset: "usdc", reserved: "10" },
      ]);
    } finally {
      await cleanup`DELETE FROM automator_users WHERE id = ${owner}`;
      await Promise.all([first.close(), second.close(), cleanup.close()]);
    }
  },
);
