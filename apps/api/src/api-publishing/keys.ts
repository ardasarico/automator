import { apiKeyDisplayLength, apiKeyPrefix } from "@automator/contracts";

/*
 * Issuing and recognising API keys. Only the hash is stored, so a database read cannot be turned
 * into a working credential; the plaintext exists once, in the response that creates it.
 */

const keyBytes = 32;

export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(keyBytes));
  return `${apiKeyPrefix}${bytes.toBase64({ alphabet: "base64url", omitPadding: true })}`;
}

export function hashApiKey(key: string): string {
  return new Bun.CryptoHasher("sha256").update(key, "utf8").digest("hex");
}

/** The part of a key a list may show, so an owner can tell two of their keys apart. */
export function keyDisplayPrefix(key: string): string {
  return key.slice(0, apiKeyDisplayLength);
}

/**
 * The API key in an Authorization header, or null when there is none. A Privy token must not
 * read as a key: the machine routes accept only keys, and the dashboard routes only tokens.
 */
export function readBearerApiKey(header: string | undefined): string | null {
  const token = header?.match(/^Bearer ([^\s]+)$/i)?.[1];
  return token?.startsWith(apiKeyPrefix) ? token : null;
}
