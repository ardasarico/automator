import {
  deleteSecretContract,
  isSecretName,
  listSecretsContract,
  putSecretContract,
  secretValueInputSchema,
  Type,
  Value,
} from "@automator/contracts";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import type { SecretsAccess } from "./resolver";

export interface SecretDependencies extends SecretsAccess {
  identity: IdentityProvider | undefined;
}

/**
 * The caller's secrets: names in, names out. A value is encrypted on the way in and only
 * ever decrypted inside a run of the caller's own flow; no route returns one.
 */
export function createSecretRoutes({ identity, secrets, crypto }: SecretDependencies) {
  return new Elysia({ name: "secrets" })
    .use(createAuthGuard(identity))
    .get(
      listSecretsContract.path,
      async ({ claims }) => ({ secrets: await secrets.list(claims.id) }),
      {
        response: listSecretsContract.response,
      },
    )
    .put(
      putSecretContract.path,
      async ({ claims, params, body, status }) => {
        if (!isSecretName(params.name) || !Value.Check(secretValueInputSchema, body))
          return status(400, { error: "invalid_request" });
        return secrets.put(claims.id, params.name, crypto.encrypt(body.value));
      },
      {
        params: Type.Object({ name: Type.String() }),
        body: Type.Unknown(),
        response: putSecretContract.response,
      },
    )
    .delete(
      deleteSecretContract.path,
      async ({ claims, params, status }) => {
        if (!isSecretName(params.name)) return status(400, { error: "invalid_request" });
        const removed = await secrets.remove(claims.id, params.name);
        return removed ? { name: params.name } : status(404, { error: "not_found" });
      },
      { params: Type.Object({ name: Type.String() }), response: deleteSecretContract.response },
    );
}
