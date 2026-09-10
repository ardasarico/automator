import type {
  WorldCredential,
  WorldProof,
  WorldRejection,
  WorldRequest,
  WorldVerification,
} from "@automator/contracts";
import { signRequest } from "@worldcoin/idkit-server";
import { hexToBytes, keccak256, stringToBytes, type Hex } from "viem";

const verifyEndpoint = "https://developer.world.org/api/v4/verify";

const requestTtlSeconds = 300;

export type WorldVerifyResult =
  | { ok: true; verification: WorldVerification }
  | { ok: false; rejection: WorldRejection };

export interface WorldConfig {
  appId: string;
  rpId: string;
  signingKey: string;
  environment: WorldRequest["environment"];
}

export interface WorldVerifier {
  requestContext(action: string): WorldRequest;
  verify(input: {
    action: string;
    signal: string;
    /** The credential the screen asked for; only a matching portal result verifies it. */
    verificationLevel: WorldCredential;
    proof: WorldProof;
  }): Promise<WorldVerifyResult>;
}

export class WorldVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldVerifyError";
  }
}

/** IDKit reads a `0x` signal with an even number of hex digits as bytes, not as text. */
const hexSignal = /^0x(?:[0-9a-fA-F]{2})+$/;

/* Match IDKit hashSignal: keccak256 of hex bytes or UTF-8 text, shifted right 8 bits into the proving field. */
export function hashSignal(signal: string): `0x${string}` {
  const bytes = hexSignal.test(signal) ? hexToBytes(signal as Hex) : stringToBytes(signal);
  const hash = BigInt(keccak256(bytes)) >> BigInt(8);
  return `0x${hash.toString(16).padStart(64, "0")}`;
}

export const worldEnvironments = ["production", "staging", "sandbox"] as const;

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

/*
 * Which portal result identifiers satisfy a requested credential. Selfie Check (issuer schema 11)
 * is reported as `selfie`; IDKit maps World App's older `face` name to the same credential.
 */
const credentialIdentifiers: Record<WorldCredential, readonly string[]> = {
  device: ["device"],
  orb: ["proof_of_human", "orb"],
  selfie: ["selfie", "face"],
};

function acceptsCredential(
  credential: WorldCredential,
  item: Record<string, unknown> | null,
): boolean {
  return (
    typeof item?.identifier === "string" &&
    credentialIdentifiers[credential].includes(item.identifier)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

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
        const accepted = successful.find((item) => acceptsCredential(verificationLevel, item));
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
        // World App still names Selfie Check `face` in some builds; IDKit reports it as `selfie`.
        const identifier =
          accepted.identifier === "face" ? "selfie" : (accepted.identifier as string);
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
