import {
  Value,
  worldProofSchema,
  type PrivyLoginConfig,
  type WorldCredential,
  type WorldIdVerifyConfig,
  type WorldProof,
  type WorldRequest,
  type WorldSelfieCheckConfig,
} from "@automator/contracts";

export function toWorldProof(result: unknown): WorldProof {
  if (!Value.Check(worldProofSchema, result))
    throw new Error("World App answered in a shape this app cannot verify. Try again.");
  return result;
}

/** What a World screen asks IDKit for: the credential plus the action and signal it binds to. */
export type WorldAsk = { action: string; signal: string; credential: WorldCredential };

export function worldAsk(
  config: Pick<WorldIdVerifyConfig, "action" | "verificationLevel" | "signal">,
): WorldAsk {
  return { action: config.action, signal: config.signal, credential: config.verificationLevel };
}

export function selfieCheckAsk(
  config: Pick<WorldSelfieCheckConfig, "action" | "signal">,
): WorldAsk {
  return { action: config.action, signal: config.signal, credential: "selfie" };
}

const presetTypes: Record<WorldCredential, "ProofOfHuman" | "DeviceLegacy" | "SelfieCheckLegacy"> =
  {
    orb: "ProofOfHuman",
    device: "DeviceLegacy",
    // Selfie Check (Beta) is a World ID 3.0 credential; IDKit 4 still requests it through the
    // same signed rp_context request as long as legacy proofs are allowed.
    selfie: "SelfieCheckLegacy",
  };

/* Build presets as data to keep IDKit browser code out of server imports. */
export function worldPreset(ask: Pick<WorldAsk, "credential" | "signal">): {
  type: "ProofOfHuman" | "DeviceLegacy" | "SelfieCheckLegacy";
  signal?: string;
} {
  return {
    type: presetTypes[ask.credential],
    ...(ask.signal === "" ? {} : { signal: ask.signal }),
  };
}

export function toIdKitRequest(ask: WorldAsk, request: WorldRequest) {
  if (!request.appId.startsWith("app_"))
    throw new Error("World ID is misconfigured for this app: the app id is not an app_ id.");
  return {
    app_id: request.appId as `app_${string}`,
    action: ask.action,
    rp_context: request.rpContext,
    allow_legacy_proofs: true,
    environment: request.environment,
    preset: worldPreset(ask),
  };
}

export function privyLoginMethods(config: Pick<PrivyLoginConfig, "methods">) {
  return config.methods.length === 0 ? undefined : config.methods;
}

const idKitMessages: Record<string, string> = {
  // Our own code: the IDKit window closed before World App answered. It is not an IDKit
  // code; IDKit only reports that the window closed, never why.
  dismissed:
    "The verification window closed before World App answered. Press the button to try again.",
  user_rejected: "World App reported that you rejected the request.",
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

/*
 * IDKit's modal closes on a backdrop click and on Escape, which loses the proof a visitor is
 * completing on their phone: a closed request stops polling, so World App reports success while
 * the page shows nothing. While a request is open, only the modal's own close button may
 * dismiss it. These predicates pick the two events to swallow; the host stops their propagation
 * in the capture phase so IDKit's handlers never see them.
 */
export function isIdKitBackdropClick(target: EventTarget | null): boolean {
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    target.classList.contains("idkit-backdrop")
  );
}

export function isIdKitEscape(key: string): boolean {
  return key === "Escape" || key === "Esc";
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
