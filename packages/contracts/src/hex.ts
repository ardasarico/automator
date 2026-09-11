/*
 * The two hex shapes every layer checks: a 20-byte address and a 32-byte transaction hash. One
 * definition each, as the pattern string TypeBox wants and the predicate code wants, so a schema,
 * a route and a wallet scan cannot drift on what counts as well-formed.
 */

export const addressPattern = "^0x[0-9a-fA-F]{40}$";
const addressExpression = new RegExp(addressPattern);

export function isHexAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && addressExpression.test(value);
}

export const txHashPattern = "^0x[0-9a-fA-F]{64}$";
const txHashExpression = new RegExp(txHashPattern);

export function isTxHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && txHashExpression.test(value);
}
