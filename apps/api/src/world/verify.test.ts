import type { WorldProof } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import {
  createWorldVerifier,
  hashSignal,
  readWorldConfig,
  WorldVerifyError,
  type WorldConfig,
} from "./verify";

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

const verifyInput = {
  action: "claim",
  signal: "",
  verificationLevel: "orb" as const,
  proof,
};

const acceptedProof = {
  success: true,
  results: [{ identifier: "proof_of_human", success: true, nullifier: "0x2" }],
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
    const result = await verifier.verify({ ...verifyInput, signal: "0xAda" });
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
        return Response.json(acceptedProof);
      }),
    )!;
    expect(await verifier.verify({ ...verifyInput, action: "other" })).toEqual({
      ok: false,
      rejection: { code: "action_mismatch", detail: "The proof is for another action." },
    });
    expect(await verifier.verify({ ...verifyInput, signal: "0xBob" })).toEqual({
      ok: false,
      rejection: { code: "signal_mismatch", detail: "The proof is bound to another signal." },
    });
    expect(asked).toBe(0);
    expect((await verifier.verify(verifyInput)).ok).toBe(true);
  });

  test.each(["staging", "sandbox", "other"])(
    "refuses %s proofs on a production verifier before asking the portal",
    async (environment) => {
      let asked = false;
      const verifier = createWorldVerifier(
        { ...config, environment: "production" },
        fakeFetch(() => {
          asked = true;
          return Response.json(acceptedProof);
        }),
      )!;
      expect(await verifier.verify({ ...verifyInput, proof: { ...proof, environment } })).toEqual({
        ok: false,
        rejection: {
          code: "environment_mismatch",
          detail: "The proof is for another World ID environment.",
        },
      });
      expect(asked).toBe(false);
    },
  );

  test("treats omitted legacy environments as production", async () => {
    const { environment: _environment, ...legacy } = proof;
    const verifier = createWorldVerifier(
      { ...config, environment: "production" },
      fakeFetch(() => Response.json(acceptedProof)),
    )!;
    expect((await verifier.verify({ ...verifyInput, proof: legacy })).ok).toBe(true);
    const staging = createWorldVerifier(
      config,
      fakeFetch(() => Response.json(acceptedProof)),
    )!;
    expect((await staging.verify({ ...verifyInput, proof: legacy })).ok).toBe(false);
  });

  test("requires a successful Orb credential even when another credential verified", async () => {
    const verifier = createWorldVerifier(
      config,
      fakeFetch(() =>
        Response.json({
          success: true,
          nullifier: "0x3",
          results: [
            { identifier: "device", success: true, nullifier: "0x3" },
            { identifier: "proof_of_human", success: false, nullifier: "0x2" },
          ],
        }),
      ),
    )!;
    expect(await verifier.verify(verifyInput)).toEqual({
      ok: false,
      rejection: {
        code: "verification_level_mismatch",
        detail: "The proof does not include the required World ID credential.",
      },
    });
    expect(await verifier.verify({ ...verifyInput, verificationLevel: "device" })).toEqual({
      ok: true,
      verification: { nullifierHash: "0x3", verificationLevel: "device", action: "claim" },
    });
  });

  test.each(["proof_of_human", "orb"])(
    "selects the verified %s identity independently of the first result and top-level nullifier",
    async (identifier) => {
      const verifier = createWorldVerifier(
        config,
        fakeFetch(() =>
          Response.json({
            success: true,
            nullifier: "0x3",
            results: [
              { identifier: "device", success: true, nullifier: "0x3" },
              { identifier, success: true, nullifier: "0x4" },
            ],
          }),
        ),
      )!;
      expect(await verifier.verify(verifyInput)).toEqual({
        ok: true,
        verification: { nullifierHash: "0x4", verificationLevel: identifier, action: "claim" },
      });
    },
  );

  test("requires the requested device credential instead of accepting an unrelated verified credential", async () => {
    const verifier = createWorldVerifier(
      config,
      fakeFetch(() =>
        Response.json({
          success: true,
          results: [{ identifier: "passport", success: true, nullifier: "0x3" }],
        }),
      ),
    )!;
    expect(await verifier.verify({ ...verifyInput, verificationLevel: "device" })).toEqual({
      ok: false,
      rejection: {
        code: "verification_level_mismatch",
        detail: "The proof does not include the required World ID credential.",
      },
    });
  });

  test.each([
    { success: true },
    { success: true, results: [] },
    { success: true, results: [{ success: true, nullifier: "0x2" }] },
    { success: true, results: [{ identifier: "proof_of_human", success: true }] },
    {
      success: true,
      results: [{ identifier: "proof_of_human", success: true, nullifier: "not-a-nullifier" }],
    },
    { ...acceptedProof, environment: "production" },
    { ...acceptedProof, action: "other" },
  ] as const)(
    "does not turn an incomplete or inconsistent portal success into identity",
    async (body) => {
      const verifier = createWorldVerifier(
        config,
        fakeFetch(() => Response.json(body)),
      )!;
      await expect(verifier.verify(verifyInput)).rejects.toBeInstanceOf(WorldVerifyError);
    },
  );

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
    expect(await verifier.verify(verifyInput)).toEqual({
      ok: false,
      rejection: { code: "all_verifications_failed", detail: "All proof verifications failed." },
    });
  });

  test.each([
    [429, "rate_limit_exceeded"],
    [408, "request_timeout"],
  ] as const)(
    "keeps HTTP %s portal errors retryable even when they include a code",
    async (status, code) => {
      const verifier = createWorldVerifier(
        config,
        fakeFetch(() => Response.json({ success: false, code, detail: "Try again." }, { status })),
      )!;
      await expect(verifier.verify(verifyInput)).rejects.toBeInstanceOf(WorldVerifyError);
    },
  );

  test("throws on an outage or an answer it cannot read", async () => {
    const down = createWorldVerifier(
      config,
      fakeFetch(() => new Response("gateway", { status: 502 })),
    )!;
    await expect(down.verify(verifyInput)).rejects.toBeInstanceOf(WorldVerifyError);
    const odd = createWorldVerifier(
      config,
      fakeFetch(() => Response.json({ hello: "world" })),
    )!;
    await expect(odd.verify(verifyInput)).rejects.toBeInstanceOf(WorldVerifyError);
  });

  test("aborts an unresponsive portal so the visitor can retry", async () => {
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        expect(signal).toBeInstanceOf(AbortSignal);
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      })) as typeof fetch;
    const verifier = createWorldVerifier(config, fetcher, 5)!;
    await expect(verifier.verify(verifyInput)).rejects.toBeInstanceOf(WorldVerifyError);
  });

  test("keeps the verification deadline active while reading the portal response body", async () => {
    let reading = false;
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
        pull() {
          reading = true;
        },
      });
      return new Response(stream, { headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const verifier = createWorldVerifier(config, fetcher, 5)!;
    await expect(verifier.verify(verifyInput)).rejects.toBeInstanceOf(WorldVerifyError);
    expect(reading).toBe(true);
  });
});
