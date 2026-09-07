import { Type, type Static } from "@sinclair/typebox";
import type { FlowNodeType } from "./flows";

/**
 * Identity screens: visitor pauses like the `screen.*` nodes, except that the answer is not
 * what the visitor typed but who they are. The mini-app runtime signs the visitor in (Privy)
 * or asks for a World ID proof, the API verifies it and derives the node's output itself, so
 * the flow never trusts a value the browser made up. Simulate and the builder's preview
 * answer them with the samples below instead.
 */
export const identityScreenTypes = [
  "privy.login",
  "world.id-verify",
] as const satisfies readonly FlowNodeType[];
export type IdentityScreenType = (typeof identityScreenTypes)[number];

export function isIdentityScreenType(type: string): type is IdentityScreenType {
  return (identityScreenTypes as readonly string[]).includes(type);
}

/** The port each identity screen continues on; `world.id-verify` also has a rejected branch. */
export const identityScreenPorts: Record<
  IdentityScreenType,
  { primary: string; secondary?: string }
> = {
  "privy.login": { primary: "user" },
  "world.id-verify": { primary: "verified", secondary: "rejected" },
};

const text = (fallback = "", description?: string) =>
  Type.String(
    description === undefined ? { default: fallback } : { default: fallback, description },
  );

const titleText = () => text("", "Blank shows the node label.");

/** The ways a visitor may sign in; the config picks a subset shown in Privy's modal. */
export const privyLoginMethods = ["email", "wallet", "google", "passkey"] as const;
export type PrivyLoginMethod = (typeof privyLoginMethods)[number];

const loginMethodSchema = (fallback: PrivyLoginMethod) =>
  Type.Union(
    privyLoginMethods.map((method) => Type.Literal(method)),
    { default: fallback },
  );

export const privyLoginConfigSchema = Type.Object({
  title: titleText(),
  message: text(""),
  button: text("Sign in"),
  methods: Type.Array(loginMethodSchema("email"), {
    default: ["email", "wallet", "google"],
    description: "Which ways the visitor may sign in.",
  }),
  simulate: Type.Object(
    {
      userId: text("did:privy:sample-visitor"),
      email: text("visitor@example.com"),
      wallet: text("0x0000000000000000000000000000000000000001"),
      loginMethod: loginMethodSchema("email"),
    },
    { default: {}, description: "The visitor Simulate and the preview sign in as." },
  ),
});
export type PrivyLoginConfig = Static<typeof privyLoginConfigSchema>;

/** What the User port carries: derived on the API from the verified Privy token. */
export const visitorUserSchema = Type.Object({
  userId: Type.String(),
  /** The visitor's embedded wallet, else their first Ethereum wallet; blank without one. */
  wallet: Type.String(),
  /** Their email or Google address; blank for a wallet or passkey account. */
  email: Type.String(),
  /** The linked account verified most recently, as one of the login methods; blank if unknown. */
  loginMethod: Type.String(),
});
export type VisitorUser = Static<typeof visitorUserSchema>;

export function samplePrivyUser(config: PrivyLoginConfig): VisitorUser {
  const { userId, email, wallet, loginMethod } = config.simulate;
  return { userId, email, wallet, loginMethod };
}

/** World ID levels the Developer Portal verifies: a phone-based check or an Orb-verified one. */
export const worldVerificationLevels = ["device", "orb"] as const;
export type WorldVerificationLevel = (typeof worldVerificationLevels)[number];

export const worldIdVerifyConfigSchema = Type.Object({
  title: titleText(),
  message: text(""),
  button: text("Verify with World ID"),
  action: text("", "The action id from the World Developer Portal (Incognito actions)."),
  verificationLevel: Type.Union(
    worldVerificationLevels.map((level) => Type.Literal(level)),
    { default: "device", description: "Orb needs an Orb-verified World ID; device accepts any." },
  ),
  signal: text(
    "",
    "Optional text bound to the proof, such as {{vars.visitor.wallet}}; only vars and trigger resolve here.",
  ),
  simulate: Type.Union([Type.Literal("verified"), Type.Literal("rejected")], {
    default: "verified",
    description: "Which branch Simulate takes.",
  }),
});
export type WorldIdVerifyConfig = Static<typeof worldIdVerifyConfigSchema>;

/** The proof IDKit (web) and MiniKit (World App) hand back; verified on the API, never trusted. */
export const worldProofSchema = Type.Object(
  {
    merkle_root: Type.String({ minLength: 1 }),
    nullifier_hash: Type.String({ minLength: 1 }),
    proof: Type.String({ minLength: 1 }),
    verification_level: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type WorldProof = Static<typeof worldProofSchema>;

/** What the Verified port carries after the Developer Portal accepted the proof. */
export const worldVerificationSchema = Type.Object({
  /** Stable per person and action: the key for "once per human" rules. */
  nullifierHash: Type.String(),
  verificationLevel: Type.String(),
  action: Type.String(),
});
export type WorldVerification = Static<typeof worldVerificationSchema>;

/** What the Rejected port carries: the portal's error code and its explanation. */
export const worldRejectionSchema = Type.Object({
  code: Type.String(),
  detail: Type.String(),
});
export type WorldRejection = Static<typeof worldRejectionSchema>;

export const sampleNullifierHash =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

export function sampleWorldVerification(config: WorldIdVerifyConfig): WorldVerification {
  return {
    nullifierHash: sampleNullifierHash,
    verificationLevel: config.verificationLevel,
    action: config.action,
  };
}

export const sampleWorldRejection: WorldRejection = {
  code: "invalid_proof",
  detail: "Simulate took the rejected branch.",
};
