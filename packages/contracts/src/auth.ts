import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";

export const usernameSchema = Type.String({
  minLength: 3,
  maxLength: 24,
  pattern: "^[a-z][a-z0-9_]*$",
});
export const profileInputSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 60, pattern: "\\S" }),
    username: usernameSchema,
  },
  { additionalProperties: false },
);
export type ProfileInput = Static<typeof profileInputSchema>;

export const authUserSchema = Type.Object({
  id: Type.String(),
  name: Type.Union([Type.String(), Type.Null()]),
  username: Type.Union([usernameSchema, Type.Null()]),
  walletAddress: Type.Union([Type.String(), Type.Null()]),
});
export type AuthUser = Static<typeof authUserSchema>;
export const authErrorSchema = Type.Object({
  error: Type.Union([
    Type.Literal("unauthorized"),
    Type.Literal("unavailable"),
    Type.Literal("invalid_profile"),
    Type.Literal("username_taken"),
    Type.Literal("username_reserved"),
    Type.Literal("forbidden"),
  ]),
});
export type AuthError = Static<typeof authErrorSchema>;
const errors = {
  400: authErrorSchema,
  401: authErrorSchema,
  403: authErrorSchema,
  409: authErrorSchema,
  422: authErrorSchema,
  503: authErrorSchema,
} as const;
export const sessionContract = {
  method: "POST",
  path: "/auth/session",
  response: { 200: Type.Object({ user: authUserSchema, expiresAt: Type.Number() }), ...errors },
} as const;
export const meContract = {
  method: "GET",
  path: "/auth/me",
  response: { 200: Type.Object({ user: Type.Union([authUserSchema, Type.Null()]) }), ...errors },
} as const;
export const profileContract = {
  method: "PUT",
  path: "/auth/profile",
  body: profileInputSchema,
  response: { 200: Type.Object({ user: authUserSchema }), ...errors },
} as const;
export type SessionResponse = Static<(typeof sessionContract.response)[200]>;
export type MeResponse = Static<(typeof meContract.response)[200]>;
export type ProfileResponse = Static<(typeof profileContract.response)[200]>;
export type AuthContract = typeof sessionContract | typeof meContract | typeof profileContract;
export type AuthResponse<C extends AuthContract> = Static<C["response"][200]>;

export function parseAuthResponse<C extends AuthContract>(
  contract: C,
  body: unknown,
): AuthResponse<C> {
  if (!Check(contract.response[200], body)) throw new Error("Invalid auth response");
  return body as AuthResponse<C>;
}
export function parseAuthError(body: unknown): AuthError {
  if (!Check(authErrorSchema, body)) throw new Error("Invalid auth error");
  return body;
}
export function isProfileInput(body: unknown): body is ProfileInput {
  return Check(profileInputSchema, body);
}
export function isOnboarded(user: AuthUser): boolean {
  return Boolean(user.name && user.username && user.walletAddress);
}
