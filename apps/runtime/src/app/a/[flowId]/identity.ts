import {
  Value,
  worldProofSchema,
  type PrivyLoginConfig,
  type WorldIdVerifyConfig,
  type WorldProof,
  type WorldRequest,
} from "@automator/contracts";

export function toWorldProof(result: unknown): WorldProof {
  if (!Value.Check(worldProofSchema, result))
    throw new Error("World App answered in a shape this app cannot verify. Try again.");
  return result;
}

/* Build presets as data to keep IDKit browser code out of server imports. */
export function worldPreset(config: Pick<WorldIdVerifyConfig, "verificationLevel" | "signal">): {
  type: "ProofOfHuman" | "DeviceLegacy";
  signal?: string;
} {
  return {
    type: config.verificationLevel === "orb" ? "ProofOfHuman" : "DeviceLegacy",
    ...(config.signal === "" ? {} : { signal: config.signal }),
  };
}

export function toIdKitRequest(
  config: Pick<WorldIdVerifyConfig, "action" | "verificationLevel" | "signal">,
  request: WorldRequest,
) {
  if (!request.appId.startsWith("app_"))
    throw new Error("World ID is misconfigured for this app: the app id is not an app_ id.");
  return {
    app_id: request.appId as `app_${string}`,
    action: config.action,
    rp_context: request.rpContext,
    allow_legacy_proofs: true,
    environment: request.environment,
    preset: worldPreset(config),
  };
}

export function privyLoginMethods(config: Pick<PrivyLoginConfig, "methods">) {
  return config.methods.length === 0 ? undefined : config.methods;
}

const idKitMessages: Record<string, string> = {
  user_rejected: "You closed the verification before it finished.",
  verification_rejected: "World App declined this verification.",
  credential_unavailable: "Your World ID does not have the credential this step needs.",
  feature_unavailable: "Your World App does not support this verification yet.",
  max_verifications_reached: "You have already verified for this action.",
  nullifier_replayed: "This proof was already used.",
  connection_failed: "Could not connect to World App. Check your connection and try again.",
  inclusion_proof_pending: "Your World ID is still being registered. Try again in a few minutes.",
  unknown_rp: "This app's World ID setup was not recognised.",
  inactive_rp: "This app's World ID setup is inactive.",
  invalid_rp_signature: "This app's World ID request could not be trusted.",
  // The signed request context came with the screen; only a new session brings a fresh one.
  rp_signature_expired: "The verification request expired. Reload the page and try again.",
  timestamp_too_old: "The verification request expired. Reload the page and try again.",
};

export function describeIdKitError(code: string): string {
  return idKitMessages[code] ?? `Verification failed (${code}). Try again.`;
}

const privyMessages: Record<string, string> = {
  exited_auth_flow: "You closed the sign-in before it finished.",
  user_exited_auth_flow: "You closed the sign-in before it finished.",
  too_many_requests: "Sign-in requests are temporarily limited. Wait a minute, then try again.",
  disallowed_login_method: "That way of signing in is not allowed here.",
};

export function describePrivyError(code: string): string {
  return privyMessages[code] ?? "Sign-in did not complete. Try again.";
}
