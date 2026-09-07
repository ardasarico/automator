import type { SecretStore } from "@automator/db";
import type { SecretsResolver } from "@automator/flow-engine";
import type { SecretsCrypto } from "./crypto";

/** Everything the resolver needs; the API builds one per run for the flow's owner. */
export interface SecretsAccess {
  secrets: SecretStore;
  crypto: SecretsCrypto;
}

/** Decrypts the owner's secrets for the names a node references, right before it runs. */
export function createSecretsResolver(
  { secrets, crypto }: SecretsAccess,
  ownerId: string,
): SecretsResolver {
  return {
    async get(names) {
      const stored = await secrets.read(ownerId, names);
      const values: Record<string, string> = {};
      for (const [name, ciphertext] of Object.entries(stored)) {
        values[name] = crypto.decrypt(ciphertext);
      }
      return values;
    },
  };
}
