import type {
  WorldProof,
  WorldRejection,
  WorldRequest,
  WorldVerification,
  WorldVerificationLevel,
} from "@automator/contracts";
import { signRequest } from "@worldcoin/idkit-server";
import { hexToBytes, keccak256, stringToBytes, type Hex } from "viem";

/** Where World ID proofs are checked, per relying party; the same host serves every environment. */
const verifyEndpoint = "https://developer.world.org/api/v4/verify";

/** How long a signed request context stays valid: long enough to scan a code and confirm. */
const requestTtlSeconds = 300;

export type WorldVerifyResult =
  | { ok: true; verification: WorldVerification }
  | { ok: false; rejection: WorldRejection };

export interface WorldConfig {
  /** The Developer Portal app (`app_...`). */
  appId: string;
  /** The relying party registered for that app (`rp_...`), with its signing key. */
  rpId: string;
  signingKey: string;
  /** Which World ID environment proofs are made in; staging works with the simulator. */
  environment: WorldRequest["environment"];
}

export interface WorldVerifier {
  /** A freshly signed request context the runtime needs to open an IDKit request for `action`. */
  requestContext(action: string): WorldRequest;
  /** Checks the action, configured credential and optional signal against the portal's verdict. */
  verify(input: {
    action: string;
    signal: string;
    verificationLevel: WorldVerificationLevel;
    proof: WorldProof;
  }): Promise<WorldVerifyResult>;
}

/** The portal could not be asked, or answered something unreadable: the visitor may retry. */
export class WorldVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldVerifyError";
  }
}

/** IDKit reads a `0x` signal with an even number of hex digits as bytes, not as text. */
const hexSignal = /^0x(?:[0-9a-fA-F]{2})+$/;

/**
 * The field a signal becomes inside the proof, as IDKit's `hashSignal`: keccak256 of the
 * signal's bytes (hex-decoded when it is a `0x` hex string such as an address, else UTF-8),
 * shifted right by one byte so it fits the proving field, as 32 hex bytes.
 */
export function hashSignal(signal: string): `0x${string}` {
  const bytes = hexSignal.test(signal) ? hexToBytes(signal as Hex) : stringToBytes(signal);
  const hash = BigInt(keccak256(bytes)) >> BigInt(8);
  return `0x${hash.toString(16).padStart(64, "0")}`;
}

export const worldEnvironments = ["production", "staging", "sandbox"] as const;

/** The three variables together, or nothing: a partial World setup cannot verify anything. */
export function readWorldConfig(env: {
  WORLD_APP_ID?: string;
  WORLD_RP_ID?: string;
  WORLD_RP_SIGNING_KEY?: string;
  WORLD_ENVIRONMENT?: string;
}): WorldConfig | undefined {
  const appId = env.WORLD_APP_ID || undefined;
  const rpId = env.WORLD_RP_ID || undefined;
  const signingKey = env.WORLD_RP_SIGNING_KEY || undefined;
  if (!appId && !rpId && !signingKey) return undefined;
  if (!appId || !rpId || !signingKey) {
    console.warn(
      "World ID needs WORLD_APP_ID, WORLD_RP_ID and WORLD_RP_SIGNING_KEY together; World ID verify nodes stay unconfigured.",
    );
    return undefined;
  }
  const environment = (worldEnvironments as readonly string[]).includes(env.WORLD_ENVIRONMENT ?? "")
    ? (env.WORLD_ENVIRONMENT as WorldConfig["environment"])
    : "production";
  return { appId, rpId, signingKey, environment };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Verifies World ID proofs with the Developer Portal for the configured relying party. No API
 * key is involved: the result is forwarded as IDKit produced it and the proof is the
 * credential. Absent without a configuration, so the node can fail as unconfigured.
 */
export function createWorldVerifier(
  config: WorldConfig | undefined,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000,
): WorldVerifier | undefined {
  if (!config) return undefined;
  const { appId, rpId, signingKey, environment } = config;
  return {
    requestContext(action) {
      const signed = signRequest({ signingKeyHex: signingKey, action, ttl: requestTtlSeconds });
      return {
        appId,
        environment,
        rpContext: {
          rp_id: rpId,
          nonce: signed.nonce,
          created_at: signed.createdAt,
          expires_at: signed.expiresAt,
          signature: signed.sig,
        },
      };
    },
    async verify({ action, signal, verificationLevel, proof }) {
      // The portal verifies in the submitted environment; visitors cannot choose a test
      // environment when this API requests real credentials. Legacy omitted values mean production.
      if ((proof.environment ?? "production") !== environment)
        return {
          ok: false,
          rejection: {
            code: "environment_mismatch",
            detail: "The proof is for another World ID environment.",
          },
        };
      // These checks bind the claim to this screen's configured action and signal. Proof
      // freshness and one-use semantics require a separate session/nullifier check.
      if (proof.action !== action)
        return {
          ok: false,
          rejection: { code: "action_mismatch", detail: "The proof is for another action." },
        };
      if (signal !== "") {
        const expected = hashSignal(signal);
        const bound = proof.responses.every(
          (item) => typeof item.signal_hash === "string" && item.signal_hash === expected,
        );
        if (!bound)
          return {
            ok: false,
            rejection: { code: "signal_mismatch", detail: "The proof is bound to another signal." },
          };
      }
      let response: Response;
      try {
        response = await fetcher(`${verifyEndpoint}/${encodeURIComponent(rpId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proof),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new WorldVerifyError(
          `World ID verification could not be reached: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const body = asRecord(await response.json().catch(() => null));
      if (response.ok && body?.success === true) {
        if (body.action !== undefined && body.action !== action)
          throw new WorldVerifyError("World ID verification answered for another action");
        if (body.environment !== undefined && body.environment !== environment)
          throw new WorldVerifyError("World ID verification answered for another environment");
        const results = Array.isArray(body.results) ? body.results.map(asRecord) : [];
        const successful = results.filter(
          (item) =>
            item?.success === true && typeof item.identifier === "string" && item.identifier,
        );
        if (successful.length === 0)
          throw new WorldVerifyError("World ID verification returned no verified credential");
        // Overall success means at least one credential verified, not that our requested
        // credential did. Only the portal's successful result may establish the level.
        const accepted = successful.find((item) =>
          verificationLevel === "device"
            ? item?.identifier === "device"
            : item?.identifier === "proof_of_human" || item?.identifier === "orb",
        );
        if (!accepted)
          return {
            ok: false,
            rejection: {
              code: "verification_level_mismatch",
              detail: "The proof does not include the required World ID credential.",
            },
          };
        // A different result's top-level nullifier or a client-supplied response must not
        // become the identity of the credential we selected.
        const nullifier = accepted.nullifier;
        const identifier = accepted.identifier as string;
        if (typeof nullifier !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(nullifier))
          throw new WorldVerifyError("World ID verification returned no valid nullifier");
        return {
          ok: true,
          verification: { nullifierHash: nullifier, verificationLevel: identifier, action },
        };
      }
      // Throttling and upstream timeouts say nothing about the proof. Leave the screen
      // unanswered so a temporary provider failure cannot take a permanent rejection branch.
      if (response.status === 408 || response.status === 429)
        throw new WorldVerifyError(`World ID verification answered ${response.status}`);
      if (response.status < 500 && typeof body?.code === "string") {
        return {
          ok: false,
          rejection: {
            code: body.code,
            detail: typeof body.detail === "string" ? body.detail : "",
          },
        };
      }
      throw new WorldVerifyError(`World ID verification answered ${response.status}`);
    },
  };
}
