import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Secrets at rest: AES-256-GCM under one key from the environment. A stored value is
 * `v1.<iv>.<tag>.<ciphertext>` in base64url, so the format can change without a migration.
 */
export interface SecretsCrypto {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

const version = "v1";

export function parseSecretsKey(encoded: string | undefined): Buffer | null {
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  return key.length === 32 ? key : null;
}

export function generateSecretsKey(): string {
  return randomBytes(32).toString("base64");
}

export class SecretFormatError extends Error {
  constructor() {
    super("Stored secret has an unknown format");
    this.name = "SecretFormatError";
  }
}

export function createSecretsCrypto(key: Buffer): SecretsCrypto {
  if (key.length !== 32) throw new Error("Secrets key must be 32 bytes");
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [version, iv, tag, body]
        .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
        .join(".");
    },
    decrypt(stored) {
      const [tag0, iv, tag, body] = stored.split(".");
      if (tag0 !== version || !iv || !tag || !body) throw new SecretFormatError();
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
