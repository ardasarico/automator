import {
  samplePayerAddress,
  samplePaymentTxHash,
  sampleCollectorAddress,
  type FlowNode,
} from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { autoAnswer } from "./screens";

function node(type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id: "n", type, position: { x: 0, y: 0 }, label: "n", config };
}

describe("autoAnswer", () => {
  test("takes the continue port of a page and a QR code", () => {
    expect(autoAnswer(node("screen.page"))).toEqual({
      next: { action: "next" },
      simulated: { port: "next" },
    });
    expect(autoAnswer(node("screen.qr-code"))).toEqual({
      next: { action: "next" },
      simulated: { port: "next" },
    });
  });

  test("takes the confirmation's configured answer, confirmed by default", () => {
    expect(autoAnswer(node("screen.confirmation"))).toEqual({
      confirmed: { action: "confirmed" },
      simulated: { port: "confirmed" },
    });
    expect(autoAnswer(node("screen.confirmation", { simulate: "cancelled" }))).toEqual({
      cancelled: { action: "cancelled" },
      simulated: { port: "cancelled" },
    });
  });

  test("fills a form from samples, then by field type", () => {
    const form = node("screen.form", {
      fields: [
        { id: "name", label: "Full name", type: "text" },
        { id: "email", type: "email" },
        { id: "seats", type: "number" },
        { id: "notes", type: "textarea", sample: "Window seat please" },
        { id: "", label: "Ignored" },
      ],
    });
    expect(autoAnswer(form)).toEqual({
      submitted: {
        name: "Sample Full name",
        email: "visitor@example.com",
        seats: "1",
        notes: "Window seat please",
      },
      simulated: { port: "submitted" },
    });
  });

  test("signs a Privy login in as the configured sample visitor", () => {
    expect(autoAnswer(node("privy.login", { simulate: { email: "ada@example.com" } }))).toEqual({
      user: {
        userId: "did:privy:sample-visitor",
        email: "ada@example.com",
        wallet: "0x0000000000000000000000000000000000000001",
        loginMethod: "email",
      },
      simulated: { port: "user" },
    });
  });

  test("keeps special field names as own form values", () => {
    const answer = autoAnswer(
      node("screen.form", {
        fields: [{ id: "__proto__", sample: "retained" }],
      }),
    );
    expect(answer?.submitted).toEqual(JSON.parse('{"__proto__":"retained"}'));
    expect(Object.hasOwn(answer?.submitted as object, "__proto__")).toBe(true);
  });

  test("verifies a World ID check with a sample proof, or rejects it when asked", () => {
    expect(
      autoAnswer(node("world.id-verify", { action: "claim", verificationLevel: "orb" })),
    ).toEqual({
      verified: {
        nullifierHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
        verificationLevel: "orb",
        action: "claim",
      },
      simulated: { port: "verified" },
    });
    expect(autoAnswer(node("world.id-verify", { simulate: "rejected" }))).toEqual({
      rejected: { code: "invalid_proof", detail: "Simulate took the rejected branch." },
      simulated: { port: "rejected" },
    });
  });

  test("is null for a node that is not a screen", () => {
    expect(autoAnswer(node("logic.wait"))).toBeNull();
  });
});

describe("autoAnswer for a collect-payment screen", () => {
  test("takes Paid with a simulated transfer, resolving the amount the flow asked for", () => {
    expect(
      autoAnswer(node("usdc.payment", { amount: "{{vars.price}}", to: "" }), {
        scope: { input: {}, vars: { price: "12.50" }, trigger: undefined },
        chainId: 84532,
      }),
    ).toEqual({
      paid: {
        paid: true,
        simulated: true,
        txHash: samplePaymentTxHash,
        from: samplePayerAddress,
        to: sampleCollectorAddress,
        amount: "12.50",
        chainId: 84532,
      },
      simulated: { port: "paid" },
    });
  });

  test("keeps the recipient the flow configured", () => {
    const answer = autoAnswer(
      node("usdc.payment", { amount: "1", to: "0x1111111111111111111111111111111111111111" }),
    );
    expect((answer!.paid as { to: string }).to).toBe("0x1111111111111111111111111111111111111111");
  });

  test("takes Declined when asked, and says nothing was paid", () => {
    expect(autoAnswer(node("usdc.payment", { simulate: "declined", amount: "1" }))).toEqual({
      declined: { paid: false },
      simulated: { port: "declined" },
    });
  });
});

describe("autoAnswer for a selfie check", () => {
  test("takes Verified with a sample selfie credential, or Rejected when configured", () => {
    expect(autoAnswer(node("world.selfie-check", { action: "claim" }))).toEqual({
      verified: {
        verified: true,
        nullifierHash: "0x0000000000000000000000000000000000000000000000000000000000000002",
        credential: "selfie",
        action: "claim",
      },
      simulated: { port: "verified" },
    });
    expect(autoAnswer(node("world.selfie-check", { simulate: "rejected" }))).toEqual({
      rejected: {
        verified: false,
        code: "invalid_proof",
        detail: "Simulate took the rejected branch.",
      },
      simulated: { port: "rejected" },
    });
  });
});
