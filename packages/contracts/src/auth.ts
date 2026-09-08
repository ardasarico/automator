import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
import {
  apiErrorResponses,
  apiErrorSchema,
  ContractError,
  parseResponse,
  type ApiError,
} from "./contract";

/* TypeBox compiles patterns without the u flag, so Unicode properties require explicit ranges.
 * ZWJ sequences are rejected; single-code-point emoji and non-BMP scripts remain valid. */
const forbiddenNameCharacters =
  "\\u0000-\\u001F\\u007F-\\u009F" +
  "\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u180E" +
  "\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F" +
  "\\uE000-\\uF8FF\\uFEFF\\uFFF9-\\uFFFB";

export const nameSchema = Type.String({
  minLength: 1,
  maxLength: 60,
  pattern: `^(?=[^${forbiddenNameCharacters}]*[^\\s${forbiddenNameCharacters}])[^${forbiddenNameCharacters}]*$`,
});
export const usernameSchema = Type.String({
  minLength: 3,
  maxLength: 24,
  pattern: "^[a-z][a-z0-9_]*$",
});
export const profileInputSchema = Type.Object(
  { name: nameSchema, username: usernameSchema },
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

export const sessionContract = {
  method: "POST",
  path: "/auth/session",
  response: {
    200: Type.Object({ user: authUserSchema, expiresAt: Type.Number() }),
    ...apiErrorResponses,
  },
} as const;
export const meContract = {
  method: "GET",
  path: "/auth/me",
  response: {
    200: Type.Object({ user: Type.Union([authUserSchema, Type.Null()]) }),
    ...apiErrorResponses,
  },
} as const;
export const profileContract = {
  method: "PUT",
  path: "/auth/profile",
  body: profileInputSchema,
  response: { 200: Type.Object({ user: authUserSchema }), ...apiErrorResponses },
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
  return parseResponse(contract, 200, body).data as AuthResponse<C>;
}
export function parseAuthError(body: unknown): ApiError {
  if (!Check(apiErrorSchema, body)) throw new ContractError("Body does not match the API error");
  return body;
}
export function isProfileInput(body: unknown): body is ProfileInput {
  return Check(profileInputSchema, body);
}
export function isOnboarded(user: AuthUser): boolean {
  return Boolean(user.name && user.username && user.walletAddress);
}
