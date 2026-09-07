import {
  Value,
  worldProofSchema,
  type PrivyLoginConfig,
  type WorldIdVerifyConfig,
  type WorldProof,
  type WorldRequest,
} from "@automator/contracts";

/**
 * IDKit's result as the proof the session answer carries: the same object, checked against
 * the contract so a shape this app cannot forward fails here rather than at the API.
 */
export function toWorldProof(result: unknown): WorldProof {
  if (!Value.Check(worldProofSchema, result))
    throw new Error("World App answered in a shape this app cannot verify. Try again.");
  return result;
}

/**
 * The IDKit preset a screen's verification level asks for: `orb` is a World ID 4.0 proof of
 * human (with the legacy Orb credential as fallback), `device` the legacy device credential.
 * Built as data rather than through IDKit's helpers, so this stays importable on the server.
 */
export function worldPreset(config: Pick<WorldIdVerifyConfig, "verificationLevel" | "signal">): {
  type: "ProofOfHuman" | "DeviceLegacy";
  signal?: string;
} {
  return {
    type: config.verificationLevel === "orb" ? "ProofOfHuman" : "DeviceLegacy",
    ...(config.signal === "" ? {} : { signal: config.signal }),
  };
}

/** What IDKit's request widget is given for one screen: the app, the signed context, the preset. */
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

/** The login methods a screen allows, in Privy's terms; an empty pick means Privy's app default. */
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
  rp_signature_expired: "The verification request expired. Try again.",
  timestamp_too_old: "The verification request expired. Try again.",
};

/** An IDKit error code in the visitor's words. */
export function describeIdKitError(code: string): string {
  return idKitMessages[code] ?? `Verification failed (${code}). Try again.`;
}

const privyMessages: Record<string, string> = {
  exited_auth_flow: "You closed the sign-in before it finished.",
  user_exited_auth_flow: "You closed the sign-in before it finished.",
  too_many_requests: "Sign-in requests are temporarily limited. Wait a minute, then try again.",
  disallowed_login_method: "That way of signing in is not allowed here.",
};

/** A Privy login error code in the visitor's words. */
export function describePrivyError(code: string): string {
  return privyMessages[code] ?? "Sign-in did not complete. Try again.";
}
