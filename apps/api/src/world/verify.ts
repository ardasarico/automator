import type { WorldProof, WorldRejection, WorldVerification } from "@automator/contracts";
import { keccak256, stringToBytes } from "viem";

/** Where World ID proofs are checked; the app id in the path is the Developer Portal's. */
const verifyEndpoint = "https://developer.worldcoin.org/api/v2/verify";

export type WorldVerifyResult =
  | { ok: true; verification: WorldVerification }
  | { ok: false; rejection: WorldRejection };

export interface WorldVerifier {
  /** Checks a proof for `action` bound to `signal`; resolves with the portal's verdict. */
  verify(input: { action: string; signal: string; proof: WorldProof }): Promise<WorldVerifyResult>;
}

/** The portal could not be asked, or answered something unreadable: the visitor may retry. */
export class WorldVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldVerifyError";
  }
}

/**
 * The field a signal becomes inside the proof, as IDKit's `hashToField`: keccak256 of the
 * UTF-8 bytes, shifted right by one byte so it fits the proving field, as 32 hex bytes.
 */
export function hashSignal(signal: string): `0x${string}` {
  const hash = BigInt(keccak256(stringToBytes(signal))) >> BigInt(8);
  return `0x${hash.toString(16).padStart(64, "0")}`;
}

/**
 * Verifies World ID proofs with the Developer Portal for the app `WORLD_APP_ID` names. No API
 * key is involved: the app id is public and the proof itself is the credential. Absent
 * without an app id, so the node can fail as unconfigured.
 */
export function createWorldVerifier(
  appId: string | undefined,
  fetcher: typeof fetch = fetch,
): WorldVerifier | undefined {
  if (!appId) return undefined;
  return {
    async verify({ action, signal, proof }) {
      let response: Response;
      try {
        response = await fetcher(`${verifyEndpoint}/${encodeURIComponent(appId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...proof, action, signal_hash: hashSignal(signal) }),
        });
      } catch (error) {
        throw new WorldVerifyError(
          `World ID verification could not be reached: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const body: unknown = await response.json().catch(() => null);
      const record =
        typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
      if (response.ok && record?.success === true) {
        return {
          ok: true,
          verification: {
            nullifierHash: proof.nullifier_hash,
            verificationLevel: proof.verification_level,
            action,
          },
        };
      }
      if (response.status < 500 && typeof record?.code === "string") {
        return {
          ok: false,
          rejection: {
            code: record.code,
            detail: typeof record.detail === "string" ? record.detail : "",
          },
        };
      }
      throw new WorldVerifyError(`World ID verification answered ${response.status}`);
    },
  };
}
