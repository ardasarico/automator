import "server-only";
import { cookies } from "next/headers";

/** Server counterpart of `setPreferenceCookie`. Returns undefined when the cookie is unset. */
export async function readPreferenceCookie(name: string): Promise<string | undefined> {
  const value = (await cookies()).get(name)?.value;
  return value === undefined ? undefined : decodeURIComponent(value);
}
