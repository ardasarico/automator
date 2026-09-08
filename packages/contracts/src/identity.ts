import { Type, type Static } from "@sinclair/typebox";
import type { FlowNodeType } from "./flows";

export const identityScreenTypes = [
  "privy.login",
  "world.id-verify",
] as const satisfies readonly FlowNodeType[];
export type IdentityScreenType = (typeof identityScreenTypes)[number];

export function isIdentityScreenType(type: string): type is IdentityScreenType {
  return (identityScreenTypes as readonly string[]).includes(type);
}

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

export const visitorUserSchema = Type.Object({
  userId: Type.String(),
  wallet: Type.String(),
  email: Type.String(),
  loginMethod: Type.String(),
});
export type VisitorUser = Static<typeof visitorUserSchema>;

export function samplePrivyUser(config: PrivyLoginConfig): VisitorUser {
  const { userId, email, wallet, loginMethod } = config.simulate;
  return { userId, email, wallet, loginMethod };
}

export const worldVerificationLevels = ["device", "orb"] as const;
export type WorldVerificationLevel = (typeof worldVerificationLevels)[number];

export const worldIdVerifyConfigSchema = Type.Object({
  title: titleText(),
  message: text(""),
  button: text("Verify with World ID"),
  action: text("", "The action id from the World Developer Portal (Incognito actions)."),
  verificationLevel: Type.Union(
    worldVerificationLevels.map((level) => Type.Literal(level)),
    {
      default: "device",
      description:
        "Orb needs an Orb-verified World ID; device needs a World App device credential.",
    },
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

export const worldProofSchema = Type.Object({
  protocol_version: Type.String({ minLength: 1 }),
  nonce: Type.String({ minLength: 1 }),
  action: Type.Optional(Type.String()),
  environment: Type.Optional(Type.String()),
  responses: Type.Array(Type.Record(Type.String(), Type.Unknown()), { minItems: 1 }),
});
export type WorldProof = Static<typeof worldProofSchema>;

export const worldRpContextSchema = Type.Object({
  rp_id: Type.String({ minLength: 1 }),
  nonce: Type.String({ minLength: 1 }),
  created_at: Type.Number(),
  expires_at: Type.Number(),
  signature: Type.String({ minLength: 1 }),
});
export type WorldRpContext = Static<typeof worldRpContextSchema>;

export const worldRequestSchema = Type.Object({
  appId: Type.String({ minLength: 1 }),
  environment: Type.Union([
    Type.Literal("production"),
    Type.Literal("staging"),
    Type.Literal("sandbox"),
  ]),
  rpContext: worldRpContextSchema,
});
export type WorldRequest = Static<typeof worldRequestSchema>;

export const worldVerificationSchema = Type.Object({
  nullifierHash: Type.String(),
  verificationLevel: Type.String(),
  action: Type.String(),
});
export type WorldVerification = Static<typeof worldVerificationSchema>;

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
