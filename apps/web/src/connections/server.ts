import "server-only";
import { ApiRequestError, request } from "@automator/api-client/server";
import {
  listApiKeysContract,
  listSecretsContract,
  type ApiKeySummary,
  type SecretSummary,
} from "@automator/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "../auth/server";

/**
 * The names of the account's secrets — never their values, which the API does not return and
 * the browser never sees. An unreachable API gives `null` rather than an empty list: "we could
 * not ask" and "you have none" are different sentences on the page.
 */
export async function listSecrets(): Promise<readonly SecretSummary[] | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  const result = await request(process.env.API_URL, listSecretsContract, { token }).catch(
    (error: unknown) => {
      if (error instanceof ApiRequestError) return null;
      throw error;
    },
  );
  if (result === null) return null;
  if (result.status === 401) redirect("/login");
  return result.status === 200 ? result.data.secrets : null;
}

/**
 * The account's API keys — heads and names only, which is all the API keeps in the clear. Same
 * distinction as the secrets above: `null` means the API could not be asked.
 */
export async function listApiKeys(): Promise<readonly ApiKeySummary[] | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  const result = await request(process.env.API_URL, listApiKeysContract, { token }).catch(
    (error: unknown) => {
      if (error instanceof ApiRequestError) return null;
      throw error;
    },
  );
  if (result === null) return null;
  if (result.status === 401) redirect("/login");
  return result.status === 200 ? result.data.keys : null;
}
