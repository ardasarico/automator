import { describe, expect, test } from "bun:test";
import { createWorldVerifier, hashSignal, WorldVerifyError } from "./verify";

const proof = {
  merkle_root: "0x1",
  nullifier_hash: "0x2",
  proof: "0x3",
  verification_level: "orb",
};

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
}

describe("hashSignal", () => {
  test("is keccak256 of the text shifted right by a byte, as 32 hex bytes", () => {
    // Known vector: the empty signal hashes to keccak256("") >> 8.
    expect(hashSignal("")).toBe(
      "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
    );
    expect(hashSignal("hello")).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSignal("hello")).not.toBe(hashSignal("hello!"));
  });
});

describe("createWorldVerifier", () => {
  test("is absent without an app id", () => {
    expect(createWorldVerifier(undefined)).toBeUndefined();
    expect(createWorldVerifier("")).toBeUndefined();
  });

  test("posts the proof, action and signal hash to the Developer Portal and reads the verification", async () => {
    const calls: { url: string; body: unknown; headers: unknown }[] = [];
    const verifier = createWorldVerifier(
      "app_123",
      fakeFetch((url, init) => {
        calls.push({ url, body: JSON.parse(String(init?.body)), headers: init?.headers });
        return Response.json({
          success: true,
          action: "claim",
          nullifier_hash: "0x2",
          created_at: "2026-09-07T10:00:00Z",
        });
      }),
    )!;
    const result = await verifier.verify({ action: "claim", signal: "0xabc", proof });
    expect(result).toEqual({
      ok: true,
      verification: { nullifierHash: "0x2", verificationLevel: "orb", action: "claim" },
    });
    expect(calls).toEqual([
      {
        url: "https://developer.worldcoin.org/api/v2/verify/app_123",
        headers: { "Content-Type": "application/json" },
        body: { ...proof, action: "claim", signal_hash: hashSignal("0xabc") },
      },
    ]);
  });

  test("maps a 400 with a code to a rejection", async () => {
    const verifier = createWorldVerifier(
      "app_123",
      fakeFetch(() =>
        Response.json(
          {
            code: "max_verifications_reached",
            detail: "This person has already verified for this action.",
            attribute: null,
          },
          { status: 400 },
        ),
      ),
    )!;
    expect(await verifier.verify({ action: "claim", signal: "", proof })).toEqual({
      ok: false,
      rejection: {
        code: "max_verifications_reached",
        detail: "This person has already verified for this action.",
      },
    });
  });

  test("throws on an outage or an answer it cannot read", async () => {
    const down = createWorldVerifier(
      "app_123",
      fakeFetch(() => new Response("gateway", { status: 502 })),
    )!;
    await expect(down.verify({ action: "claim", signal: "", proof })).rejects.toBeInstanceOf(
      WorldVerifyError,
    );
    const odd = createWorldVerifier(
      "app_123",
      fakeFetch(() => Response.json({ hello: "world" })),
    )!;
    await expect(odd.verify({ action: "claim", signal: "", proof })).rejects.toBeInstanceOf(
      WorldVerifyError,
    );
  });
});
