import type { WorldProof } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import {
  createWorldVerifier,
  hashSignal,
  readWorldConfig,
  WorldVerifyError,
  type WorldConfig,
} from "./verify";

/** A throwaway secp256k1 key: signing only needs a 32-byte hex scalar. */
const signingKey = "1".repeat(64);

const config: WorldConfig = {
  appId: "app_123",
  rpId: "rp_456",
  signingKey,
  environment: "staging",
};

const proof: WorldProof = {
  protocol_version: "4.0",
  nonce: "0xabc",
  action: "claim",
  environment: "staging",
  responses: [
    {
      identifier: "proof_of_human",
      issuer_schema_id: 1,
      nullifier: "0x2",
      expires_at_min: 1,
      proof: ["0x1", "0x2", "0x3", "0x4", "0x5"],
      signal_hash: hashSignal("0xAda"),
    },
  ],
};

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
}

describe("hashSignal", () => {
  test("is keccak256 of the text shifted right by a byte, as 32 hex bytes", () => {
    // Known vector: the empty signal hashes to keccak256("") >> 8, the portal's v3 default.
    expect(hashSignal("")).toBe(
      "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
    );
    expect(hashSignal("hello")).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSignal("hello")).not.toBe(hashSignal("hello!"));
  });

  test("hashes a 0x hex signal such as an address as bytes, like IDKit", () => {
    // Vectors from @worldcoin/idkit-core's hashSignal, which the World App uses for signal_hash.
    expect(hashSignal("0x0000000000000000000000000000000000000001")).toBe(
      "0x001468288056310c82aa4c01a7e12a10f8111a0560e72b700555479031b86c35",
    );
    expect(hashSignal("0xabc")).toBe(
      "0x00851bb152e67e6c958ab7da1431fcaed09ce0efc598885f69a750b3b4b81fc1",
    );
    expect(hashSignal("hello")).toBe(
      "0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea",
    );
  });
});

describe("readWorldConfig", () => {
  test("needs all three ids together and defaults the environment to production", () => {
    expect(readWorldConfig({})).toBeUndefined();
    expect(readWorldConfig({ WORLD_APP_ID: "app_1" })).toBeUndefined();
    expect(
      readWorldConfig({ WORLD_APP_ID: "app_1", WORLD_RP_ID: "rp_1", WORLD_RP_SIGNING_KEY: "k" }),
    ).toEqual({ appId: "app_1", rpId: "rp_1", signingKey: "k", environment: "production" });
    expect(
      readWorldConfig({
        WORLD_APP_ID: "app_1",
        WORLD_RP_ID: "rp_1",
        WORLD_RP_SIGNING_KEY: "k",
        WORLD_ENVIRONMENT: "staging",
      })?.environment,
    ).toBe("staging");
    expect(
      readWorldConfig({
        WORLD_APP_ID: "app_1",
        WORLD_RP_ID: "rp_1",
        WORLD_RP_SIGNING_KEY: "k",
        WORLD_ENVIRONMENT: "moon",
      })?.environment,
    ).toBe("production");
  });
});

describe("createWorldVerifier", () => {
  test("is absent without a configuration", () => {
    expect(createWorldVerifier(undefined)).toBeUndefined();
  });

  test("signs a request context for the action that IDKit can use", () => {
    const verifier = createWorldVerifier(config)!;
    const request = verifier.requestContext("claim");
    expect(request.appId).toBe("app_123");
    expect(request.environment).toBe("staging");
    expect(request.rpContext.rp_id).toBe("rp_456");
    expect(request.rpContext.nonce).toMatch(/^0x[0-9a-f]+$/);
    expect(request.rpContext.signature).toMatch(/^0x[0-9a-f]+$/);
    expect(request.rpContext.expires_at - request.rpContext.created_at).toBe(300);
    // Every context is fresh, so a nonce is never reused.
    expect(verifier.requestContext("claim").rpContext.nonce).not.toBe(request.rpContext.nonce);
  });

  test("forwards the IDKit result to the portal for the relying party and reads the verdict", async () => {
    const calls: { url: string; body: unknown; headers: unknown }[] = [];
    const verifier = createWorldVerifier(
      config,
      fakeFetch((url, init) => {
        calls.push({ url, body: JSON.parse(String(init?.body)), headers: init?.headers });
        return Response.json({
          success: true,
          action: "claim",
          nullifier: "0x2",
          results: [{ identifier: "proof_of_human", success: true, nullifier: "0x2" }],
        });
      }),
    )!;
    const result = await verifier.verify({ action: "claim", signal: "0xAda", proof });
    expect(result).toEqual({
      ok: true,
      verification: { nullifierHash: "0x2", verificationLevel: "proof_of_human", action: "claim" },
    });
    expect(calls).toEqual([
      {
        url: "https://developer.world.org/api/v4/verify/rp_456",
        headers: { "Content-Type": "application/json" },
        body: proof,
      },
    ]);
  });

  test("refuses a result for another action or signal before asking the portal", async () => {
    let asked = 0;
    const verifier = createWorldVerifier(
      config,
      fakeFetch(() => {
        asked += 1;
        return Response.json({ success: true });
      }),
    )!;
    expect(await verifier.verify({ action: "other", signal: "", proof })).toEqual({
      ok: false,
      rejection: { code: "action_mismatch", detail: "The proof is for another action." },
    });
    expect(await verifier.verify({ action: "claim", signal: "0xBob", proof })).toEqual({
      ok: false,
      rejection: { code: "signal_mismatch", detail: "The proof is bound to another signal." },
    });
    expect(asked).toBe(0);
    // Without a configured signal the binding is not checked.
    expect((await verifier.verify({ action: "claim", signal: "", proof })).ok).toBe(true);
  });

  test("maps a 400 with a code to a rejection", async () => {
    const verifier = createWorldVerifier(
      config,
      fakeFetch(() =>
        Response.json(
          {
            success: false,
            code: "all_verifications_failed",
            detail: "All proof verifications failed.",
          },
          { status: 400 },
        ),
      ),
    )!;
    expect(await verifier.verify({ action: "claim", signal: "", proof })).toEqual({
      ok: false,
      rejection: { code: "all_verifications_failed", detail: "All proof verifications failed." },
    });
  });

  test("throws on an outage or an answer it cannot read", async () => {
    const down = createWorldVerifier(
      config,
      fakeFetch(() => new Response("gateway", { status: 502 })),
    )!;
    await expect(down.verify({ action: "claim", signal: "", proof })).rejects.toBeInstanceOf(
      WorldVerifyError,
    );
    const odd = createWorldVerifier(
      config,
      fakeFetch(() => Response.json({ hello: "world" })),
    )!;
    await expect(odd.verify({ action: "claim", signal: "", proof })).rejects.toBeInstanceOf(
      WorldVerifyError,
    );
  });
});
